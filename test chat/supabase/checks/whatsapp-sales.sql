-- Local-only behavioral checks. The nested transaction rolls back all fixtures.
do $$
declare
  b uuid := gen_random_uuid();
  other_b uuid := gen_random_uuid();
  p uuid := gen_random_uuid();
  bread uuid := gen_random_uuid();
  foreign_p uuid := gen_random_uuid();
  cart jsonb;
  receipt jsonb;
  replay jsonb;
  n integer;
begin
  begin
    insert into public.businesses (id, name, whatsapp_id) values
      (b, 'Temporary test business', '19999990001'),
      (other_b, 'Other test business', '19999990002');
    update public.businesses set business_type = 'Abarrotes', onboarding_completed_at = now() where id in (b, other_b);
    insert into public.products (id, business_id, name, sale_price_cents, stock) values
      (p, b, 'Coca', 2000, 10), (bread, b, 'Pan', 1500, 10),
      (foreign_p, other_b, 'Foreign product', 100, 10);
    cart := jsonb_build_array(jsonb_build_object('product_id', p, 'quantity', 3),
                             jsonb_build_object('product_id', bread, 'quantity', 2));
    receipt := public.record_whatsapp_sale('19999990001', 'test-event', cart);
    if (receipt ->> 'total_cents')::integer <> 9000
      or jsonb_array_length(receipt -> 'items') <> 2
      or (receipt ->> 'replayed')::boolean then raise exception 'FAIL: sale receipt'; end if;
    if (select stock from public.products where id = p) <> 7
      or (select stock from public.products where id = bread) <> 8 then
      raise exception 'FAIL: stock deduction';
    end if;
    update public.products set sale_price_cents = 2500 where id = p;
    replay := public.record_whatsapp_sale('19999990001', 'test-event', cart);
    if replay ->> 'sale_id' <> receipt ->> 'sale_id'
      or (replay ->> 'total_cents')::integer <> 9000
      or not (replay ->> 'replayed')::boolean
      or (select stock from public.products where id = p) <> 7 then
      raise exception 'FAIL: replay or price snapshot';
    end if;
    begin
      perform public.record_whatsapp_sale('19999990001', 'test-event',
        jsonb_build_array(jsonb_build_object('product_id', p, 'quantity', 1)));
      raise exception 'FAIL: idempotency conflict accepted';
    exception when raise_exception then
      if sqlerrm <> 'IDEMPOTENCY_CONFLICT' then raise; end if;
    end;
    begin
      perform public.record_whatsapp_sale('19999990001', 'shortage',
        jsonb_build_array(jsonb_build_object('product_id', p, 'quantity', 1),
                           jsonb_build_object('product_id', bread, 'quantity', 100)));
      raise exception 'FAIL: insufficient stock accepted';
    exception when raise_exception then
      if sqlerrm <> 'OUT_OF_STOCK' then raise; end if;
    end;
    if (select count(*) from public.sales where business_id = b) <> 1
      or (select stock from public.products where id = p) <> 7 then
      raise exception 'FAIL: partial sale persisted';
    end if;
    begin
      perform public.record_whatsapp_sale('19999990001', 'foreign',
        jsonb_build_array(jsonb_build_object('product_id', foreign_p, 'quantity', 1)));
      raise exception 'FAIL: cross-business product accepted';
    exception when raise_exception then
      if sqlerrm <> 'PRODUCT_NOT_FOUND' then raise; end if;
    end;
    begin
      perform public.record_whatsapp_sale('19999990001', 'price-injection',
        jsonb_build_array(jsonb_build_object('product_id', p, 'quantity', 1, 'unit_price_cents', 1)));
      raise exception 'FAIL: supplied price accepted';
    exception when raise_exception then
      if sqlerrm <> 'INVALID_ITEM' then raise; end if;
    end;
    if has_function_privilege('authenticated', 'public.record_whatsapp_sale(text,text,jsonb,text)', 'execute')
      or has_function_privilege('anon', 'public.record_whatsapp_sale(text,text,jsonb,text)', 'execute')
      or has_table_privilege('authenticated', 'public.sales', 'insert')
      or has_table_privilege('authenticated', 'public.sale_items', 'update') then
      raise exception 'FAIL: client can bypass controlled sale';
    end if;
    perform set_config('request.jwt.claims', jsonb_build_object('app_metadata',
      jsonb_build_object('business_id', b))::text, true);
    execute 'set local role authenticated';
    select count(*) into n from public.products;
    if n <> 2 then raise exception 'FAIL: RLS product isolation'; end if;
    execute 'reset role';
    raise exception using errcode = 'ZX001', message = 'Rollback successful checks';
  exception when sqlstate 'ZX001' then
    raise notice 'PASS: sale, stock, price snapshot, idempotency, shortage rollback, tenant isolation, price injection, permissions, RLS; fixtures rolled back';
  end;
end;
$$;
