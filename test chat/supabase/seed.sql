-- Synthetic local demo data. Never pass --include-seed to a hosted deployment
-- unless the target is explicitly intended for demonstration data.
with demo_business as (
  insert into public.businesses (id, name)
  values ('11111111-1111-4111-8111-111111111111', 'Abarrotes Lupita')
  on conflict (id) do nothing
  returning id
)

insert into public.products
  (id, business_id, name, sale_price_cents, unit_cost_cents, stock)
values
  ('22222222-2222-4222-8222-222222222221', '11111111-1111-4111-8111-111111111111', 'Coca', 2000, 1500, 10),
  ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'Pan', 1500, 1000, 10)
on conflict (id) do nothing;
