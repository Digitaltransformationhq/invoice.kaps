-- Password-reset gate for the send-password-reset Edge Function.
--
-- The function sends reset emails itself (through AWS SES) instead of relying on
-- Supabase's built-in mailer, which only delivers to the project's team members.
-- Before it mints a recovery token it asks this function two things:
--   1. Does an active Supabase Auth account exist for this email?
--   2. How many seconds are left before another reset may be sent? (60 s cooldown,
--      based on auth.users.recovery_sent_at, which generate_link updates)
--
-- No rows back = no such account (the function then reports success without
-- sending anything, so the screen can't be used to probe for registered emails).
--
-- service_role only: anon/authenticated must never be able to call this.
-- Run once in the Supabase SQL editor. Safe to re-run.

create or replace function public.password_reset_gate(p_email text)
returns table (user_id uuid, email text, wait_seconds integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    u.id,
    u.email::text,
    greatest(
      0,
      ceil(60 - extract(epoch from (now() - u.recovery_sent_at)))
    )::integer
  from auth.users u
  where lower(u.email) = lower(trim(p_email))
    and u.deleted_at is null
    and (u.banned_until is null or u.banned_until < now())
  limit 1;
$$;

revoke all on function public.password_reset_gate(text) from public;
revoke all on function public.password_reset_gate(text) from anon, authenticated;
grant execute on function public.password_reset_gate(text) to service_role;
