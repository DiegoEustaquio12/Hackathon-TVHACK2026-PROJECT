-- Checks roll back all fixtures; only run on local development.
do $$
declare
  b uuid;
  p uuid := gen_random_uuid();
  d uuid;
  cart jsonb;
  result jsonb;
begin
  begin
    result := public.complete_business_onboarding('19999990005','Test shop','Papelería');
    b := (result ->> 'id')::uuid;
    if (public.complete_business_onboarding('19999990005','Test shop','Papelería') ->> 'id')::uuid <> b then
      raise exception 'FAIL: onboarding retry'; end if;
    if (select business_type from public.businesses where id = b) <> 'Papelería' then
      raise exception 'FAIL: business type missing'; end if;
    begin
      perform public.complete_business_onboarding('19999990006','Other', ' ');
      raise exception 'FAIL: empty business type accepted';
    exception when raise_exception then
      if sqlerrm <> 'INVALID_ONBOARDING' then raise; end if;
    end;
    insert into public.products(id,business_id,name,sale_price_cents,stock) values(p,b,'Product',2000,10);
    cart := jsonb_build_array(jsonb_build_object('product_id',p,'quantity',3));
    update public.businesses set onboarding_completed_at = null where id = b;
    begin
      perform public.record_whatsapp_sale('19999990005','before-onboarding',cart);
      raise exception 'FAIL: sale allowed before explicit onboarding';
    exception when raise_exception then
      if sqlerrm <> 'ONBOARDING_REQUIRED' then raise; end if;
    end;
    update public.businesses set onboarding_completed_at = now() where id = b;
    result := public.create_whatsapp_sale_draft('19999990005','price-fixture',cart);
    d := (result ->> 'draft_id')::uuid;
    if (result #>> '{quote,total_cents}')::integer <> 6000 then raise exception 'FAIL: initial quote'; end if;
    update public.products set sale_price_cents = 2500 where id = p;
    result := public.confirm_whatsapp_sale_draft('19999990005',d,1);
    if result ->> 'status' <> 'price_changed' or (result #>> '{previous_quote,total_cents}')::integer <> 6000
      or (result #>> '{quote,total_cents}')::integer <> 7500 then raise exception 'FAIL: price change not clear'; end if;
    if exists(select 1 from public.sales where business_id = b)
      or (select stock from public.products where id = p) <> 10 then raise exception 'FAIL: sold without new approval'; end if;
    result := public.confirm_whatsapp_sale_draft('19999990005',d,1);
    if result ->> 'status' <> 'quote_outdated' then raise exception 'FAIL: stale button approved'; end if;
    result := public.confirm_whatsapp_sale_draft('19999990005',d,2);
    if result ->> 'status' <> 'confirmed' or (result #>> '{receipt,total_cents}')::integer <> 7500 then
      raise exception 'FAIL: updated quote approval'; end if;
    result := public.confirm_whatsapp_sale_draft('19999990005',d,2);
    if not (result #>> '{receipt,replayed}')::boolean or (select stock from public.products where id=p) <> 7 then
      raise exception 'FAIL: confirmation replay'; end if;
    if has_function_privilege('anon','public.complete_business_onboarding(text,text,text)','execute')
      or has_function_privilege('authenticated','public.confirm_whatsapp_sale_draft(text,uuid,integer)','execute') then
      raise exception 'FAIL: privileged RPC exposed'; end if;
    raise exception using errcode='ZX001',message='Rollback successful checks';
  exception when sqlstate 'ZX001' then raise notice 'PASS: explicit onboarding and versioned price approval';
  end;
end;
$$;
