alter table public.companies
add column if not exists esign_image text;

alter table public.companies
add column if not exists stamp_image text;
