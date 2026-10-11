-- UPI payment details for invoice bank blocks.
-- Safe to run more than once.

alter table public.companies
  add column if not exists upi_id text;

alter table public.companies
  add column if not exists payment_qr_image text;

comment on column public.companies.upi_id is
  'UPI payment address printed in the bank-details block on invoices.';

comment on column public.companies.payment_qr_image is
  'Payment QR image stored as a data URL and printed with invoice bank details.';

-- Make the new fields available immediately through PostgREST.
notify pgrst, 'reload schema';
