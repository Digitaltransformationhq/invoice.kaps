-- ============================================================================
-- Bifurcation migration: split credit/debit notes into separate tables
-- ============================================================================
-- Run this once in the Supabase SQL editor.
--
-- What it does:
--   1. Creates `debit_notes` and `debit_note_items` (mirror of credit tables)
--   2. Moves any existing debit-type rows from credit_notes → debit_notes
--   3. Drops the now-redundant `note_type` column from credit_notes
--   4. Enables RLS + adds owner policies on the new tables
--   5. Re-uses the existing touch_updated_at trigger function
--
-- It is safe to re-run (every step guards against existing state).
-- ============================================================================

begin;

-- 1. New tables ----------------------------------------------------------------

create table if not exists public.debit_notes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  note_number text not null,
  note_date date not null default current_date,
  reason text,
  subtotal numeric(14,2) not null default 0,
  total_tax numeric(14,2) not null default 0,
  total_amount numeric(14,2) not null default 0,
  status text not null default 'draft' check (status in ('draft', 'issued', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, note_number)
);

create table if not exists public.debit_note_items (
  id uuid primary key default gen_random_uuid(),
  debit_note_id uuid not null references public.debit_notes(id) on delete cascade,
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

-- 2. updated_at trigger --------------------------------------------------------

drop trigger if exists debit_notes_touch_updated on public.debit_notes;
create trigger debit_notes_touch_updated
  before update on public.debit_notes
  for each row execute function public.touch_updated_at();

-- 3. Migrate existing debit rows (only if note_type column still exists) -------

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'credit_notes'
      and column_name = 'note_type'
  ) then
    -- Notes
    insert into public.debit_notes (
      id, company_id, customer_id, invoice_id, note_number, note_date, reason,
      subtotal, total_tax, total_amount, status, created_at, updated_at
    )
    select
      id, company_id, customer_id, invoice_id, note_number, note_date, reason,
      subtotal, total_tax, total_amount, status, created_at, updated_at
    from public.credit_notes
    where note_type = 'debit'
    on conflict (company_id, note_number) do nothing;

    -- Items
    insert into public.debit_note_items (
      id, debit_note_id, item_name, description, hsn, quantity, unit, rate,
      gst_rate, taxable_amount, tax_amount, total_amount
    )
    select
      cni.id, cni.credit_note_id, cni.item_name, cni.description, cni.hsn,
      cni.quantity, cni.unit, cni.rate, cni.gst_rate, cni.taxable_amount,
      cni.tax_amount, cni.total_amount
    from public.credit_note_items cni
    join public.credit_notes cn on cn.id = cni.credit_note_id
    where cn.note_type = 'debit'
    on conflict (id) do nothing;

    -- Remove migrated rows from the credit tables
    delete from public.credit_note_items
    where credit_note_id in (select id from public.credit_notes where note_type = 'debit');

    delete from public.credit_notes where note_type = 'debit';

    -- Drop the now-redundant discriminator column
    alter table public.credit_notes drop column note_type;
  end if;
end $$;

-- 4. RLS ----------------------------------------------------------------------

alter table public.debit_notes enable row level security;
alter table public.debit_note_items enable row level security;

drop policy if exists "owner debit notes access" on public.debit_notes;
create policy "owner debit notes access" on public.debit_notes
  for all
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

drop policy if exists "owner debit note items access" on public.debit_note_items;
create policy "owner debit note items access" on public.debit_note_items
  for all
  using (
    exists (
      select 1 from public.debit_notes dn
      where dn.id = debit_note_id and dn.company_id = public.current_company_id()
    )
  )
  with check (
    exists (
      select 1 from public.debit_notes dn
      where dn.id = debit_note_id and dn.company_id = public.current_company_id()
    )
  );

commit;
