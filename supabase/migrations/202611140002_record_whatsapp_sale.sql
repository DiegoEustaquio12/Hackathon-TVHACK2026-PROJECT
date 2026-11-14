-- WhatsApp numbers use the canonical Cloud API form: country code + number,
-- digits only (no leading '+'). Null is allowed only before onboarding.
alter table public.businesses add constraint businesses_whatsapp_format
  check (whatsapp_id is null or whatsapp_id ~ '^[1-9][0-9]{7,14}$');

-- Used to detect reuse of the same event key with a different cart.
alter table public.sales add column request_items jsonb;

-- Clients may read receipts, but cannot bypass the controlled sale operation.
revoke insert, update, delete on public.sales, public.sale_items from anon, authenticated;
revoke update on public.businesses from authenticated;
grant update (name) on public.businesses to authenticated;

create or replace function public.record_whatsapp_sale(
  p_whatsapp_id text,
  p_idempotency_key text,
  p_items jsonb,
  p_source text default 'whatsapp_flow'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business uuid;
  v_sale public.sales%rowtype;
  v_product public.products%rowtype;
  v_item jsonb;
  v_request jsonb;
  v_quantity numeric;
  v_total numeric := 0;
  v_replayed boolean := false;
begin
  if p_whatsapp_id is null or p_whatsapp_id !~ '^[1-9][0-9]{7,14}$' then
    raise exception 'INVALID_WHATSAPP_ID';
  end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 1 and 200 then
    raise exception 'INVALID_IDEMPOTENCY_KEY';
  end if;
  if p_source is null or p_source not in ('whatsapp', 'whatsapp_flow') then
    raise exception 'INVALID_SOURCE';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'INVALID_ITEMS';
  end if;
  if jsonb_array_length(p_items) not between 1 and 100 then
    raise exception 'INVALID_ITEMS';
  end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object'
      or jsonb_typeof(v_item -> 'product_id') is distinct from 'string'
      or jsonb_typeof(v_item -> 'quantity') is distinct from 'number'
      or (v_item - 'product_id' - 'quantity') <> '{}'::jsonb then
      raise exception 'INVALID_ITEM';
    end if;
    v_quantity := (v_item ->> 'quantity')::numeric;
    if v_quantity <= 0 or v_quantity > 999999999.999 or round(v_quantity, 3) <> v_quantity then
      raise exception 'INVALID_QUANTITY';
    end if;
    perform (v_item ->> 'product_id')::uuid;
  end loop;

  select jsonb_agg(jsonb_build_object(
    'product_id', (value ->> 'product_id')::uuid,
    'quantity', (value ->> 'quantity')::numeric
  ) order by (value ->> 'product_id')::uuid)
  into v_request from jsonb_array_elements(p_items);

  if (select count(distinct value ->> 'product_id') from jsonb_array_elements(v_request))
     <> jsonb_array_length(v_request) then
    raise exception 'DUPLICATE_PRODUCT';
  end if;

  -- Serializes retries for this business and binds identity on the server.
  select id into v_business from public.businesses
    where whatsapp_id = p_whatsapp_id for update;
  if not found then raise exception 'BUSINESS_NOT_FOUND'; end if;

  select * into v_sale from public.sales
    where business_id = v_business and idempotency_key = p_idempotency_key;
  if found then
    if v_sale.request_items is distinct from v_request or v_sale.source <> p_source then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    v_replayed := true;
  else
    -- Ordered locks protect against concurrent stock/price edits.
    for v_item in select value from jsonb_array_elements(v_request) loop
      select * into v_product from public.products
        where id = (v_item ->> 'product_id')::uuid and business_id = v_business
        for update;
      if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
      v_quantity := (v_item ->> 'quantity')::numeric;
      if v_product.stock < v_quantity then
        raise exception 'OUT_OF_STOCK' using detail = v_product.id::text;
      end if;
      v_total := v_total + round(v_quantity * v_product.sale_price_cents);
    end loop;
    if v_total > 2147483647 then raise exception 'TOTAL_TOO_LARGE'; end if;

    insert into public.sales (business_id, total_cents, source, idempotency_key, request_items)
    values (v_business, v_total::integer, p_source, p_idempotency_key, v_request)
    returning * into v_sale;

    for v_item in select value from jsonb_array_elements(v_request) loop
      v_quantity := (v_item ->> 'quantity')::numeric;
      insert into public.sale_items
        (sale_id, business_id, product_id, description, quantity, unit_price_cents)
      select v_sale.id, v_business, id, name, v_quantity, sale_price_cents
      from public.products where id = (v_item ->> 'product_id')::uuid;

      update public.products set stock = stock - v_quantity
        where id = (v_item ->> 'product_id')::uuid and business_id = v_business;
    end loop;
  end if;

  return jsonb_build_object(
    'sale_id', v_sale.id, 'total_cents', v_sale.total_cents,
    'replayed', v_replayed,
    'items', (select jsonb_agg(jsonb_build_object(
      'product_id', product_id, 'description', description, 'quantity', quantity,
      'unit_price_cents', unit_price_cents, 'subtotal_cents', subtotal_cents
    ) order by product_id) from public.sale_items where sale_id = v_sale.id)
  );
end;
$$;

-- This RPC requires a trusted backend that verifies Meta's webhook signature
-- and takes p_whatsapp_id from the verified sender, never from form fields.
revoke all on function public.record_whatsapp_sale(text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.record_whatsapp_sale(text, text, jsonb, text) to service_role;
