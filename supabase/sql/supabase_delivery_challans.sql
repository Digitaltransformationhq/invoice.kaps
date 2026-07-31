-- ============================================================================
-- Delivery Challans (Rule 55, CGST Rules 2017)
-- ============================================================================
-- HOW TO RUN: Supabase Dashboard -> SQL Editor -> New query -> paste this WHOLE
-- file -> Run. Safe to re-run.
--
-- This version is intentionally NOT wrapped in a single begin/commit, so the
-- tables are created and persist immediately; if a later step ever errored it
-- could not roll the tables back out. The final SELECT prints the new table as
-- confirmation — you should see a one-row result at the bottom.
--
-- A delivery challan moves goods WITHOUT a tax invoice (job work, branch
-- transfer, sale on approval, quantity-not-known, or lot/SKD-CKD supply against
-- an invoice under Rule 55(5)).
--
-- IMPORTANT: auditors reach data through auditor_data_request(); its challan
-- branches already ship in the auditor SQL files you have run. Owners work with
-- just this file.
-- ============================================================================

-- 1. Tables --------------------------------------------------------------------

create table if not exists public.delivery_challans (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  -- Nullable: a job worker is not a customer, and an 'other_than_supply' branch
  -- transfer goes to your own premises. The consignee_* snapshot is what prints.
  customer_id uuid references public.customers(id) on delete set null,
  consignee_name text not null,
  consignee_gstin text,
  consignee_address text,
  consignee_state text,
  -- Both directions, disambiguated by purpose: the parent invoice for lot_supply,
  -- the invoice raised later for approval / quantity_unknown.
  invoice_id uuid references public.invoices(id) on delete set null,
  challan_number text not null,
  challan_date date not null default current_date,
  purpose text not null check (purpose in (
    'lot_supply', 'quantity_unknown', 'job_work', 'approval', 'other_than_supply'
  )),
  ship_to_address text,
  place_of_supply text,
  is_final_consignment boolean not null default false,
  expected_return_date date,
  reason text,
  transport_mode text,
  vehicle_number text,
  transporter_name text,
  lr_number text,
  eway_bill_number text,
  subtotal numeric(14,2) not null default 0,
  cgst numeric(14,2) not null default 0,
  sgst numeric(14,2) not null default 0,
  igst numeric(14,2) not null default 0,
  total_tax numeric(14,2) not null default 0,
  total_amount numeric(14,2) not null default 0,
  notes text,
  status text not null default 'draft' check (status in ('draft', 'issued', 'cancelled')),
  -- Plain uuid, no FK: an owner (app_users) or an auditor (auditors) may create it.
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, challan_number)
);

create table if not exists public.delivery_challan_items (
  id uuid primary key default gen_random_uuid(),
  delivery_challan_id uuid not null references public.delivery_challans(id) on delete cascade,
  -- Drives remaining-quantity tracking for Rule 55(5) consignments.
  invoice_item_id uuid references public.invoice_items(id) on delete set null,
  item_id uuid references public.items(id) on delete set null,
  item_name text not null,
  description text,
  hsn text,
  quantity numeric(14,3) not null default 1,
  is_provisional_quantity boolean not null default false,
  unit text,
  rate numeric(14,2) not null default 0,
  discount_percent numeric(5,2) not null default 0,
  gst_rate numeric(5,2) not null default 0,
  taxable_amount numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  total_amount numeric(14,2) not null default 0,
  sort_order int not null default 0
);

-- 2. updated_at trigger ---------------------------------------------------------
-- Guarded: if touch_updated_at() is somehow absent, the tables still stand and
-- only auto-updated_at is skipped, rather than failing the whole script.

do $$
begin
  if exists (select 1 from pg_proc where proname = 'touch_updated_at') then
    drop trigger if exists delivery_challans_touch_updated on public.delivery_challans;
    create trigger delivery_challans_touch_updated
      before update on public.delivery_challans
      for each row execute function public.touch_updated_at();
  end if;
end $$;

-- 3. Indexes --------------------------------------------------------------------

create index if not exists idx_delivery_challans_company
  on public.delivery_challans(company_id);
create index if not exists idx_delivery_challans_invoice
  on public.delivery_challans(invoice_id) where invoice_id is not null;
create index if not exists idx_delivery_challan_items_challan
  on public.delivery_challan_items(delivery_challan_id);
create index if not exists idx_delivery_challan_items_invoice_item
  on public.delivery_challan_items(invoice_item_id) where invoice_item_id is not null;

-- 4. Row-level security ---------------------------------------------------------

alter table public.delivery_challans enable row level security;
alter table public.delivery_challan_items enable row level security;

drop policy if exists "owner delivery challans access" on public.delivery_challans;
create policy "owner delivery challans access" on public.delivery_challans
  for all
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

drop policy if exists "owner delivery challan items access" on public.delivery_challan_items;
create policy "owner delivery challan items access" on public.delivery_challan_items
  for all
  using (
    exists (
      select 1 from public.delivery_challans dc
      where dc.id = delivery_challan_id and dc.company_id = public.current_company_id()
    )
  )
  with check (
    exists (
      select 1 from public.delivery_challans dc
      where dc.id = delivery_challan_id and dc.company_id = public.current_company_id()
    )
  );

-- 5. Tell PostgREST (the API the app uses) to pick up the new tables now, so the
--    app stops erroring "Could not find the table 'public.delivery_challans' in
--    the schema cache".
notify pgrst, 'reload schema';

-- 6. Confirmation: this should return ONE row describing the new table. If you
--    see it, the migration worked.
select table_name, (select count(*) from public.delivery_challans) as row_count
from information_schema.tables
where table_schema = 'public' and table_name = 'delivery_challans';
