-- Local-only checks. Fixtures are rolled back on success.
do $$
declare
  key text := 'check:'||gen_random_uuid()::text;
  link text := replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
  result jsonb;
  first_lease uuid;
  lease uuid;
  draft uuid;
  confirmed uuid;
  b uuid;
  receipt jsonb;
begin
  begin
    result := public.r2_claim_event(key,'19999990008','19999999999','{"kind":"text"}');
    first_lease := (result->>'leaseId')::uuid;
    if result->>'state'<>'claimed' then raise exception 'FAIL: first claim'; end if;
    result := public.r2_claim_event(key,'19999990008','19999999999','{"kind":"text"}');
    if result->>'state'<>'busy' then raise exception 'FAIL: simultaneous claim'; end if;
    begin
      perform public.r2_claim_event(key,'19999990009','19999999999','{"kind":"text"}');
      raise exception 'FAIL: identity changed';
    exception when raise_exception then if sqlerrm<>'EVENT_IDENTITY_CONFLICT' then raise; end if; end;
    update public.r2_events set lease_until=clock_timestamp()-interval '1 second' where event_key=key;
    result := public.r2_claim_event(key,'19999990008','19999999999','{"kind":"text"}');
    lease := (result->>'leaseId')::uuid;
    if lease=first_lease then raise exception 'FAIL: expired lease reused'; end if;
    begin
      perform public.r2_finish_event(key,first_lease,'stale reply');
      raise exception 'FAIL: stale worker wrote reply';
    exception when raise_exception then if sqlerrm<>'LEASE_LOST' then raise; end if; end;
    perform public.r2_finish_event(key,lease,'stored reply');
    result := public.r2_claim_event(key,'19999990008','19999999999','{"kind":"text"}');
    if result->>'state'<>'completed' or result->>'reply'<>'stored reply' then raise exception 'FAIL: replay'; end if;
    insert into public.r2_links(token_hash,actor,expires_at) values(link,'{"businessId":"fixture"}',9999999999999);
    if public.r2_consume_link(link,1) is null then raise exception 'FAIL: valid link'; end if;
    if public.r2_consume_link(link,1) is not null then raise exception 'FAIL: link reused'; end if;
    b := (public.complete_business_onboarding('19999990008','Storage fixture','Abarrotes')->>'id')::uuid;
    result := public.r2_propose_expense('19999990008','cancel','luz',5000,'2026-11-14T12:00:00Z');
    draft := (result->>'draft_id')::uuid;
    if public.r2_cancel_expense('19999990008',draft)<>1 then raise exception 'FAIL: cancellation'; end if;
    begin
      perform public.r2_confirm_expense('19999990008',draft);
      raise exception 'FAIL: cancelled expense confirmed';
    exception when raise_exception then if sqlerrm<>'EXPENSE_DRAFT_CANCELLED' then raise; end if; end;
    if exists(select 1 from public.expenses where business_id=b) then raise exception 'FAIL: cancelled expense persisted'; end if;
    confirmed := (public.r2_propose_expense('19999990008','confirm','agua',200,'2026-11-14T12:00:00Z')->>'draft_id')::uuid;
    receipt := public.r2_confirm_expense('19999990008',confirmed);
    if public.r2_confirm_expense('19999990008',confirmed)->>'id' <> receipt->>'id' then raise exception 'FAIL: expense replay'; end if;
    begin
      perform public.r2_cancel_expense('19999990008',confirmed);
      raise exception 'FAIL: confirmed expense cancelled';
    exception when raise_exception then if sqlerrm<>'EXPENSE_ALREADY_CONFIRMED' then raise; end if; end;
    draft := (public.r2_propose_expense('19999990008','expire','renta',300,'2026-11-14T12:00:00Z')->>'draft_id')::uuid;
    update public.r2_expense_drafts set expires_at=now()-interval '1 second' where id=draft;
    begin
      perform public.r2_confirm_expense('19999990008',draft);
      raise exception 'FAIL: expired expense confirmed';
    exception when raise_exception then if sqlerrm<>'EXPENSE_DRAFT_EXPIRED' then raise; end if; end;
    if has_table_privilege('authenticated','public.r2_events','select')
      or has_function_privilege('anon','public.r2_confirm_expense(text,uuid)','execute') then raise exception 'FAIL: public access'; end if;
    raise exception using errcode='ZX001',message='Rollback checks';
  exception when sqlstate 'ZX001' then raise notice 'PASS: storage, leases, identity, replay, single-use links, expense cancellation/expiry and permissions'; end;
end;
$$;
