-- Core tenant, product, sales, and inventory schema for the MVP.
-- Sale creation must validate and decrement stock in one database transaction.

create extension if not exists pgcrypto;

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 160),
  whatsapp_id text unique,
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 160),
  sale_price_cents integer not null check (sale_price_cents >= 0),
  unit_cost_cents integer check (unit_cost_cents is null or unit_cost_cents >= 0),
  stock numeric(12,3) not null default 0 check (stock >= 0),
  created_at timestamptz not null default now(),
  unique (id, business_id)
);

create index products_business_name_idx on public.products (business_id, lower(name));

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  total_cents integer not null check (total_cents >= 0),
  source text not null check (source in ('web', 'whatsapp', 'whatsapp_flow', 'manual', 'import')),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  idempotency_key text,
  unique (business_id, idempotency_key),
  unique (id, business_id)
);

create index sales_business_occurred_idx on public.sales (business_id, occurred_at desc);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null,
  business_id uuid not null,
  product_id uuid,
  description text not null check (length(trim(description)) between 1 and 200),
  quantity numeric(12,3) not null check (quantity > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  subtotal_cents integer generated always as
    (round(quantity * unit_price_cents)::integer) stored,
  created_at timestamptz not null default now(),
  constraint sale_items_sale_tenant_fk foreign key (sale_id, business_id)
    references public.sales(id, business_id) on delete cascade,
  constraint sale_items_product_tenant_fk foreign key (product_id, business_id)
    references public.products(id, business_id)
);

create index sale_items_sale_idx on public.sale_items (sale_id);
create index sale_items_business_product_idx on public.sale_items (business_id, product_id);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  concept text not null check (length(trim(concept)) between 1 and 200),
  amount_cents integer not null check (amount_cents > 0),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index expenses_business_occurred_idx on public.expenses (business_id, occurred_at desc);

-- The trusted server session must place business_id in app_metadata.
-- Do not read tenant identity from user_metadata or client request parameters.
create or replace function public.current_business_id()
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'business_id', '')::uuid
$$;

alter table public.businesses enable row level security;
alter table public.products enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.expenses enable row level security;

create policy "business members read own business" on public.businesses
  for select using (id = (select public.current_business_id()));
create policy "business members update own business" on public.businesses
  for update using (id = (select public.current_business_id()))
  with check (id = (select public.current_business_id()));

create policy "business members manage own products" on public.products
  for all using (business_id = (select public.current_business_id()))
  with check (business_id = (select public.current_business_id()));
create policy "business members manage own sales" on public.sales
  for all using (business_id = (select public.current_business_id()))
  with check (business_id = (select public.current_business_id()));
create policy "business members manage own sale items" on public.sale_items
  for all using (business_id = (select public.current_business_id()))
  with check (business_id = (select public.current_business_id()));
create policy "business members manage own expenses" on public.expenses
  for all using (business_id = (select public.current_business_id()))
  with check (business_id = (select public.current_business_id()));

grant usage on schema public to authenticated;
grant select, update on public.businesses to authenticated;
grant select, insert, update, delete on public.products, public.sales, public.sale_items, public.expenses to authenticated;
grant execute on function public.current_business_id() to authenticated;
