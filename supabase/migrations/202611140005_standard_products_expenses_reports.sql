-- Internal product specification; legacy rows remain readable without guessing
-- brand/size. New product creation goes through the validated server RPC.
alter table public.products
  add column product_type text,
  add column brand text,
  add column variant text,
  add column presentation text,
  add column content_amount numeric(15,3),
  add column content_unit text check (content_unit in ('ml','g','piece')),
  add column sale_unit text check (sale_unit in ('piece','kg','g','l','ml')),
  add column aliases text[] not null default '{}',
  add column product_signature text,
  add column creation_key text,
  add column creation_payload jsonb,
  add constraint products_spec_complete check (product_signature is null or (
    product_type is not null and presentation is not null and content_amount > 0
    and content_unit is not null and sale_unit is not null)),
  add unique (business_id, product_signature),
  add unique (business_id, creation_key);

alter table public.businesses add column time_zone text;
alter table public.expenses add column idempotency_key text,
  add unique(business_id,idempotency_key);
revoke insert, update, delete on public.products, public.expenses from anon, authenticated;

create function public.require_whatsapp_business(p_sender text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare b uuid;
begin
  if p_sender is null or p_sender !~ '^[1-9][0-9]{7,14}$' then raise exception 'INVALID_WHATSAPP_ID'; end if;
  select id into b from public.businesses where whatsapp_id = p_sender
    and onboarding_completed_at is not null and business_type is not null for update;
  if not found then raise exception 'ONBOARDING_REQUIRED'; end if;
  return b;
end;
$$;

create function public.create_standard_product(
  p_sender text, p_operation_key text, p_spec jsonb, p_price integer, p_stock numeric,
  p_cost integer default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  b uuid := public.require_whatsapp_business(p_sender);
  kind text := trim(p_spec ->> 'product_type');
  brand_name text := coalesce(trim(p_spec ->> 'brand'),'');
  variant_name text := coalesce(trim(p_spec ->> 'variant'),'');
  pack text := trim(p_spec ->> 'presentation');
  amount numeric := (p_spec ->> 'content_amount')::numeric;
  unit text := p_spec ->> 'content_unit';
  sale text := p_spec ->> 'sale_unit';
  aliases text[] := '{}';
  display_name text;
  signature text;
  payload jsonb;
  product public.products%rowtype;
begin
  if p_spec is null or jsonb_typeof(p_spec) <> 'object'
    or jsonb_typeof(p_spec -> 'product_type') is distinct from 'string'
    or jsonb_typeof(p_spec -> 'presentation') is distinct from 'string'
    or jsonb_typeof(p_spec -> 'content_amount') is distinct from 'number'
    or (p_spec ? 'brand' and jsonb_typeof(p_spec -> 'brand') <> 'string')
    or (p_spec ? 'variant' and jsonb_typeof(p_spec -> 'variant') <> 'string')
    or (p_spec - array['product_type','brand','variant','presentation','content_amount','content_unit','sale_unit','aliases']) <> '{}'::jsonb
    or kind is null or length(kind) not between 1 and 50
    or length(brand_name) > 40 or length(variant_name) > 40
    or pack is null or length(pack) not between 1 and 30
    or amount is null or amount <= 0 or amount > 999999999.999 or round(amount,3) <> amount
    or unit is null or unit not in ('ml','l','g','kg','piece')
    or sale is null or sale not in ('piece','kg','g','l','ml')
    or p_price is null or p_price < 0 or p_stock is null or p_stock < 0
    or p_stock > 999999999.999 or round(p_stock,3) <> p_stock or p_cost < 0
    or p_operation_key is null or length(trim(p_operation_key)) not between 1 and 200 then
    raise exception 'INVALID_PRODUCT_SPEC';
  end if;
  if unit in ('l','kg') then amount := amount * 1000; unit := case when unit='l' then 'ml' else 'g' end; end if;
  amount := round(amount,3);
  if (sale='piece' and trunc(p_stock) <> p_stock)
    or (sale in ('kg','g') and unit <> 'g') or (sale in ('l','ml') and unit <> 'ml') then
    raise exception 'INVALID_PRODUCT_UNIT'; end if;
  if p_spec ? 'aliases' then
    if jsonb_typeof(p_spec -> 'aliases') <> 'array' then raise exception 'INVALID_ALIASES'; end if;
    if jsonb_array_length(p_spec -> 'aliases') > 30 then raise exception 'INVALID_ALIASES'; end if;
    if exists(select 1 from jsonb_array_elements(p_spec -> 'aliases') a
      where jsonb_typeof(a) <> 'string' or length(trim(a #>> '{}')) not between 1 and 80) then
      raise exception 'INVALID_ALIASES'; end if;
    select coalesce(array_agg(distinct trim(value) order by trim(value)), '{}') into aliases
      from jsonb_array_elements_text(p_spec -> 'aliases');
  end if;
  display_name := concat_ws(' ',nullif(brand_name,''),kind,nullif(variant_name,''),
    trim(to_char(amount,'FM999999999999990.999')),case when unit='piece' then 'pieza' else unit end) || ' · ' || pack;
  -- Drop the trailing decimal separator that to_char emits for integer quantities.
  display_name := replace(display_name,'. ', ' ');
  if length(display_name) > 160 then raise exception 'PRODUCT_NAME_TOO_LONG'; end if;
  signature := jsonb_build_array(
    lower(regexp_replace(kind,'\s+',' ','g')),lower(regexp_replace(brand_name,'[^[:alnum:]]','','g')),
    lower(regexp_replace(variant_name,'\s+',' ','g')),lower(regexp_replace(pack,'\s+',' ','g')),
    amount,unit,sale)::text;
  payload := jsonb_build_object('signature',signature,'price',p_price,'stock',p_stock,'cost',p_cost,'aliases',aliases);
  insert into public.products(business_id,name,sale_price_cents,unit_cost_cents,stock,
    product_type,brand,variant,presentation,content_amount,content_unit,sale_unit,aliases,
    product_signature,creation_key,creation_payload)
  values(b,display_name,p_price,p_cost,p_stock,kind,nullif(brand_name,''),nullif(variant_name,''),
    pack,amount,unit,sale,aliases,signature,p_operation_key,payload)
  on conflict do nothing returning * into product;
  if not found then
    select * into product from public.products where business_id=b and creation_key=p_operation_key;
    if not found then select * into product from public.products where business_id=b and product_signature=signature; end if;
    if product.creation_payload is distinct from payload then raise exception 'PRODUCT_CONFLICT'; end if;
  end if;
  return to_jsonb(product) - 'creation_payload' - 'product_signature' - 'creation_key';
end;
$$;

create function public.update_product_commercials(p_sender text,p_product_id uuid,p_price integer,p_stock numeric,p_cost integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare b uuid := public.require_whatsapp_business(p_sender); product public.products%rowtype;
begin
  select * into product from public.products where id=p_product_id and business_id=b for update;
  if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
  if p_price is null or p_price < 0 or p_stock is null or p_stock < 0
    or p_stock > 999999999.999 or round(p_stock,3) <> p_stock or p_cost < 0
    or (product.sale_unit='piece' and trunc(p_stock) <> p_stock) then raise exception 'INVALID_PRODUCT_VALUES'; end if;
  update public.products set sale_price_cents=p_price,stock=p_stock,unit_cost_cents=p_cost
    where id=p_product_id returning * into product;
  return to_jsonb(product) - 'creation_payload' - 'product_signature' - 'creation_key';
end;
$$;

-- Enforce piece quantities inside SQL, including callers bypassing the parser.
create function public.enforce_piece_sale_quantity() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists(select 1 from public.products where id=new.product_id and business_id=new.business_id
    and sale_unit='piece') and trunc(new.quantity) <> new.quantity then raise exception 'INVALID_PRODUCT_UNIT'; end if;
  return new;
end;
$$;
create trigger sale_items_piece_quantity before insert or update on public.sale_items
  for each row execute function public.enforce_piece_sale_quantity();

create function public.record_whatsapp_expense(p_sender text,p_operation_key text,p_concept text,p_amount integer,p_occurred_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare b uuid := public.require_whatsapp_business(p_sender); expense public.expenses%rowtype;
begin
  if p_operation_key is null or length(trim(p_operation_key)) not between 1 and 200
    or p_concept is null or length(trim(p_concept)) not between 1 and 200 or p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_EXPENSE'; end if;
  select * into expense from public.expenses where business_id=b and idempotency_key=p_operation_key;
  if found then
    if expense.concept <> trim(p_concept) or expense.amount_cents <> p_amount
      or (p_occurred_at is not null and expense.occurred_at <> p_occurred_at) then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  else
    insert into public.expenses(business_id,concept,amount_cents,idempotency_key,occurred_at)
      values(b,trim(p_concept),p_amount,p_operation_key,coalesce(p_occurred_at,now())) returning * into expense;
  end if;
  return to_jsonb(expense);
end;
$$;

create function public.set_business_time_zone(p_sender text,p_time_zone text)
returns void language plpgsql security definer set search_path = '' as $$
declare b uuid := public.require_whatsapp_business(p_sender);
begin
  if p_time_zone is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_time_zone) then
    raise exception 'INVALID_TIME_ZONE'; end if;
  update public.businesses set time_zone=p_time_zone where id=b;
end;
$$;

create function public.get_business_daily_report(p_sender text,p_day date default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare b uuid := public.require_whatsapp_business(p_sender); tz text; day date; starts timestamptz; ends timestamptz;
begin
  select time_zone into tz from public.businesses where id=b;
  if tz is null then raise exception 'TIME_ZONE_REQUIRED'; end if;
  day := coalesce(p_day,(now() at time zone tz)::date);
  starts := day::timestamp at time zone tz;
  ends := (day+1)::timestamp at time zone tz;
  return jsonb_build_object('day',day,'time_zone',tz,'starts_at',starts,'ends_at',ends,
    'sales_count',(select count(*) from public.sales where business_id=b and occurred_at >= starts and occurred_at < ends),
    'sales_total_cents',(select coalesce(sum(total_cents),0) from public.sales where business_id=b and occurred_at >= starts and occurred_at < ends),
    'expenses_total_cents',(select coalesce(sum(amount_cents),0) from public.expenses where business_id=b and occurred_at >= starts and occurred_at < ends),
    'sold_items',coalesce((select jsonb_agg(to_jsonb(items)) from (
      select i.product_id,i.description,sum(i.quantity) as quantity,sum(i.subtotal_cents) as subtotal_cents
      from public.sale_items i join public.sales s on s.id=i.sale_id and s.business_id=i.business_id
      where s.business_id=b and s.occurred_at >= starts and s.occurred_at < ends
      group by i.product_id,i.description order by i.product_id,i.description
    ) items),'[]'::jsonb));
end;
$$;

revoke all on function public.require_whatsapp_business(text) from public,anon,authenticated;
revoke all on function public.create_standard_product(text,text,jsonb,integer,numeric,integer) from public,anon,authenticated;
revoke all on function public.update_product_commercials(text,uuid,integer,numeric,integer) from public,anon,authenticated;
revoke all on function public.record_whatsapp_expense(text,text,text,integer,timestamptz) from public,anon,authenticated;
revoke all on function public.set_business_time_zone(text,text) from public,anon,authenticated;
revoke all on function public.get_business_daily_report(text,date) from public,anon,authenticated;
grant execute on function public.create_standard_product(text,text,jsonb,integer,numeric,integer) to service_role;
grant execute on function public.update_product_commercials(text,uuid,integer,numeric,integer) to service_role;
grant execute on function public.record_whatsapp_expense(text,text,text,integer,timestamptz) to service_role;
grant execute on function public.set_business_time_zone(text,text) to service_role;
grant execute on function public.get_business_daily_report(text,date) to service_role;
