-- GSTInvoice Pro fresh Supabase setup
-- Run this in Supabase SQL Editor after creating a new Supabase project.
-- It resets only public app objects. It does not delete auth.users.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

do $$
declare
  trigger_record record;
begin
  for trigger_record in
    select t.tgname
    from pg_trigger t
    join pg_proc p on p.oid = t.tgfoid
    join pg_namespace n on n.oid = p.pronamespace
    where t.tgrelid = 'auth.users'::regclass
      and not t.tgisinternal
      and n.nspname = 'public'
  loop
    execute format('drop trigger if exists %I on auth.users', trigger_record.tgname);
  end loop;
end;
$$;
drop function if exists public.handle_new_owner();
drop function if exists public.get_current_profile();
drop function if exists public.verify_auditor_login(text, text);
drop function if exists public.create_auditor(text, text, text, text[]);
drop function if exists public.update_auditor(uuid, text, text, text, text[]);
drop function if exists public.delete_auditor(uuid);
drop function if exists public.set_auditor_permissions(uuid, jsonb);
drop function if exists public.current_company_id();
drop function if exists public.touch_updated_at();

drop table if exists public.audit_logs cascade;
drop table if exists public.payment_vouchers cascade;
drop table if exists public.receipt_allocations cascade;
drop table if exists public.receipts cascade;
drop table if exists public.credit_note_items cascade;
drop table if exists public.credit_notes cascade;
drop table if exists public.invoice_items cascade;
drop table if exists public.invoices cascade;
drop table if exists public.items cascade;
drop table if exists public.customers cascade;
drop table if exists public.auditor_permissions cascade;
drop table if exists public.app_users cascade;
drop table if exists public.company_settings cascade;
drop table if exists public.companies cascade;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  owner_auth_user_id uuid unique references auth.users(id) on delete cascade,
  company_name text not null,
  gstin text,
  company_logo text,
  pan text,
  phone text,
  email text,
  address text,
  city text,
  state text,
  pin_code text,
  bank_name text,
  bank_account_number text,
  bank_ifsc text,
  bank_branch text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.app_users (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null,
  role text not null check (role in ('owner', 'auditor')),
  password_hash text,
  is_active boolean not null default true,
  last_login timestamptz,
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, email)
);

create table public.auditor_permissions (
  id uuid primary key default gen_random_uuid(),
  auditor_id uuid not null references public.app_users(id) on delete cascade,
  permission_name text not null,
  can_view boolean not null default true,
  can_create boolean not null default false,
  can_edit boolean not null default false,
  can_delete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(auditor_id, permission_name)
);

create table public.company_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  invoice_prefix text not null default 'INV',
  invoice_next_number integer not null default 1,
  default_due_days integer not null default 15,
  currency text not null default 'INR',
  terms text default 'Payment due within 15 days from invoice date.',
  default_gst_rate numeric(5,2) not null default 18,
  default_place_of_supply text,
  enable_reverse_charge boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  customer_type text not null default 'B2B' check (customer_type in ('B2B', 'B2C', 'SEZ', 'Export', 'Composition', 'Nil Rated', 'Exempt Supply')),
  gstin text,
  pan text,
  contact_name text,
  email text,
  phone text,
  city text,
  state text,
  address text,
  pin_code text,
  opening_balance numeric(14,2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  type text not null check (type in ('product', 'service')),
  description text,
  hsn text,
  unit text not null default 'Nos',
  selling_price numeric(14,2) not null default 0,
  purchase_price numeric(14,2) not null default 0,
  gst_rate numeric(5,2) not null default 18,
  stock numeric(14,3),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  invoice_number text not null,
  invoice_date date not null default current_date,
  due_date date,
  customer_type text,
  bill_type text,
  place_of_supply text,
  reverse_charge boolean not null default false,
  po_number text,
  po_date date,
  vehicle_number text,
  transport_mode text,
  remarks text,
  subtotal numeric(14,2) not null default 0,
  cgst numeric(14,2) not null default 0,
  sgst numeric(14,2) not null default 0,
  igst numeric(14,2) not null default 0,
  total_tax numeric(14,2) not null default 0,
  total_amount numeric(14,2) not null default 0,
  paid_amount numeric(14,2) not null default 0,
  status text not null default 'draft' check (status in ('draft', 'sent', 'pending', 'paid', 'overdue', 'cancelled')),
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, invoice_number)
);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  item_id uuid references public.items(id) on delete set null,
  item_name text not null,
  description text,
  hsn text,
  quantity numeric(14,3) not null default 1,
  unit text,
  rate numeric(14,2) not null default 0,
  discount_percent numeric(5,2) not null default 0,
  gst_rate numeric(5,2) not null default 18,
  taxable_amount numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  total_amount numeric(14,2) not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.credit_notes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  note_number text not null,
  note_type text not null default 'credit' check (note_type in ('credit', 'debit')),
  note_date date not null default current_date,
  reason text,
  subtotal numeric(14,2) not null default 0,
  total_tax numeric(14,2) not null default 0,
  total_amount numeric(14,2) not null default 0,
  status text not null default 'draft' check (status in ('draft', 'issued', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, note_number)
);

create table public.credit_note_items (
  id uuid primary key default gen_random_uuid(),
  credit_note_id uuid not null references public.credit_notes(id) on delete cascade,
  item_name text not null,
  description text,
  hsn text,
  quantity numeric(14,3) not null default 1,
  unit text,
  rate numeric(14,2) not null default 0,
  gst_rate numeric(5,2) not null default 18,
  taxable_amount numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  total_amount numeric(14,2) not null default 0
);

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  receipt_number text not null,
  receipt_date date not null default current_date,
  amount numeric(14,2) not null,
  payment_mode text,
  reference_number text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, receipt_number)
);

create table public.receipt_allocations (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts(id) on delete cascade,
  invoice_id uuid references public.invoices(id) on delete set null,
  amount numeric(14,2) not null
);

create table public.payment_vouchers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  voucher_number text not null,
  voucher_date date not null default current_date,
  payee text not null,
  category text,
  amount numeric(14,2) not null,
  payment_mode text,
  reference_number text,
  purpose text,
  notes text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'paid', 'cancelled')),
  approved_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, voucher_number)
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  user_id uuid references public.app_users(id) on delete set null,
  user_email text,
  user_role text,
  action text not null,
  resource_type text not null,
  resource_id uuid,
  resource_name text,
  details jsonb,
  created_at timestamptz not null default now()
);

create index idx_app_users_company on public.app_users(company_id);
create index idx_customers_company on public.customers(company_id);
create index idx_items_company on public.items(company_id);
create index idx_invoices_company on public.invoices(company_id);
create index idx_invoices_customer on public.invoices(customer_id);
create index idx_receipts_company on public.receipts(company_id);
create index idx_payment_vouchers_company on public.payment_vouchers(company_id);
create index idx_audit_logs_company_created on public.audit_logs(company_id, created_at desc);

create trigger companies_touch_updated before update on public.companies for each row execute function public.touch_updated_at();
create trigger app_users_touch_updated before update on public.app_users for each row execute function public.touch_updated_at();
create trigger auditor_permissions_touch_updated before update on public.auditor_permissions for each row execute function public.touch_updated_at();
create trigger company_settings_touch_updated before update on public.company_settings for each row execute function public.touch_updated_at();
create trigger customers_touch_updated before update on public.customers for each row execute function public.touch_updated_at();
create trigger items_touch_updated before update on public.items for each row execute function public.touch_updated_at();
create trigger invoices_touch_updated before update on public.invoices for each row execute function public.touch_updated_at();
create trigger credit_notes_touch_updated before update on public.credit_notes for each row execute function public.touch_updated_at();
create trigger receipts_touch_updated before update on public.receipts for each row execute function public.touch_updated_at();
create trigger payment_vouchers_touch_updated before update on public.payment_vouchers for each row execute function public.touch_updated_at();

create or replace function public.handle_new_owner()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_company_id uuid;
  v_user_id uuid;
begin
  insert into public.companies (
    owner_auth_user_id,
    company_name,
    gstin,
    pan,
    company_logo,
    phone,
    email,
    address,
    city,
    state,
    pin_code
  ) values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'company_name', ''), 'My Company'),
    nullif(new.raw_user_meta_data->>'gstin', ''),
    coalesce(nullif(new.raw_user_meta_data->>'pan', ''), case when length(coalesce(new.raw_user_meta_data->>'gstin', '')) >= 12 then substring(new.raw_user_meta_data->>'gstin' from 3 for 10) else null end),
    nullif(new.raw_user_meta_data->>'company_logo', ''),
    nullif(new.raw_user_meta_data->>'phone', ''),
    coalesce(nullif(new.email, ''), new.id::text || '@no-email.local'),
    nullif(new.raw_user_meta_data->>'address', ''),
    nullif(new.raw_user_meta_data->>'city', ''),
    nullif(new.raw_user_meta_data->>'state', ''),
    nullif(new.raw_user_meta_data->>'pin_code', '')
  )
  on conflict (owner_auth_user_id) do update
  set
    company_name = excluded.company_name,
    gstin = excluded.gstin,
    pan = excluded.pan,
    company_logo = excluded.company_logo,
    phone = excluded.phone,
    email = excluded.email,
    address = excluded.address,
    city = excluded.city,
    state = excluded.state,
    pin_code = excluded.pin_code
  returning id into v_company_id;

  insert into public.app_users (
    company_id,
    auth_user_id,
    email,
    full_name,
    role
  ) values (
    v_company_id,
    new.id,
    coalesce(nullif(new.email, ''), new.id::text || '@no-email.local'),
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), split_part(coalesce(nullif(new.email, ''), 'Owner'), '@', 1)),
    'owner'
  )
  on conflict (auth_user_id) do update
  set
    company_id = excluded.company_id,
    email = excluded.email,
    full_name = excluded.full_name,
    role = 'owner',
    is_active = true
  returning id into v_user_id;

  insert into public.company_settings (company_id)
  values (v_company_id)
  on conflict (company_id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_owner();

create or replace function public.get_current_profile()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_profile jsonb;
begin
  select jsonb_build_object(
    'id', u.id,
    'email', u.email,
    'full_name', u.full_name,
    'role', u.role,
    'company_id', c.id,
    'company_name', c.company_name,
    'company_gstin', c.gstin,
    'company_logo', c.company_logo,
    'is_active', u.is_active
  )
  into v_profile
  from public.app_users u
  join public.companies c on c.id = u.company_id
  where u.auth_user_id = auth.uid()
    and u.role = 'owner'
    and u.is_active = true
    and c.is_active = true;

  if v_profile is null then
    return jsonb_build_object('success', false, 'error', 'Profile not found');
  end if;

  return jsonb_build_object('success', true, 'profile', v_profile);
end;
$$;

create or replace function public.verify_auditor_login(p_email text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_auditor public.app_users;
  v_permissions jsonb;
begin
  select *
  into v_auditor
  from public.app_users
  where lower(email) = lower(p_email)
    and role = 'auditor'
    and is_active = true
    and password_hash = crypt(p_password, password_hash)
  limit 1;

  if v_auditor.id is null then
    return jsonb_build_object('success', false, 'error', 'Invalid email or password');
  end if;

  update public.app_users
  set last_login = now()
  where id = v_auditor.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'permission_name', permission_name,
    'can_view', can_view,
    'can_create', can_create,
    'can_edit', can_edit,
    'can_delete', can_delete
  )), '[]'::jsonb)
  into v_permissions
  from public.auditor_permissions
  where auditor_id = v_auditor.id;

  return jsonb_build_object(
    'success', true,
    'auditor', jsonb_build_object(
      'id', v_auditor.id,
      'email', v_auditor.email,
      'full_name', v_auditor.full_name,
      'role', v_auditor.role,
      'company_id', v_auditor.company_id,
      'company_name', (select company_name from public.companies where id = v_auditor.company_id),
      'company_gstin', (select gstin from public.companies where id = v_auditor.company_id),
      'company_logo', (select company_logo from public.companies where id = v_auditor.company_id),
      'permissions', v_permissions
    )
  );
end;
$$;

create or replace function public.current_company_id()
returns uuid
language sql
security definer
set search_path = public, extensions
stable
as $$
  select company_id
  from public.app_users
  where auth_user_id = auth.uid()
    and role = 'owner'
    and is_active = true
  limit 1
$$;

create or replace function public.create_auditor(
  p_full_name text,
  p_email text,
  p_password text,
  p_permissions text[] default array[]::text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_company_id uuid;
  v_owner_id uuid;
  v_auditor_id uuid;
  v_permission text;
begin
  select id, company_id
  into v_owner_id, v_company_id
  from public.app_users
  where auth_user_id = auth.uid()
    and role = 'owner'
    and is_active = true
  limit 1;

  if v_company_id is null then
    return jsonb_build_object('success', false, 'error', 'Only an active owner can create auditors');
  end if;

  insert into public.app_users (
    company_id,
    email,
    full_name,
    role,
    password_hash,
    created_by
  ) values (
    v_company_id,
    lower(p_email),
    p_full_name,
    'auditor',
    crypt(p_password, gen_salt('bf')),
    v_owner_id
  )
  returning id into v_auditor_id;

  foreach v_permission in array p_permissions loop
    insert into public.auditor_permissions (
      auditor_id,
      permission_name,
      can_view,
      can_create,
      can_edit,
      can_delete
    ) values (
      v_auditor_id,
      v_permission,
      true,
      true,
      true,
      false
    )
    on conflict (auditor_id, permission_name) do nothing;
  end loop;

  return jsonb_build_object('success', true, 'auditor_id', v_auditor_id);
exception
  when unique_violation then
    return jsonb_build_object('success', false, 'error', 'An auditor with this email already exists');
end;
$$;

create or replace function public.update_auditor(
  p_auditor_id uuid,
  p_full_name text,
  p_email text,
  p_password text default null,
  p_permissions text[] default array[]::text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_company_id uuid;
  v_permission text;
begin
  v_company_id := public.current_company_id();

  if v_company_id is null then
    return jsonb_build_object('success', false, 'error', 'Only an active owner can update auditors');
  end if;

  update public.app_users
  set
    full_name = p_full_name,
    email = lower(p_email),
    password_hash = case
      when nullif(p_password, '') is null then password_hash
      else crypt(p_password, gen_salt('bf'))
    end
  where id = p_auditor_id
    and company_id = v_company_id
    and role = 'auditor';

  delete from public.auditor_permissions
  where auditor_id = p_auditor_id;

  foreach v_permission in array p_permissions loop
    insert into public.auditor_permissions (
      auditor_id,
      permission_name,
      can_view,
      can_create,
      can_edit,
      can_delete
    ) values (
      p_auditor_id,
      v_permission,
      true,
      true,
      true,
      false
    );
  end loop;

  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.delete_auditor(p_auditor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  delete from public.app_users
  where id = p_auditor_id
    and company_id = public.current_company_id()
    and role = 'auditor';

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.get_current_profile() to authenticated;
grant execute on function public.verify_auditor_login(text, text) to anon, authenticated;
grant execute on function public.create_auditor(text, text, text, text[]) to authenticated;
grant execute on function public.update_auditor(uuid, text, text, text, text[]) to authenticated;
grant execute on function public.delete_auditor(uuid) to authenticated;

alter table public.companies enable row level security;
alter table public.app_users enable row level security;
alter table public.auditor_permissions enable row level security;
alter table public.company_settings enable row level security;
alter table public.customers enable row level security;
alter table public.items enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.credit_notes enable row level security;
alter table public.credit_note_items enable row level security;
alter table public.receipts enable row level security;
alter table public.receipt_allocations enable row level security;
alter table public.payment_vouchers enable row level security;
alter table public.audit_logs enable row level security;

create policy "owner company access" on public.companies
  for all using (id = public.current_company_id())
  with check (id = public.current_company_id());

create policy "owner app users access" on public.app_users
  for all using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

create policy "owner auditor permissions access" on public.auditor_permissions
  for all using (
    exists (
      select 1 from public.app_users u
      where u.id = auditor_id and u.company_id = public.current_company_id()
    )
  )
  with check (
    exists (
      select 1 from public.app_users u
      where u.id = auditor_id and u.company_id = public.current_company_id()
    )
  );

create policy "owner company settings access" on public.company_settings
  for all using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

create policy "owner customers access" on public.customers
  for all using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

create policy "owner items access" on public.items
  for all using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

create policy "owner invoices access" on public.invoices
  for all using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

create policy "owner invoice items access" on public.invoice_items
  for all using (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_id and i.company_id = public.current_company_id()
    )
  )
  with check (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_id and i.company_id = public.current_company_id()
    )
  );

create policy "owner credit notes access" on public.credit_notes
  for all using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

create policy "owner credit note items access" on public.credit_note_items
  for all using (
    exists (
      select 1 from public.credit_notes cn
      where cn.id = credit_note_id and cn.company_id = public.current_company_id()
    )
  )
  with check (
    exists (
      select 1 from public.credit_notes cn
      where cn.id = credit_note_id and cn.company_id = public.current_company_id()
    )
  );

create policy "owner receipts access" on public.receipts
  for all using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

create policy "owner receipt allocations access" on public.receipt_allocations
  for all using (
    exists (
      select 1 from public.receipts r
      where r.id = receipt_id and r.company_id = public.current_company_id()
    )
  )
  with check (
    exists (
      select 1 from public.receipts r
      where r.id = receipt_id and r.company_id = public.current_company_id()
    )
  );

create policy "owner payment vouchers access" on public.payment_vouchers
  for all using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

create policy "owner audit logs access" on public.audit_logs
  for select using (company_id = public.current_company_id());
