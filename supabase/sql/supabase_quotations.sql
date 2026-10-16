-- Estimates & Quotations module
-- Run once in the Supabase SQL editor. Safe to run repeatedly.

create table if not exists public.quotations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  quotation_number text not null,
  quotation_date date not null default current_date,
  valid_until date,
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text not null default '',
  customer_details jsonb not null default '{}'::jsonb,
  line_items jsonb not null default '[]'::jsonb,
  subtotal numeric(12,2) not null default 0,
  total_tax numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  status text not null default 'draft' check (status in ('draft','sent','accepted','rejected','expired')),
  notes text,
  terms text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, quotation_number)
);

create index if not exists quotations_company_date_idx on public.quotations(company_id, quotation_date desc);
create index if not exists quotations_customer_idx on public.quotations(customer_id);

create or replace function public.touch_quotation_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists quotations_touch_updated on public.quotations;
create trigger quotations_touch_updated before update on public.quotations
for each row execute function public.touch_quotation_updated_at();

alter table public.quotations enable row level security;
drop policy if exists "owner quotations access" on public.quotations;
create policy "owner quotations access" on public.quotations for all
using (company_id = public.current_company_id())
with check (company_id = public.current_company_id());

grant select, insert, update, delete on public.quotations to authenticated;

-- Auditors use a deliberately narrow SECURITY DEFINER RPC because their app
-- sessions are separate from Supabase Auth. Every action is company-scoped and
-- requires the quotations permission.
create or replace function public.quotation_auditor_request(
  p_auditor_id uuid,
  p_action text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_allowed boolean;
  v_row public.quotations;
  v_rows jsonb;
  v_record jsonb := coalesce(p_payload->'record', '{}'::jsonb);
begin
  select a.company_id into v_company_id
  from public.auditors a
  where a.id = p_auditor_id and coalesce(a.is_active, true) = true;

  if v_company_id is null then
    return jsonb_build_object('success', false, 'error', 'Auditor session is invalid');
  end if;

  select exists(
    select 1 from public.auditor_permissions ap
    where ap.auditor_id = p_auditor_id
      and ap.permission_name = 'quotations'
      and case p_action
        when 'select' then ap.can_view
        when 'get' then ap.can_view
        when 'insert' then ap.can_create
        when 'update' then ap.can_edit
        when 'status' then ap.can_edit
        when 'delete' then ap.can_delete
        else false
      end
  ) into v_allowed;

  if not coalesce(v_allowed, false) then
    return jsonb_build_object('success', false, 'error', 'You do not have permission for this quotation action');
  end if;

  if p_action = 'select' then
    select coalesce(jsonb_agg(to_jsonb(q) order by q.quotation_date desc, q.created_at desc), '[]'::jsonb)
      into v_rows from public.quotations q where q.company_id = v_company_id;
    return jsonb_build_object('success', true, 'data', v_rows);

  elsif p_action = 'get' then
    select * into v_row from public.quotations
      where id = (p_payload->>'id')::uuid and company_id = v_company_id;
    if v_row.id is null then return jsonb_build_object('success', false, 'error', 'Quotation not found'); end if;
    return jsonb_build_object('success', true, 'data', to_jsonb(v_row));

  elsif p_action = 'insert' then
    insert into public.quotations (
      company_id, quotation_number, quotation_date, valid_until, customer_id,
      customer_name, customer_details, line_items, subtotal, total_tax,
      total_amount, status, notes, terms, created_by
    ) values (
      v_company_id, v_record->>'quotation_number', (v_record->>'quotation_date')::date,
      nullif(v_record->>'valid_until','')::date, nullif(v_record->>'customer_id','')::uuid,
      coalesce(v_record->>'customer_name',''), coalesce(v_record->'customer_details','{}'::jsonb),
      coalesce(v_record->'line_items','[]'::jsonb), coalesce((v_record->>'subtotal')::numeric,0),
      coalesce((v_record->>'total_tax')::numeric,0), coalesce((v_record->>'total_amount')::numeric,0),
      coalesce(v_record->>'status','draft'), nullif(v_record->>'notes',''), nullif(v_record->>'terms',''), p_auditor_id
    ) returning * into v_row;
    return jsonb_build_object('success', true, 'data', to_jsonb(v_row));

  elsif p_action = 'update' then
    update public.quotations set
      quotation_number = v_record->>'quotation_number', quotation_date = (v_record->>'quotation_date')::date,
      valid_until = nullif(v_record->>'valid_until','')::date, customer_id = nullif(v_record->>'customer_id','')::uuid,
      customer_name = coalesce(v_record->>'customer_name',''), customer_details = coalesce(v_record->'customer_details','{}'::jsonb),
      line_items = coalesce(v_record->'line_items','[]'::jsonb), subtotal = coalesce((v_record->>'subtotal')::numeric,0),
      total_tax = coalesce((v_record->>'total_tax')::numeric,0), total_amount = coalesce((v_record->>'total_amount')::numeric,0),
      status = coalesce(v_record->>'status','draft'), notes = nullif(v_record->>'notes',''), terms = nullif(v_record->>'terms','')
    where id = (p_payload->>'id')::uuid and company_id = v_company_id returning * into v_row;
    if v_row.id is null then return jsonb_build_object('success', false, 'error', 'Quotation not found'); end if;
    return jsonb_build_object('success', true, 'data', to_jsonb(v_row));

  elsif p_action = 'status' then
    update public.quotations set status = p_payload->>'status'
      where id = (p_payload->>'id')::uuid and company_id = v_company_id returning * into v_row;
    if v_row.id is null then return jsonb_build_object('success', false, 'error', 'Quotation not found'); end if;
    return jsonb_build_object('success', true, 'data', to_jsonb(v_row));

  elsif p_action = 'delete' then
    delete from public.quotations where id = (p_payload->>'id')::uuid and company_id = v_company_id returning * into v_row;
    if v_row.id is null then return jsonb_build_object('success', false, 'error', 'Quotation not found'); end if;
    return jsonb_build_object('success', true, 'data', null);
  end if;

  return jsonb_build_object('success', false, 'error', 'Unsupported action');
exception when others then
  return jsonb_build_object('success', false, 'error', sqlerrm);
end;
$$;

grant execute on function public.quotation_auditor_request(uuid, text, jsonb) to anon, authenticated;
notify pgrst, 'reload schema';
