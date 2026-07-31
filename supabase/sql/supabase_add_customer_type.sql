alter table public.customers
add column if not exists customer_type text not null default 'B2B';

alter table public.customers
add column if not exists pan text;

alter table public.customers
add column if not exists state text;

alter table public.invoices
add column if not exists cgst numeric(14,2) not null default 0;

alter table public.invoices
add column if not exists sgst numeric(14,2) not null default 0;

alter table public.invoices
add column if not exists igst numeric(14,2) not null default 0;

alter table public.invoices
add column if not exists total_tax numeric(14,2) not null default 0;

alter table public.customers
drop constraint if exists customers_customer_type_check;

alter table public.customers
add constraint customers_customer_type_check
check (customer_type in ('B2B', 'B2C', 'SEZ', 'Export', 'Composition', 'Nil Rated', 'Exempt Supply'));

update public.customers
set pan = substring(gstin from 3 for 10)
where (pan is null or pan = '')
  and length(coalesce(gstin, '')) >= 12;
