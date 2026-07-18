# Delivery Challans — implementation plan

Status: **agreed — building in the §8 order**

Scope: all five Rule 55 purposes; invoice link with remaining-quantity tracking.

The §10 open questions were settled as "whatever is legal, recommended and easy to use":

1. **Numbering** — no new `company_settings` columns. Derive from the **highest challan number
   issued** and keep the field editable. A migrating user types `DC-2025-26-501` once and the
   next challan continues at 502 by itself. Same result as the invoice start-number setting,
   without a third RPC signature change across five drifted .sql files.
2. **Consignee** — snapshot columns (§3.1). A job worker is not a customer and a branch
   transfer goes to your own premises; neither belongs in the customer list.
3. **Approval deadline** — flagged loudly. Missing the s.31(7) six-month deadline is a
   compliance breach, not a reminder.
4. **One challan, one invoice** — single `invoice_id`, per Rule 55(5).
5. **Editing** — `draft` is fully editable. Once `issued`, **cancel and reissue only**: there is
   no provision to amend a challan that has already travelled with the goods, so an edit button
   would quietly produce an illegal document.

---

## 1. What the law fixes for us

Delivery challans are governed by **Rule 55, CGST Rules 2017**. The rule decides most of
the design, so it is worth being precise about which clause drives which field.

| Clause | Requirement | Where it lands |
|---|---|---|
| 55(1) | The four permitted cases a challan may be issued for | `purpose` column |
| 55(2)(i) | Date and number | `challan_number`, `challan_date` |
| 55(2)(ii) | Consigner name/address/GSTIN | Company profile |
| 55(2)(iii) | Consignee name/address/GSTIN | `consignee_*` (see §3.1) |
| 55(2)(iv) | HSN code and description | item lines |
| 55(2)(v) | Quantity — **provisional where exact not known** | `quantity`, `is_provisional_quantity` |
| 55(2)(vi) | Taxable value | `subtotal`, line `taxable_amount` |
| 55(2)(vii) | Tax rate + amount **only where transportation is for supply to the consignee** | see §2 |
| 55(2)(viii) | Place of supply, for inter-state movement | `place_of_supply` |
| 55(2)(ix) | Signature | e-sign from company profile (as on invoices) |
| 55(3) | **Triplicate**: Original→Consignee, Duplicate→Transporter, Triplicate→Consigner | preview copies |
| 55(4) | Movement on challan must be declared per Rule 138 (e-way bill) | `eway_bill_number` (manual, see §9) |
| 55(5) | SKD/CKD and lot/batch supply against an invoice | §4 |

Clause **55(2)(vii)** is the important one: tax is shown *only* when the movement is a supply
to the consignee. A job-work challan shows taxable value and no tax. This is not cosmetic —
showing tax on a job-work challan misrepresents a non-supply as a supply.

---

## 2. The five purposes

`purpose` is a single required field, chosen first on the form, and it drives everything else:
whether tax prints, whether an invoice link is required, and which extra fields appear.

| `purpose` | Rule | Tax on challan | Invoice link | Direction |
|---|---|---|---|---|
| `lot_supply` | 55(5) | **Yes** | **Required** | Invoice → challan |
| `quantity_unknown` | 55(1)(a) | **Yes** | Optional, later | Challan → invoice |
| `job_work` | 55(1)(b) | No | None | Standalone |
| `approval` | 55(1)(c), s.31(7) | No | Optional, later | Challan → invoice |
| `other_than_supply` | 55(1)(c) | No | None | Standalone |

Derived, not stored: `isSupplyToConsignee = purpose in ('lot_supply', 'quantity_unknown')`.
That single boolean gates the tax columns on the form and the whole tax block on the print.

Per-purpose extras:

- **`lot_supply`** — `invoice_id` required, `is_final_consignment`. Rule 55(5)(d) puts the
  *original* invoice on the last consignment, so ticking final shows that reminder.
- **`quantity_unknown`** — lines default `is_provisional_quantity = true` (Rule 55(2)(v)).
- **`job_work`** — `expected_return_date`. Section 143 wants inputs back within 1 year and
  capital goods within 3 years; default the date to +1 year, let the user change it.
- **`approval`** — `expected_return_date` as the approval deadline. Section 31(7): the invoice
  is due at the time of supply or **6 months from removal, whichever is earlier** — so default
  +6 months and surface it as a deadline, not a suggestion.
- **`other_than_supply`** — free-text `reason` (branch transfer, repair, exhibition, demo).

---

## 3. Data model

Two new tables, modelled on `supabase/debit_notes_migration.sql` (idempotent, `begin/commit`,
`drop policy if exists` + recreate). New document types get their **own tables** in this repo —
`credit_notes.note_type` was explicitly dropped in favour of separate tables, so no
discriminator column.

### 3.1 The consignee problem — worth deciding before code

`credit_notes` points at `customers`. **A challan cannot.** A job worker is not a customer.
A branch transfer under `other_than_supply` goes to *your own* other premises — not a customer
at all. Forcing every consignee into the customers table would pollute the customer list, the
customer dropdown, and any report that counts customers.

Proposal: `customer_id` stays a **nullable** FK for the common case (`lot_supply` — the
consignee *is* the invoice's customer), plus snapshot columns that are the source of truth on
the printed document:

```
customer_id        uuid null → customers(id) on delete set null
consignee_name     text not null
consignee_gstin    text            -- Rule 55(2)(iii): "if registered" — nullable
consignee_address  text
consignee_state    text            -- drives inter-state → place of supply + IGST
```

Picking a customer prefills the four; they stay editable. No customer → type them. This also
snapshots the consignee as printed, so editing a customer later never restates an issued
challan (same reasoning as `invoices.terms`).

### 3.2 `delivery_challans`

```sql
id                    uuid pk default gen_random_uuid()
company_id            uuid not null → companies(id) on delete cascade
customer_id           uuid     null → customers(id) on delete set null
invoice_id            uuid     null → invoices(id)  on delete set null
challan_number        text not null
challan_date          date not null default current_date
purpose               text not null check (purpose in
                        ('lot_supply','quantity_unknown','job_work','approval','other_than_supply'))

consignee_name        text not null
consignee_gstin       text
consignee_address     text
consignee_state       text
ship_to_address       text          -- where goods actually land, if not the consignee address
place_of_supply       text          -- Rule 55(2)(viii)

is_final_consignment  boolean not null default false   -- Rule 55(5)(d)
expected_return_date  date                             -- job_work / approval
reason                text                             -- other_than_supply

transport_mode        text          -- names reused from invoices.transport_mode
vehicle_number        text          -- invoices.vehicle_number
transporter_name      text
lr_number             text
eway_bill_number      text          -- Rule 55(4), typed in (§9)

subtotal              numeric(14,2) not null default 0   -- taxable value, 55(2)(vi)
cgst                  numeric(14,2) not null default 0
sgst                  numeric(14,2) not null default 0
igst                  numeric(14,2) not null default 0
total_tax             numeric(14,2) not null default 0
total_amount          numeric(14,2) not null default 0
notes                 text
status                text not null default 'draft'
                        check (status in ('draft','issued','cancelled'))
created_by            uuid → app_users(id) on delete set null
created_at, updated_at timestamptz not null default now()
unique (company_id, challan_number)
```

Note `cgst/sgst/igst` are **stored**, following `invoices`, not derived-at-render like
`credit_notes`. A challan is a transport document that gets inspected; the tax it was issued
with must be what reprints, not whatever today's state config computes.

`invoice_id` carries both directions, disambiguated by `purpose`: for `lot_supply` it is the
parent invoice, set at creation; for `approval` / `quantity_unknown` it is the invoice raised
later, set on conversion. One column, one meaning — *"the invoice this challan relates to"*.

### 3.3 `delivery_challan_items`

```sql
id                      uuid pk
delivery_challan_id     uuid not null → delivery_challans(id) on delete cascade
invoice_item_id         uuid     null → invoice_items(id) on delete set null  -- §4
item_id                 uuid     null → items(id) on delete set null
item_name               text not null
description             text
hsn                     text
quantity                numeric(14,3) not null default 1
is_provisional_quantity boolean not null default false   -- Rule 55(2)(v)
unit                    text
rate                    numeric(14,2) not null default 0
discount_percent        numeric(5,2)  not null default 0
gst_rate                numeric(5,2)  not null default 0
taxable_amount          numeric(14,2) not null default 0
tax_amount              numeric(14,2) not null default 0
total_amount            numeric(14,2) not null default 0
sort_order              int not null default 0
```

`discount_percent` and `sort_order` are included deliberately — `credit_note_items` omits both
and silently loses the discount the user typed.

### 3.4 Trigger, RLS

- `delivery_challans_touch_updated` before update → `public.touch_updated_at()`.
- RLS on both. Header: `company_id = public.current_company_id()`. Items: `exists (select 1
  from delivery_challans dc where dc.id = delivery_challan_id and dc.company_id =
  current_company_id())`. Same shape as credit notes.

---

## 4. Remaining-quantity tracking (the Rule 55(5) core)

`delivery_challan_items.invoice_item_id` is what makes this work.

**Dispatched so far**, per invoice line:

```sql
select dci.invoice_item_id, sum(dci.quantity)
from delivery_challan_items dci
join delivery_challans dc on dc.id = dci.delivery_challan_id
where dc.invoice_id = $1
  and dc.status <> 'cancelled'          -- cancelled consignments free their quantity
group by dci.invoice_item_id
```

`remaining = invoice_items.quantity - dispatched`.

Rules:
- The dispatch form defaults each line's qty to its remaining, and blocks `qty > remaining`.
- Lines at remaining 0 are shown greyed and excluded from the save.
- **Re-check at save**, not just on render — two people dispatching the same invoice from two
  tabs would otherwise both pass validation and over-dispatch. (Same class of race as the
  invoice-number duplication already noted in the repo; here we can actually catch it.)
- Rate, HSN, GST and description are inherited from the invoice line and **read-only**. It is
  the same supply; divergence would make the consignment contradict the invoice.
- Only `quantity` is editable per line.

**Dispatch tracker** on the invoice: *"18 of 30 units dispatched across 2 challans"*, with the
challans listed. Fully dispatched invoices stop offering the action.

Guard: only goods invoices can be dispatched. `bill_type` is derived from line items in
`InvoiceCreate`, so a service-only invoice must not offer "Dispatch a consignment".

---

## 5. Numbering

`DC-2025-26-001` — prefix + financial year + zero-padded counter, matching
`CreditNoteCreate.tsx:165-181` and receipts. `getFinancialYear` already exists (April rollover).

**Open question — see §10.** Invoices now support a configurable prefix and a start number so
users migrating from other billing software can continue their sequence. Challans would not.
A user migrating mid-year with challans up to DC-500 has the same problem we just solved for
invoices, and no way to say so.

Two bugs in the note/receipt numbering **not** to copy:
- The count query bypasses `selectForUser`, so auditors get no suggested number at all.
- Counting rows means deleting one rewinds the sequence onto a used number — the exact defect
  just fixed on invoices. Challans should derive from the highest issued number instead.

---

## 6. Screens

### 6.1 Create — `DeliveryChallanCreate.tsx`

Purpose first, because it changes the rest of the form:

```
1. Purpose            [Job work ▾]        ← required; drives 2, 4, 5
2. Against invoice    (lot_supply only — locked when opened from an invoice)
3. Consignee          [customer ▾ or type]  → prefills name/GSTIN/address/state
4. Details            date, number, place of supply,
                      + expected return date  (job_work | approval)
                      + reason                (other_than_supply)
                      + final consignment     (lot_supply)
5. Line items         standalone: item picker + free lines, qty/rate/HSN/GST
                      lot_supply: invoice lines, qty only, remaining shown
                      quantity_unknown: qty marked provisional
6. Transport          mode, vehicle, transporter, LR, e-way bill number
7. Notes
```

Tax columns and totals appear only when `isSupplyToConsignee`.

### 6.2 Dispatch from an invoice — the important entry point

The Rule 55(5) flow starts **on the invoice, not the challan menu**. A "Dispatch a consignment"
action on a goods invoice (list row + preview) opens Create with `purpose = lot_supply`,
`invoice_id` locked, consignee prefilled, and lines pre-loaded at remaining quantity.

Reaching this from the challan menu is possible but secondary — the user has to pick the
invoice first, which is why the invoice-side entry point is the one to build well.

### 6.3 List — `DeliveryChallansList.tsx`

Columns: number, date, consignee, purpose, against-invoice, qty, value, status. Filters on
purpose and status. Pending returns (`job_work` / `approval` past `expected_return_date`)
flagged — that is the compliance-relevant view.

### 6.4 Preview — `DeliveryChallanPreview.tsx`

Triplicate per Rule 55(3), three `.invoice-print-page` copies:

```
ORIGINAL FOR CONSIGNEE
DUPLICATE FOR TRANSPORTER
TRIPLICATE FOR CONSIGNER
```

Wording differs from invoices deliberately (consignee/consigner, not buyer/supplier).
Header "DELIVERY CHALLAN" + purpose. Tax block only when `isSupplyToConsignee`. For
`lot_supply`, print the invoice reference prominently — that reference *is* the compliance.
Reuses `usePdfActions` for print/PDF, so it inherits the fitted-A4 path.

### 6.5 Challan → Invoice

On an issued `approval` / `quantity_unknown` challan: **Create Invoice** → prefills
`InvoiceCreate` from the challan lines, then writes `invoice_id` back on the challan. For
`quantity_unknown` the provisional quantity becomes editable — that is the entire point of the
challan (Rule 55(1)(a)).

---

## 7. Wiring checklist

**Frontend**
1. `src/app/components/delivery-challans/` — Create / List / Preview
2. `src/app/App.tsx` — 2 imports + 2 routes under `ProtectedRoute permission="delivery-challans"`
3. `DashboardLayout.tsx:122-133` — nav entry + lucide icon (`Truck`)
4. `src/app/components/auditor/AuditorManagement.tsx:18-28` — `AVAILABLE_PERMISSIONS`
5. `src/contexts/AuthContext.tsx:54-65` — `OWNER_PERMISSIONS`
6. `src/contexts/AuthContext.SUPABASE.tsx:120-131` — same list
7. Invoice side: dispatch action + tracker in `InvoiceList` / `InvoicePreview`

**Database**
8. New migration `supabase_delivery_challans.sql` — tables, trigger, RLS
9. `supabase_fresh_start.sql` — drops, tables, trigger, RLS enable, policies, so a rebuild matches
10. `auditor_data_request` branches: select / insert / insert-items / update / delete.
    **Three drifted copies** must all get them: `supabase_auditor_pgcrypto_fix.sql`,
    `supabase/auditors_bifurcation_migration.sql`, `.clean.sql`

**Do not repeat**
11. Module string must be `delivery-challans` (hyphen) to match `permission_name`. Credit notes
    use `credit_notes` (underscore), which never matches, **and** have no RPC branch — auditors
    cannot use credit notes at all today. That bug is live and separate from this work.
12. Wrap owner Supabase builders in `Promise.resolve(...)` — they are thenables, not promises.
13. Header + items are two un-transacted inserts everywhere in this repo; a failed items insert
    orphans the header. Worth a cleanup path or a single RPC here.

---

## 8. Build order

1. Migration + `fresh_start` + RPC branches (all three files)
2. Permissions / route / nav — module reachable but empty
3. Create, standalone purposes (`job_work`, `other_than_supply`, `approval`, `quantity_unknown`)
4. Preview triplicate + print
5. List + filters + pending-returns flag
6. `lot_supply` + remaining-quantity tracking + dispatch-from-invoice + tracker
7. Challan → Invoice conversion

Each step is independently shippable; 6 is the largest and depends on nothing before it except 3.

---

## 9. Explicitly out of scope

- **E-way bill generation** (Rule 138 / NIC API). `eway_bill_number` is a typed field only.
  Rule 55(4) requires the declaration; generating it is a separate integration. The landing
  page currently advertises "e-Way bill generation" in a testimonial with no feature behind it.
- **ITC-04** (job-work return, Section 143 / Rule 45). `expected_return_date` and the pending
  flag give the data; the return itself is a reporting feature.
- **Job-work receipt back** — recording what physically returned needs its own document and
  partial-return handling.
- **Multi-godown consigner.** Consigner is the company profile. Branch transfers *from* a
  specific godown would need a locations table.

---

## 10. Open questions

1. **Challan numbering** — follow notes/receipts (`DC-2025-26-001`, fixed), or give challans the
   configurable prefix + start number that invoices now have? Migrating users have existing
   challan numbers and the same continuity problem. Costs two `company_settings` columns and an
   RPC signature change (currently 10 args, redefined across five .sql files).
2. **Consignee snapshot** (§3.1) — agreed, or should job workers/branches be forced into the
   customers table? I recommend snapshot; it keeps the customer list meaning "customers".
3. **Approval → invoice deadline** — should a challan past its 6-month s.31(7) deadline be
   flagged loudly (it is a compliance breach), or just listed?
4. **Can one challan span several invoices?** The model above says no (single `invoice_id`).
   Rule 55(5) reads one-invoice-per-consignment-series. If you ever ship one lorry against two
   invoices, this needs the receipts-style join table instead. Cheap now, expensive later.
5. **Editing an issued challan** — invoices allow edit. A challan that has physically travelled
   with goods arguably should not be editable, only cancelled and reissued. Which?
