alter table public.companies
add column if not exists pan text;

alter table public.customers
add column if not exists pan text;

update public.companies
set pan = substring(gstin from 3 for 10)
where (pan is null or pan = '')
  and length(coalesce(gstin, '')) >= 12;

update public.customers
set pan = substring(gstin from 3 for 10)
where (pan is null or pan = '')
  and length(coalesce(gstin, '')) >= 12;

create or replace function public.fill_pan_from_gstin()
returns trigger
language plpgsql
as $$
begin
  if (new.pan is null or new.pan = '') and length(coalesce(new.gstin, '')) >= 12 then
    new.pan := substring(upper(new.gstin) from 3 for 10);
  end if;

  return new;
end;
$$;

drop trigger if exists companies_fill_pan_from_gstin on public.companies;
create trigger companies_fill_pan_from_gstin
before insert or update of gstin, pan on public.companies
for each row execute function public.fill_pan_from_gstin();

drop trigger if exists customers_fill_pan_from_gstin on public.customers;
create trigger customers_fill_pan_from_gstin
before insert or update of gstin, pan on public.customers
for each row execute function public.fill_pan_from_gstin();
