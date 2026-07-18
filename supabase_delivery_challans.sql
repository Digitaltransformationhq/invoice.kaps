-- ============================================================================
-- Delivery Challans (Rule 55, CGST Rules 2017)
-- ============================================================================
-- Run this once in the Supabase SQL editor.
--
-- A delivery challan moves goods WITHOUT a tax invoice. Rule 55(1) permits it
-- for: liquid gas where the quantity at removal is not known, transport for job
-- work, transport for reasons other than supply, and notified cases. Rule 55(5)
-- additionally covers goods supplied in a semi/completely-knocked-down state or
-- in batches — there the complete invoice is issued BEFORE the first consignment
-- and each consignment travels on a challan referencing that invoice.
--
-- What it does:
--   1. Creates `delivery_challans` and `delivery_challan_items`
--   2. Adds the updated_at trigger
--   3. Enables RLS + owner policies (company scope; items via their parent)
--   4. Adds indexes for the dispatch tracker
--
-- Safe to re-run.
--
-- IMPORTANT: auditors reach data through auditor_data_request(), which needs a
-- branch per resource. Re-run whichever auditor file you deployed AFTER this:
--     supabase_auditor_pgcrypto_fix.sql
--   (or supabase/auditors_bifurcation_migration.sql)
-- Without it auditors get 'Unsupported resource request' on every challan.
-- ============================================================================

begin;

-- 1. Tables --------------------------------------------------------------------

create table if not exists public.delivery_challans (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,

  -- The consignee. `customer_id` is NULLABLE on purpose: a job worker is not a
  -- customer, and an 'other_than_supply' branch transfer goes to your own
  -- premises. Forcing either into public.customers would corrupt the customer
  -- list and every report that counts customers. Selecting a customer prefills
  -- the consignee_* columns; they remain the source of truth for what printed,
  -- so editing a customer later never restates an issued challan.
  customer_id uuid references public.customers(id) on delete set null,
  consignee_name text not null,
  consignee_gstin text,                 -- Rule 55(2)(iii): "if registered" — nullable
  consignee_address text,
  consignee_state text,                 -- drives inter-state → IGST + place of supply

  -- The invoice this challan relates to. Carries BOTH directions, disambiguated
  -- by `purpose`:
  --   * lot_supply       → the parent invoice, set when the challan is created
  --                        (Rule 55(5)(a): invoice precedes the first consignment)
  --   * approval /
  --     quantity_unknown → the invoice raised LATER, set on conversion
  --   * job_work /
  --     other_than_supply→ always null (never a supply)
  invoice_id uuid references public.invoices(id) on delete set null,

  challan_number text not null,         -- Rule 55(2)(i)
  challan_date date not null default current_date,

  -- Rule 55(1) + 55(5). Drives whether tax prints, whether an invoice link is
  -- required, and which fields below apply.
  purpose text not null check (purpose in (
    'lot_supply',         -- 55(5)    SKD/CKD or batch supply against an invoice
    'quantity_unknown',   -- 55(1)(a) liquid gas, quantity unknown at removal
    'job_work',           -- 55(1)(b)
    'approval',           -- 55(1)(c) sale on approval, s.31(7)
    'other_than_supply'   -- 55(1)(c) branch transfer, repair, exhibition, demo
  )),

  ship_to_address text,                 -- where goods land, if not consignee_address
  place_of_supply text,                 -- Rule 55(2)(viii), inter-state movement

  -- Rule 55(5)(d): the ORIGINAL invoice travels with the last consignment.
  is_final_consignment boolean not null default false,
  -- job_work: s.143 wants inputs back in 1 year, capital goods in 3.
  -- approval: s.31(7) invoice is due at supply or 6 months from removal,
  --           whichever is EARLIER — so this is a deadline, not a hint.
  expected_return_date date,
  reason text,                          -- other_than_supply: why goods are moving

  transport_mode text,
  vehicle_number text,
  transporter_name text,
  lr_number text,
  eway_bill_number text,                -- Rule 55(4)/138. Typed in; not generated.

  -- Rule 55(2)(vi) taxable value, and (vii) tax — the latter only populated when
  -- the movement is a supply to the consignee (lot_supply, quantity_unknown).
  -- Stored rather than derived at render (unlike credit_notes): a challan is a
  -- transport document that gets inspected, so a reprint must show the tax it
  -- was ISSUED with, not whatever today's state config would compute.
  subtotal numeric(14,2) not null default 0,
  cgst numeric(14,2) not null default 0,
  sgst numeric(14,2) not null default 0,
  igst numeric(14,2) not null default 0,
  total_tax numeric(14,2) not null default 0,
  total_amount numeric(14,2) not null default 0,

  notes text,
  -- No 'edited' path once issued: there is no provision to amend a challan that
  -- has already travelled with goods. Correction = cancel + reissue.
  status text not null default 'draft' check (status in ('draft', 'issued', 'cancelled')),
  -- Deliberately a plain uuid with NO foreign key: a challan can be created by
  -- an owner (public.app_users) or an auditor (public.auditors), and those live
  -- in different tables since the bifurcation. This mirrors what that migration
  -- did to audit_logs.user_id for exactly the same reason.
  --
  -- invoices.created_by still carries `references public.app_users(id)` and was
  -- missed by that migration, so auditor-created invoices violate the FK. Do not
  -- copy it here.
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, challan_number)
);

create table if not exists public.delivery_challan_items (
  id uuid primary key default gen_random_uuid(),
  delivery_challan_id uuid not null references public.delivery_challans(id) on delete cascade,

  -- Which invoice line this consignment draws down. Only set for lot_supply.
  -- This is what makes remaining-quantity tracking possible:
  --   remaining = invoice_items.quantity - sum(dispatched on non-cancelled challans)
  invoice_item_id uuid references public.invoice_items(id) on delete set null,
  item_id uuid references public.items(id) on delete set null,

  item_name text not null,              -- Rule 55(2)(iv) description
  description text,
  hsn text,                             -- Rule 55(2)(iv) HSN
  quantity numeric(14,3) not null default 1,
  -- Rule 55(2)(v): quantity may be provisional where the exact amount is not
  -- known at removal — the whole point of a 'quantity_unknown' challan.
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

drop trigger if exists delivery_challans_touch_updated on public.delivery_challans;
create trigger delivery_challans_touch_updated
  before update on public.delivery_challans
  for each row execute function public.touch_updated_at();

-- 3. Indexes --------------------------------------------------------------------

create index if not exists idx_delivery_challans_company
  on public.delivery_challans(company_id);
-- The dispatch tracker asks "what has been sent against this invoice?" on every
-- invoice view, so this one carries real traffic.
create index if not exists idx_delivery_challans_invoice
  on public.delivery_challans(invoice_id) where invoice_id is not null;
create index if not exists idx_delivery_challan_items_challan
  on public.delivery_challan_items(delivery_challan_id);
create index if not exists idx_delivery_challan_items_invoice_item
  on public.delivery_challan_items(invoice_item_id) where invoice_item_id is not null;

-- 4. RLS ------------------------------------------------------------------------

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

commit;
