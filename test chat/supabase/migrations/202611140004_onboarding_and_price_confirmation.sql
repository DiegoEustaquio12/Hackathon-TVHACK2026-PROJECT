-- Explicit onboarding and versioned price approval. No applied migration is edited.
alter table public.businesses
  add column business_type text check (business_type is null or length(trim(business_type)) between 1 and 160),
  add column onboarding_completed_at timestamptz;
alter table public.businesses add constraint businesses_onboarding_complete
  check (onboarding_completed_at is null or business_type is not null);
alter table public.whatsapp_sale_drafts
  add column quote jsonb,
  add column quote_version integer not null default 1 check (quote_version > 0);

create or replace function public.record_whatsapp_sale(
  p_whatsapp_id text,
  p_idempotency_key text,
  p_items jsonb,
  p_source text default 'whatsapp'
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
  if not exists (select 1 from public.businesses where id = v_business and onboarding_completed_at is not null and business_type is not null) then
    raise exception 'ONBOARDING_REQUIRED';
  end if;

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

create function public.complete_business_onboarding(p_sender text, p_name text, p_business_type text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_business public.businesses%rowtype;
begin
  if p_sender is null or p_sender !~ '^[1-9][0-9]{7,14}$' then raise exception 'INVALID_WHATSAPP_ID'; end if;
  if p_name is null or length(trim(p_name)) not between 1 and 160
    or p_business_type is null or length(trim(p_business_type)) not between 1 and 160 then
    raise exception 'INVALID_ONBOARDING';
  end if;
  insert into public.businesses(name, whatsapp_id, business_type, onboarding_completed_at)
    values(trim(p_name), p_sender, trim(p_business_type), now())
    on conflict(whatsapp_id) do nothing;
  select * into v_business from public.businesses where whatsapp_id = p_sender for update;
  if v_business.onboarding_completed_at is null then
    update public.businesses set name = trim(p_name), business_type = trim(p_business_type),
      onboarding_completed_at = now() where id = v_business.id returning * into v_business;
  elsif v_business.name <> trim(p_name) or v_business.business_type <> trim(p_business_type) then
    raise exception 'ONBOARDING_CONFLICT';
  end if;
  return jsonb_build_object('id', v_business.id, 'name', v_business.name,
    'business_type', v_business.business_type, 'whatsapp_id', v_business.whatsapp_id);
end;
$$;

-- Validates the cart and locks catalogue rows so the displayed quote and
-- subsequent stock transaction use a consistent set of prices.
create function public.quote_whatsapp_items(p_business uuid, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_item jsonb;
  v_product public.products%rowtype;
  v_quantity numeric;
  v_subtotal numeric;
  v_total numeric := 0;
  v_result jsonb := '[]';
  v_seen uuid[] := '{}';
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'INVALID_ITEMS'; end if;
  if jsonb_array_length(p_items) not between 1 and 100 then raise exception 'INVALID_ITEMS'; end if;
  for v_item in select value from jsonb_array_elements(p_items) order by value ->> 'product_id' loop
    if jsonb_typeof(v_item) <> 'object'
      or jsonb_typeof(v_item -> 'product_id') is distinct from 'string'
      or jsonb_typeof(v_item -> 'quantity') is distinct from 'number'
      or (v_item - 'product_id' - 'quantity') <> '{}'::jsonb then raise exception 'INVALID_ITEM'; end if;
    v_quantity := (v_item ->> 'quantity')::numeric;
    if v_quantity <= 0 or v_quantity > 999999999.999 or round(v_quantity, 3) <> v_quantity then
      raise exception 'INVALID_QUANTITY'; end if;
    if (v_item ->> 'product_id')::uuid = any(v_seen) then raise exception 'DUPLICATE_PRODUCT'; end if;
    v_seen := array_append(v_seen, (v_item ->> 'product_id')::uuid);
    select * into v_product from public.products
      where business_id = p_business and id = (v_item ->> 'product_id')::uuid for update;
    if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
    v_subtotal := round(v_quantity * v_product.sale_price_cents);
    v_total := v_total + v_subtotal;
    if v_total > 2147483647 then raise exception 'TOTAL_TOO_LARGE'; end if;
    v_result := v_result || jsonb_build_array(jsonb_build_object('product_id', v_product.id,
      'description', v_product.name, 'quantity', v_quantity, 'unit_price_cents', v_product.sale_price_cents,
      'subtotal_cents', v_subtotal));
  end loop;
  return jsonb_build_object('items', v_result, 'total_cents', v_total);
end;
$$;

create or replace function public.create_whatsapp_sale_draft(p_sender text, p_operation_key text, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_business uuid;
  v_draft public.whatsapp_sale_drafts%rowtype;
  v_quote jsonb;
begin
  select id into v_business from public.businesses where whatsapp_id = p_sender for update;
  if not found then raise exception 'BUSINESS_NOT_FOUND'; end if;
  if not exists(select 1 from public.businesses where id = v_business and onboarding_completed_at is not null) then
    raise exception 'ONBOARDING_REQUIRED'; end if;
  v_quote := public.quote_whatsapp_items(v_business, p_items);
  insert into public.whatsapp_sale_drafts(business_id, sender, operation_key, items, quote)
    values(v_business, p_sender, p_operation_key, p_items, v_quote)
    on conflict(business_id, operation_key) do nothing returning * into v_draft;
  if not found then
    select * into v_draft from public.whatsapp_sale_drafts
      where business_id = v_business and operation_key = p_operation_key;
    if v_draft.items <> p_items or v_draft.sender <> p_sender then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  end if;
  return jsonb_build_object('draft_id', v_draft.id, 'status', v_draft.status,
    'expires_at', v_draft.expires_at, 'quote', v_draft.quote, 'quote_version', v_draft.quote_version);
end;
$$;

-- A stale button must not approve a different amount. Legacy two-argument
-- callers receive QUOTE_VERSION_REQUIRED rather than silently accepting prices.
drop function public.confirm_whatsapp_sale_draft(text, uuid);
create function public.confirm_whatsapp_sale_draft(p_sender text, p_draft_id uuid, p_quote_version integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_business uuid;
  v_draft public.whatsapp_sale_drafts%rowtype;
  v_current jsonb;
  v_old jsonb;
  v_receipt jsonb;
begin
  select id into v_business from public.businesses where whatsapp_id = p_sender for update;
  if not found then raise exception 'BUSINESS_NOT_FOUND'; end if;
  select * into v_draft from public.whatsapp_sale_drafts
    where id = p_draft_id and business_id = v_business and sender = p_sender for update;
  if not found then raise exception 'DRAFT_NOT_FOUND'; end if;
  if v_draft.status = 'cancelled' then raise exception 'DRAFT_CANCELLED'; end if;
  if v_draft.status = 'confirmed' then
    v_receipt := public.record_whatsapp_sale(p_sender, 'draft:' || v_draft.id::text, v_draft.items, 'whatsapp');
    return jsonb_build_object('status', 'confirmed', 'receipt', v_receipt);
  end if;
  if v_draft.expires_at <= clock_timestamp() then raise exception 'DRAFT_EXPIRED'; end if;
  if p_quote_version is null then raise exception 'QUOTE_VERSION_REQUIRED'; end if;
  if p_quote_version <> v_draft.quote_version then
    return jsonb_build_object('status', 'quote_outdated', 'draft_id', v_draft.id,
      'quote_version', v_draft.quote_version, 'quote', v_draft.quote);
  end if;
  v_current := public.quote_whatsapp_items(v_business, v_draft.items);
  if v_draft.quote is distinct from v_current then
    v_old := v_draft.quote;
    update public.whatsapp_sale_drafts set quote = v_current, quote_version = quote_version + 1
      where id = v_draft.id returning * into v_draft;
    return jsonb_build_object('status', 'price_changed', 'draft_id', v_draft.id,
      'previous_quote', v_old, 'quote', v_current, 'quote_version', v_draft.quote_version);
  end if;
  v_receipt := public.record_whatsapp_sale(p_sender, 'draft:' || v_draft.id::text, v_draft.items, 'whatsapp');
  update public.whatsapp_sale_drafts set status = 'confirmed', sale_id = (v_receipt ->> 'sale_id')::uuid
    where id = v_draft.id;
  return jsonb_build_object('status', 'confirmed', 'receipt', v_receipt);
end;
$$;

revoke all on function public.complete_business_onboarding(text,text,text) from public, anon, authenticated;
revoke all on function public.quote_whatsapp_items(uuid,jsonb) from public, anon, authenticated;
revoke all on function public.confirm_whatsapp_sale_draft(text,uuid,integer) from public, anon, authenticated;
grant execute on function public.complete_business_onboarding(text,text,text) to service_role;
grant execute on function public.confirm_whatsapp_sale_draft(text,uuid,integer) to service_role;

