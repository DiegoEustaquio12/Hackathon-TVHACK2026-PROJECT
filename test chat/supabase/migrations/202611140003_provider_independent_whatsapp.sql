-- Keep existing receipts and the legacy Flow source; new sales default to WhatsApp.
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

create table public.whatsapp_inbound_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider ~ '^[a-z][a-z0-9_]{0,31}$'),
  provider_message_id text not null check (length(provider_message_id) between 1 and 200),
  sender text not null check (sender ~ '^[1-9][0-9]{7,14}$'),
  recipient text not null check (recipient ~ '^[1-9][0-9]{7,14}$'),
  status text not null default 'received' check (status in ('received', 'processing', 'processed', 'failed')),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, provider_message_id)
);
create index whatsapp_events_pending_idx on public.whatsapp_inbound_events (status, received_at);

create table public.whatsapp_sale_drafts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  sender text not null check (sender ~ '^[1-9][0-9]{7,14}$'),
  operation_key text not null check (length(trim(operation_key)) between 1 and 200),
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 100),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  sale_id uuid,
  unique (business_id, operation_key),
  foreign key (sale_id, business_id) references public.sales(id, business_id),
  check ((status = 'confirmed') = (sale_id is not null))
);
create index whatsapp_drafts_business_idx on public.whatsapp_sale_drafts (business_id, status, expires_at);

alter table public.whatsapp_inbound_events enable row level security;
alter table public.whatsapp_sale_drafts enable row level security;
revoke all on public.whatsapp_inbound_events, public.whatsapp_sale_drafts from anon, authenticated;
grant all on public.whatsapp_inbound_events, public.whatsapp_sale_drafts to service_role;

create function public.register_whatsapp_event(
  p_provider text, p_message_id text, p_sender text, p_recipient text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_event public.whatsapp_inbound_events%rowtype;
  v_new boolean;
begin
  insert into public.whatsapp_inbound_events(provider, provider_message_id, sender, recipient)
    values(p_provider, p_message_id, p_sender, p_recipient)
    on conflict(provider, provider_message_id) do nothing returning * into v_event;
  v_new := found;
  if not v_new then
    select * into v_event from public.whatsapp_inbound_events
      where provider = p_provider and provider_message_id = p_message_id;
    if v_event.sender <> p_sender or v_event.recipient <> p_recipient then
      raise exception 'EVENT_IDENTITY_CONFLICT';
    end if;
  end if;
  return jsonb_build_object('event_id', v_event.id, 'is_new', v_new, 'status', v_event.status);
end;
$$;

create function public.create_whatsapp_sale_draft(p_sender text, p_operation_key text, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_business uuid;
  v_draft public.whatsapp_sale_drafts%rowtype;
  v_item jsonb;
begin
  select id into v_business from public.businesses where whatsapp_id = p_sender for update;
  if not found then raise exception 'BUSINESS_NOT_FOUND'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'INVALID_ITEMS'; end if;
  if jsonb_array_length(p_items) not between 1 and 100 then raise exception 'INVALID_ITEMS'; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object'
      or jsonb_typeof(v_item -> 'product_id') is distinct from 'string'
      or jsonb_typeof(v_item -> 'quantity') is distinct from 'number'
      or (v_item - 'product_id' - 'quantity') <> '{}'::jsonb then
      raise exception 'INVALID_ITEM';
    end if;
    if (v_item ->> 'quantity')::numeric <= 0
      or (v_item ->> 'quantity')::numeric > 999999999.999
      or round((v_item ->> 'quantity')::numeric, 3) <> (v_item ->> 'quantity')::numeric then
      raise exception 'INVALID_QUANTITY';
    end if;
    if not exists (select 1 from public.products
      where id = (v_item ->> 'product_id')::uuid and business_id = v_business) then
      raise exception 'PRODUCT_NOT_FOUND';
    end if;
  end loop;
  if (select count(distinct (value ->> 'product_id')::uuid) from jsonb_array_elements(p_items))
    <> jsonb_array_length(p_items) then raise exception 'DUPLICATE_PRODUCT'; end if;
  insert into public.whatsapp_sale_drafts(business_id, sender, operation_key, items)
    values(v_business, p_sender, p_operation_key, p_items)
    on conflict(business_id, operation_key) do nothing returning * into v_draft;
  if not found then
    select * into v_draft from public.whatsapp_sale_drafts
      where business_id = v_business and operation_key = p_operation_key;
    if v_draft.items <> p_items or v_draft.sender <> p_sender then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
  end if;
  return jsonb_build_object('draft_id', v_draft.id, 'status', v_draft.status, 'expires_at', v_draft.expires_at);
end;
$$;

create function public.confirm_whatsapp_sale_draft(p_sender text, p_draft_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_business uuid;
  v_draft public.whatsapp_sale_drafts%rowtype;
  v_receipt jsonb;
begin
  -- Same lock order as record_whatsapp_sale: business, then dependent rows.
  select id into v_business from public.businesses where whatsapp_id = p_sender for update;
  if not found then raise exception 'BUSINESS_NOT_FOUND'; end if;
  select * into v_draft from public.whatsapp_sale_drafts
    where id = p_draft_id and business_id = v_business and sender = p_sender for update;
  if not found then raise exception 'DRAFT_NOT_FOUND'; end if;
  if v_draft.status = 'cancelled' then raise exception 'DRAFT_CANCELLED'; end if;
  -- Already-confirmed drafts may replay after expiry; pending ones may not sell.
  if v_draft.status = 'pending' and v_draft.expires_at <= clock_timestamp() then
    raise exception 'DRAFT_EXPIRED';
  end if;
  v_receipt := public.record_whatsapp_sale(p_sender, 'draft:' || v_draft.id::text, v_draft.items, 'whatsapp');
  update public.whatsapp_sale_drafts set status = 'confirmed', sale_id = (v_receipt ->> 'sale_id')::uuid
    where id = v_draft.id;
  return v_receipt;
end;
$$;

create function public.cancel_whatsapp_sale_draft(p_sender text, p_draft_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_business uuid;
  v_draft public.whatsapp_sale_drafts%rowtype;
begin
  select id into v_business from public.businesses where whatsapp_id = p_sender for update;
  if not found then raise exception 'BUSINESS_NOT_FOUND'; end if;
  select * into v_draft from public.whatsapp_sale_drafts
    where id = p_draft_id and business_id = v_business and sender = p_sender for update;
  if not found then raise exception 'DRAFT_NOT_FOUND'; end if;
  if v_draft.status = 'confirmed' then raise exception 'DRAFT_ALREADY_CONFIRMED'; end if;
  update public.whatsapp_sale_drafts set status = 'cancelled' where id = v_draft.id;
  return jsonb_build_object('draft_id', v_draft.id, 'status', 'cancelled');
end;
$$;

revoke all on function public.register_whatsapp_event(text,text,text,text) from public, anon, authenticated;
revoke all on function public.create_whatsapp_sale_draft(text,text,jsonb) from public, anon, authenticated;
revoke all on function public.confirm_whatsapp_sale_draft(text,uuid) from public, anon, authenticated;
revoke all on function public.cancel_whatsapp_sale_draft(text,uuid) from public, anon, authenticated;
grant execute on function public.register_whatsapp_event(text,text,text,text) to service_role;
grant execute on function public.create_whatsapp_sale_draft(text,text,jsonb) to service_role;
grant execute on function public.confirm_whatsapp_sale_draft(text,uuid) to service_role;
grant execute on function public.cancel_whatsapp_sale_draft(text,uuid) to service_role;

