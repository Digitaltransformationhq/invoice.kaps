-- ============================================================================
-- Auditor multi-company login
-- ============================================================================
-- Lets one auditor email work across multiple owners. The schema already
-- supports this (auditors has unique(company_id, email), not unique(email)),
-- so we only need two new RPCs to drive a two-stage login:
--
--   1. auditor_list_companies(email)         -- pick stage
--   2. verify_auditor_login_by_id(id, pwd)   -- password stage
--
-- The original verify_auditor_login(email, password) stays in place for
-- single-company auditors (and for backward compatibility).
--
-- Safe to re-run.
-- ============================================================================

begin;

-- 1. List the companies a given email is registered as an auditor for ---------
create or replace function public.auditor_list_companies(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_companies jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'auditor_id',   a.id,
    'company_id',   a.company_id,
    'company_name', c.company_name,
    'company_logo', c.company_logo,
    'full_name',    a.full_name
  ) order by c.company_name), '[]'::jsonb)
  into v_companies
  from public.auditors a
  join public.companies c on c.id = a.company_id
  where lower(a.email) = lower(p_email)
    and a.is_active = true;

  return jsonb_build_object(
    'success',   true,
    'companies', v_companies
  );
end;
$$;

-- 2. Verify password for a specific auditor row -------------------------------
create or replace function public.verify_auditor_login_by_id(
  p_auditor_id uuid,
  p_password   text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_auditor public.auditors;
  v_permissions jsonb;
begin
  select *
  into v_auditor
  from public.auditors
  where id = p_auditor_id
    and is_active = true
    and password_hash = crypt(p_password, password_hash)
  limit 1;

  if v_auditor.id is null then
    return jsonb_build_object('success', false, 'error', 'Invalid password');
  end if;

  update public.auditors set last_login = now() where id = v_auditor.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'permission_name', permission_name,
    'can_view',   can_view,
    'can_create', can_create,
    'can_edit',   can_edit,
    'can_delete', can_delete
  )), '[]'::jsonb)
  into v_permissions
  from public.auditor_permissions
  where auditor_id = v_auditor.id;

  return jsonb_build_object(
    'success', true,
    'auditor', jsonb_build_object(
      'id',           v_auditor.id,
      'email',        v_auditor.email,
      'full_name',    v_auditor.full_name,
      'role',         'auditor',
      'company_id',   v_auditor.company_id,
      'company_name', (select company_name from public.companies where id = v_auditor.company_id),
      'company_gstin',(select gstin        from public.companies where id = v_auditor.company_id),
      'company_logo', (select company_logo from public.companies where id = v_auditor.company_id),
      'permissions',  v_permissions
    )
  );
end;
$$;

grant execute on function public.auditor_list_companies(text)               to anon, authenticated;
grant execute on function public.verify_auditor_login_by_id(uuid, text)     to anon, authenticated;

commit;
