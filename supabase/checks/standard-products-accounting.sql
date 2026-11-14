do $$
declare
  b uuid;
  p uuid;
  large uuid;
  draft uuid;
  sale_id uuid;
  result jsonb;
  spec jsonb := '{"product_type":"Refresco","brand":"Coca-Cola","variant":"Original","presentation":"Botella PET","content_amount":600,"content_unit":"ml","sale_unit":"piece","aliases":["coca"]}';
  cart jsonb;
begin
  begin
    b := (public.complete_business_onboarding('19999990007','Test standard shop','Abarrotes') ->> 'id')::uuid;
    result := public.create_standard_product('19999990007','small',spec,2000,10);
    p := (result ->> 'id')::uuid;
    if result ->> 'name' not like '%600 ml%' then raise exception 'FAIL: canonical display name %',result; end if;
    begin
      perform public.update_product_commercials('19999990007',p,100,100,
        '{"price_cents":2000,"stock":9,"cost_cents":null}');
      raise exception 'FAIL: stale stock form overwrote inventory';
    exception when raise_exception then if sqlerrm <> 'PRODUCT_CHANGED' then raise; end if; end;
    perform public.update_product_commercials('19999990007',p,2000,10,
      '{"price_cents":2000,"stock":10,"cost_cents":null}');
    if (public.create_standard_product('19999990007','small',spec,2000,10) ->> 'id')::uuid <> p then
      raise exception 'FAIL: creation replay'; end if;
    result := public.create_standard_product('19999990007','equivalent',
      spec || '{"content_amount":0.6,"content_unit":"l"}',2000,10);
    if (result ->> 'id')::uuid <> p then raise exception 'FAIL: duplicate 0.6l/600ml'; end if;
    large := (public.create_standard_product('19999990007','large',spec || '{"content_amount":2000}',4000,10) ->> 'id')::uuid;
    if large=p then raise exception 'FAIL: different presentations merged'; end if;
    cart := jsonb_build_array(jsonb_build_object('product_id',p,'quantity',0.5));
    draft := (public.create_whatsapp_sale_draft('19999990007','fractional',cart) ->> 'draft_id')::uuid;
    begin
      perform public.confirm_whatsapp_sale_draft('19999990007',draft,1);
      raise exception 'FAIL: fractional piece sale';
    exception when raise_exception then if sqlerrm <> 'INVALID_PRODUCT_UNIT' then raise; end if; end;
    if (select stock from public.products where id=p) <> 10 then raise exception 'FAIL: rejected sale changed stock'; end if;
    cart := jsonb_build_array(jsonb_build_object('product_id',p,'quantity',3));
    draft := (public.create_whatsapp_sale_draft('19999990007','sale',cart) ->> 'draft_id')::uuid;
    result := public.confirm_whatsapp_sale_draft('19999990007',draft,1);
    sale_id := (result #>> '{receipt,sale_id}')::uuid;
    update public.sales set occurred_at='2026-11-14T06:00:00Z' where id=sale_id;
    perform public.record_whatsapp_expense('19999990007','expense','luz',5000,'2026-11-14T06:00:00Z');
    perform public.record_whatsapp_expense('19999990007','expense','luz',5000,'2026-11-14T06:00:00Z');
    if (select count(*) from public.expenses where business_id=b) <> 1 then raise exception 'FAIL: expense duplicate'; end if;
    begin
      perform public.record_whatsapp_expense('19999990007','expense','luz',100);
      raise exception 'FAIL: expense key reused';
    exception when raise_exception then if sqlerrm <> 'IDEMPOTENCY_CONFLICT' then raise; end if; end;
    begin
      perform public.get_business_daily_report('19999990007','2026-11-14');
      raise exception 'FAIL: guessed time zone';
    exception when raise_exception then if sqlerrm <> 'TIME_ZONE_REQUIRED' then raise; end if; end;
    perform public.set_business_time_zone('19999990007','America/Mexico_City');
    perform public.record_whatsapp_expense('19999990007','previous','previous',999,'2026-11-14T05:59:59Z');
    perform public.record_whatsapp_expense('19999990007','next','next',999,'2026-11-15T06:00:00Z');
    result := public.get_business_daily_report('19999990007','2026-11-14');
    if (result ->> 'sales_total_cents')::integer <> 6000
      or (result ->> 'expenses_total_cents')::integer <> 5000
      or (result ->> 'sales_count')::integer <> 1
      or (result #>> '{sold_items,0,quantity}')::numeric <> 3 then
      raise exception 'FAIL: daily totals or local boundaries %',result; end if;
    if has_table_privilege('authenticated','public.products','insert')
      or has_function_privilege('anon','public.get_business_daily_report(text,date)','execute') then
      raise exception 'FAIL: client bypasses controlled operations'; end if;
    raise exception using errcode='ZX001',message='Rollback fixtures';
  exception when sqlstate 'ZX001' then raise notice 'PASS: standard products, unit normalization, quantities, expenses and daily reports'; end;
end;
$$;
