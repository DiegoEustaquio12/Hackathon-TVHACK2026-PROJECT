-- Owner-run SQL acceptance. All metadata fixtures are reverted; no Storage object is created.
do $$
declare sender text:='1999'||lpad(floor(random()*10000000000)::bigint::text,10,'0');
  other_sender text:='1888'||lpad(floor(random()*10000000000)::bigint::text,10,'0');
  b uuid; other_b uuid; m uuid:=gen_random_uuid(); m2 uuid:=gen_random_uuid(); key text; r jsonb; replay jsonb;
  extraction jsonb:='{"readable":true,"merchant":"Fixture","date":null,"currency":"MXN","total_cents":100,"items":[],"warnings":[]}';
  role_name text;
begin
 begin
  if exists(select 1 from public.businesses where whatsapp_id in(sender,other_sender)) then raise exception 'Fixture identity exists'; end if;
  b:=(public.complete_business_onboarding(sender,'Receipt fixture','Abarrotes')->>'id')::uuid;
  other_b:=(public.complete_business_onboarding(other_sender,'Other receipt fixture','Abarrotes')->>'id')::uuid;
  key:=b::text||'/image/'||m::text;
  insert into public.business_media(id,business_id,operation_key,kind,bucket_id,storage_key,mime_type,byte_size,sha256)
    values(m,b,'fixture','image','business-images',key,'image/png',1,repeat('a',64)),
      (m2,b,'fixture-2','image','business-images',b::text||'/image/'||m2::text,'image/png',1,repeat('a',64));
  r:=public.save_receipt_review(sender,key,extraction,now());
  replay:=public.save_receipt_review(sender,b::text||'/image/'||m2::text,extraction||'{"total_cents":999}',now()+interval '1 second');
  if r->>'id'<>replay->>'id' or r->'extraction'<>replay->'extraction' or r->>'expires_at'<>replay->>'expires_at' then
    raise exception 'FAIL: receipt snapshot/hash idempotency'; end if;
  perform public.classify_receipt_review(sender,(r->>'id')::uuid,'sale');
  perform public.classify_receipt_review(sender,(r->>'id')::uuid,'sale');
  begin
    perform public.classify_receipt_review(sender,(r->>'id')::uuid,'expense');
    raise exception 'FAIL: classification changed';
  exception when raise_exception then if sqlerrm<>'RECEIPT_KIND_LOCKED' then raise; end if; end;
  begin
    perform public.get_receipt_review(other_sender,(r->>'id')::uuid);
    raise exception 'FAIL: foreign receipt exposed';
  exception when raise_exception then if sqlerrm<>'RECEIPT_REVIEW_NOT_FOUND' then raise; end if; end;
  begin
    perform public.save_receipt_review(other_sender,key,extraction,now());
    raise exception 'FAIL: foreign media accepted';
  exception when raise_exception then if sqlerrm<>'RECEIPT_MEDIA_NOT_FOUND' then raise; end if; end;
  update public.receipt_reviews set expires_at=now()-interval '1 second' where id=(r->>'id')::uuid;
  begin
    perform public.classify_receipt_review(sender,(r->>'id')::uuid,'sale');
    raise exception 'FAIL: expired receipt accepted';
  exception when raise_exception then if sqlerrm<>'RECEIPT_REVIEW_EXPIRED' then raise; end if; end;
  foreach role_name in array array['anon','authenticated'] loop
    if has_table_privilege(role_name,'public.receipt_reviews','select,insert,update,delete')
      or has_function_privilege(role_name,'public.save_receipt_review(text,text,jsonb,timestamptz)','execute')
      or has_function_privilege(role_name,'public.get_receipt_review(text,uuid)','execute')
      or has_function_privilege(role_name,'public.classify_receipt_review(text,uuid,text)','execute') then raise exception 'FAIL: receipt permissions'; end if;
  end loop;
  if has_table_privilege('service_role','public.receipt_reviews','update,insert') then raise exception 'FAIL: snapshot directly writable'; end if;
  if exists(select 1 from public.sales where business_id=b) or exists(select 1 from public.expenses where business_id=b) then
    raise exception 'FAIL: classification registered accounting'; end if;
  raise exception using errcode='ZX901',message='Rollback checks';
 exception when sqlstate 'ZX901' then raise notice 'PASS: immutable receipt snapshots, exact-image dedupe, classification, tenant isolation, expiration, permissions and no accounting effects';
 end;
end $$;
