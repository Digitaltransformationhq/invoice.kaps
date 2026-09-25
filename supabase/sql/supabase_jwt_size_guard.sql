-- ============================================================================
-- PERMANENT FIX: "REQUEST_HEADER_TOO_LARGE" on login (any user, any time)
-- ----------------------------------------------------------------------------
-- Root cause: Supabase copies auth.users.raw_user_meta_data into every access
-- token (JWT). Signup used to put the base64 company logo there, so the token
-- grew to ~100 KB and every request carrying it ("Authorization: Bearer ...")
-- was refused by the hosting edge before it reached the server.
--
-- Why it kept coming back: the strip lived inside public.handle_new_owner(),
-- and several scripts (supabase_signup_repair.sql, supabase_fresh_start.sql,
-- supabase_setup*.sql) redefine that function WITHOUT the strip and drop every
-- public-schema trigger on auth.users. Running any of them silently undid the
-- fix, and the next signup with a logo produced another locked-out account.
--
-- This file installs a guard that none of those scripts can remove:
--   * It lives in its own schema (auth_guard). The repair scripts only drop
--     auth.users triggers whose function is in `public`, so it survives them.
--   * It is a BEFORE INSERT OR UPDATE trigger, so auth metadata can never be
--     stored fat in the first place — whatever the client sends, whatever
--     version of handle_new_owner is installed.
--   * The logo is not lost: it is moved into public.companies.company_logo,
--     which is where the app reads it from.
--   * Any other metadata value over 2 KB is dropped too, so no future field can
--     re-create the problem.
--
-- HOW TO RUN: Supabase Dashboard -> SQL Editor -> paste this whole file -> Run.
-- Safe to run more than once. Affected users can sign in immediately after.
-- ============================================================================

create schema if not exists auth_guard;
revoke all on schema auth_guard from public;
revoke all on schema auth_guard from anon, authenticated;

-- A logo that arrives with a brand-new signup cannot be written to
-- public.companies yet (handle_new_owner creates that row AFTER the insert), so
-- it is parked here and applied by the AFTER trigger below.
create table if not exists auth_guard.pending_company_logos (
  auth_user_id uuid primary key,
  company_logo text not null,
  created_at timestamptz not null default now()
);
revoke all on auth_guard.pending_company_logos from public;
revoke all on auth_guard.pending_company_logos from anon, authenticated;

-- Copies a parked logo into the owner's company (only if it has none yet).
create or replace function auth_guard.apply_pending_company_logo(p_auth_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_logo text;
begin
  select company_logo into v_logo
  from auth_guard.pending_company_logos
  where auth_user_id = p_auth_user_id;

  if v_logo is null then
    return;
  end if;

  update public.companies
  set company_logo = v_logo
  where owner_auth_user_id = p_auth_user_id
    and coalesce(company_logo, '') = '';

  -- Keep the parked logo until a company row exists to receive it.
  if exists (select 1 from public.companies where owner_auth_user_id = p_auth_user_id) then
    delete from auth_guard.pending_company_logos where auth_user_id = p_auth_user_id;
  end if;
end;
$$;

-- BEFORE trigger: keeps raw_user_meta_data small on every write.
create or replace function auth_guard.slim_user_metadata()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_logo text;
  v_key text;
begin
  if new.raw_user_meta_data is null or jsonb_typeof(new.raw_user_meta_data) <> 'object' then
    return new;
  end if;

  v_logo := nullif(new.raw_user_meta_data->>'company_logo', '');

  if v_logo is not null then
    if tg_op = 'UPDATE' then
      update public.companies
      set company_logo = v_logo
      where owner_auth_user_id = new.id
        and coalesce(company_logo, '') = '';
    end if;

    if tg_op = 'INSERT'
       or not exists (select 1 from public.companies where owner_auth_user_id = new.id) then
      insert into auth_guard.pending_company_logos (auth_user_id, company_logo)
      values (new.id, v_logo)
      on conflict (auth_user_id) do update
      set company_logo = excluded.company_logo,
          created_at = now();
    end if;
  end if;

  new.raw_user_meta_data := new.raw_user_meta_data - 'company_logo';

  -- Nothing that belongs in a token is this large. Drop any oversized value so
  -- a future field can't bloat the JWT the same way.
  for v_key in
    select key
    from jsonb_each(new.raw_user_meta_data)
    where length(value::text) > 2048
  loop
    new.raw_user_meta_data := new.raw_user_meta_data - v_key;
  end loop;

  -- GoTrue updates auth.users on every sign-in, so this also flushes a logo
  -- parked at signup if the AFTER trigger could not place it at the time.
  if tg_op = 'UPDATE' then
    perform auth_guard.apply_pending_company_logo(new.id);
  end if;

  return new;
end;
$$;

-- AFTER INSERT trigger: runs after on_auth_user_created (triggers fire in name
-- order, and "zz_" sorts last), when the company row exists.
create or replace function auth_guard.after_signup_apply_logo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform auth_guard.apply_pending_company_logo(new.id);
  return null;
end;
$$;

revoke all on function auth_guard.apply_pending_company_logo(uuid) from public, anon, authenticated;
revoke all on function auth_guard.slim_user_metadata() from public, anon, authenticated;
revoke all on function auth_guard.after_signup_apply_logo() from public, anon, authenticated;

drop trigger if exists aa_slim_user_metadata on auth.users;
create trigger aa_slim_user_metadata
before insert or update on auth.users
for each row execute function auth_guard.slim_user_metadata();

drop trigger if exists zz_apply_pending_company_logo on auth.users;
create trigger zz_apply_pending_company_logo
after insert on auth.users
for each row execute function auth_guard.after_signup_apply_logo();

-- ----------------------------------------------------------------------------
-- One-off repair of accounts that are already bloated. Touching the row fires
-- the guard, which moves the logo into public.companies and slims the metadata.
-- ----------------------------------------------------------------------------
update auth.users
set raw_user_meta_data = raw_user_meta_data
where raw_user_meta_data ? 'company_logo'
   or length(raw_user_meta_data::text) > 4096;

-- Verify: both should return 0 rows.
select id, email, length(raw_user_meta_data::text) as metadata_bytes
from auth.users
where raw_user_meta_data ? 'company_logo'
   or length(raw_user_meta_data::text) > 4096;

select auth_user_id from auth_guard.pending_company_logos;
