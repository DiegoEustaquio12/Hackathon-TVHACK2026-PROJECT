-- Local-only checks; all fixtures are rolled back even on success.
do $$
declare
  b uuid := gen_random_uuid();
  other_b uuid := gen_random_uuid();
  p uuid := gen_random_uuid();
  draft uuid;
  second_draft uuid;
  receipt jsonb;
  result jsonb;
  event jsonb;
  cart jsonb;
begin
  begin
    insert into public.businesses(id,name,whatsapp_id) values
      (b,'Temporary Infobip test','19999990003'), (other_b,'Other sender','19999990004');
    update public.businesses set business_type = 'Abarrotes', onboarding_completed_at = now() where id in (b, other_b);
    insert into public.products(id,business_id,name,sale_price_cents,stock)
      values(p,b,'Product',2000,10);
    cart := jsonb_build_array(jsonb_build_object('product_id',p,'quantity',3));
    event := public.register_whatsapp_event('infobip','fixture-123','19999990003','19999999999');
    result := public.register_whatsapp_event('infobip','fixture-123','19999990003','19999999999');
    if (result ->> 'is_new')::boolean or result ->> 'event_id' <> event ->> 'event_id' then
      raise exception 'FAIL: event duplicated';
    end if;
    result := public.register_whatsapp_event('meta','fixture-123','19999990003','19999999999');
    if not (result ->> 'is_new')::boolean then raise exception 'FAIL: provider namespace'; end if;
    begin
      perform public.register_whatsapp_event('infobip','fixture-123','19999990004','19999999999');
      raise exception 'FAIL: event identity changed';
    exception when raise_exception then
      if sqlerrm <> 'EVENT_IDENTITY_CONFLICT' then raise; end if;
    end;

    draft := (public.create_whatsapp_sale_draft('19999990003','infobip:fixture-123',cart) ->> 'draft_id')::uuid;
    if (public.create_whatsapp_sale_draft('19999990003','infobip:fixture-123',cart) ->> 'draft_id')::uuid <> draft then
      raise exception 'FAIL: draft duplicated';
    end if;
    begin
      perform public.confirm_whatsapp_sale_draft('19999990004',draft,1);
      raise exception 'FAIL: foreign sender confirmed';
    exception when raise_exception then
      if sqlerrm <> 'DRAFT_NOT_FOUND' then raise; end if;
    end;
    receipt := public.confirm_whatsapp_sale_draft('19999990003',draft,1) -> 'receipt';
    result := public.confirm_whatsapp_sale_draft('19999990003',draft,1) -> 'receipt';
    if receipt ->> 'sale_id' <> result ->> 'sale_id' or not (result ->> 'replayed')::boolean
      or (select stock from public.products where id = p) <> 7
      or (select source from public.sales where id = (receipt ->> 'sale_id')::uuid) <> 'whatsapp' then
      raise exception 'FAIL: confirmation replay/source';
    end if;
    second_draft := (public.create_whatsapp_sale_draft('19999990003','expiry',cart) ->> 'draft_id')::uuid;
    update public.whatsapp_sale_drafts set expires_at = now() - interval '1 minute' where id = second_draft;
    begin
      perform public.confirm_whatsapp_sale_draft('19999990003',second_draft,1);
      raise exception 'FAIL: expired draft sold';
    exception when raise_exception then
      if sqlerrm <> 'DRAFT_EXPIRED' then raise; end if;
    end;
    perform public.cancel_whatsapp_sale_draft('19999990003',second_draft);
    begin
      perform public.confirm_whatsapp_sale_draft('19999990003',second_draft,1);
      raise exception 'FAIL: cancelled draft sold';
    exception when raise_exception then
      if sqlerrm <> 'DRAFT_CANCELLED' then raise; end if;
    end;
    if has_function_privilege('authenticated','public.confirm_whatsapp_sale_draft(text,uuid,integer)','execute')
      or has_table_privilege('anon','public.whatsapp_inbound_events','select')
      or has_table_privilege('authenticated','public.whatsapp_sale_drafts','insert') then
      raise exception 'FAIL: conversations exposed to client';
    end if;
    raise exception using errcode = 'ZX001', message = 'Rollback checks';
  exception when sqlstate 'ZX001' then
    raise notice 'PASS: event deduplication, namespace, identity, drafts, replay, expiration, cancellation and permissions';
  end;
end;
$$;
