-- Reviewed R2 storage: service-role only, durable replies and fenced leases.
create table public.r2_events (
  event_key text primary key check(length(event_key) between 1 and 220),
  sender text not null check(sender ~ '^[1-9][0-9]{7,14}$'),
  recipient text not null check(recipient ~ '^[1-9][0-9]{7,14}$'),
  created_at timestamptz not null default now(),
  payload jsonb not null, state text not null check(state in ('processing','completed','failed')),
  lease_id uuid not null, lease_until timestamptz not null, reply text,
  check (state <> 'completed' or reply is not null)
);
create table public.r2_sessions (
  token_hash text primary key check(token_hash ~ '^[a-f0-9]{64}$'), actor jsonb not null, expires_at bigint not null check(expires_at > 0), revoked_at bigint
);
create table public.r2_links (
  token_hash text primary key check(token_hash ~ '^[a-f0-9]{64}$'), actor jsonb not null, expires_at bigint not null check(expires_at > 0), consumed boolean not null default false, revoked boolean not null default false
);
alter table public.r2_events enable row level security;
alter table public.r2_sessions enable row level security;
alter table public.r2_links enable row level security;
revoke all on public.r2_events, public.r2_sessions, public.r2_links from anon, authenticated;
grant all on public.r2_events, public.r2_sessions, public.r2_links to service_role;

create function public.r2_claim_event(p_key text, p_sender text, p_recipient text, p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare r public.r2_events; lease uuid := gen_random_uuid();
begin
  insert into public.r2_events(event_key,sender,recipient,payload,state,lease_id,lease_until,reply) values(p_key,p_sender,p_recipient,p_payload,'processing',lease,clock_timestamp()+interval '60 seconds',null)
  on conflict do nothing;
  select * into r from public.r2_events where event_key=p_key for update;
  if r.sender <> p_sender or r.recipient <> p_recipient or r.payload <> p_payload then raise exception 'EVENT_IDENTITY_CONFLICT'; end if;
  if r.lease_id=lease then return jsonb_build_object('state','claimed','leaseId',lease); end if;
  if r.state='completed' then return jsonb_build_object('state','completed','reply',r.reply); end if;
  if r.state='processing' and r.lease_until > clock_timestamp() then return jsonb_build_object('state','busy'); end if;
  update public.r2_events set state='processing',lease_id=lease,lease_until=clock_timestamp()+interval '60 seconds' where event_key=p_key;
  return jsonb_build_object('state','claimed','leaseId',lease);
end $$;
create function public.r2_finish_event(p_key text,p_lease uuid,p_reply text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  update public.r2_events set state=case when p_reply is null then 'failed' else 'completed' end, reply=p_reply
  where event_key=p_key and lease_id=p_lease and state='processing' and lease_until>clock_timestamp();
  if not found then raise exception 'LEASE_LOST'; end if;
end $$;
create function public.r2_consume_link(p_hash text,p_now bigint)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare identity jsonb;
begin
  update public.r2_links set consumed=true where token_hash=p_hash and not consumed and not revoked and expires_at>p_now returning actor into identity;
  return identity;
end $$;
revoke all on function public.r2_claim_event(text,text,text,jsonb), public.r2_finish_event(text,uuid,text), public.r2_consume_link(text,bigint) from public, anon, authenticated;
grant execute on function public.r2_claim_event(text,text,text,jsonb), public.r2_finish_event(text,uuid,text), public.r2_consume_link(text,bigint) to service_role;

create index r2_events_recovery_idx on public.r2_events(state,lease_until);
create index r2_events_retention_idx on public.r2_events(created_at);
create index r2_sessions_expiry_idx on public.r2_sessions(expires_at);
create index r2_links_expiry_idx on public.r2_links(expires_at);

create table public.r2_expense_drafts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  operation_key text not null check(length(operation_key) between 1 and 200),
  concept text not null check(length(trim(concept)) between 1 and 200),
  amount_cents integer not null check(amount_cents > 0),
  occurred_at timestamptz not null,
  expires_at timestamptz not null default (now()+interval '15 minutes'),
  status text not null default 'pending' check(status in ('pending','confirmed','cancelled')),
  expense_id uuid references public.expenses(id),
  unique(business_id,operation_key),
  check ((status='confirmed') = (expense_id is not null))
);
create index r2_expense_pending_idx on public.r2_expense_drafts(business_id,status,expires_at);
alter table public.r2_expense_drafts enable row level security;
revoke all on public.r2_expense_drafts from anon,authenticated;
grant all on public.r2_expense_drafts to service_role;

create function public.r2_propose_expense(p_sender text,p_key text,p_concept text,p_amount integer,p_occurred_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare b uuid := public.require_whatsapp_business(p_sender); d public.r2_expense_drafts%rowtype;
begin
  insert into public.r2_expense_drafts(business_id,operation_key,concept,amount_cents,occurred_at)
    values(b,p_key,trim(p_concept),p_amount,p_occurred_at)
    on conflict(business_id,operation_key) do nothing returning * into d;
  if not found then
    select * into d from public.r2_expense_drafts where business_id=b and operation_key=p_key;
    if d.concept<>trim(p_concept) or d.amount_cents<>p_amount or d.occurred_at<>p_occurred_at then
      raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  end if;
  return jsonb_build_object('draft_id',d.id,'status',d.status,'expires_at',d.expires_at);
end;
$$;

create function public.r2_confirm_expense(p_sender text,p_draft_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare b uuid := public.require_whatsapp_business(p_sender); d public.r2_expense_drafts%rowtype; receipt jsonb;
begin
  select * into d from public.r2_expense_drafts where id=p_draft_id and business_id=b for update;
  if not found then raise exception 'EXPENSE_DRAFT_NOT_FOUND'; end if;
  if d.status='cancelled' then raise exception 'EXPENSE_DRAFT_CANCELLED'; end if;
  if d.status='pending' and d.expires_at<=clock_timestamp() then raise exception 'EXPENSE_DRAFT_EXPIRED'; end if;
  receipt := public.record_whatsapp_expense(p_sender,'expense-draft:'||d.id::text,d.concept,d.amount_cents,d.occurred_at);
  update public.r2_expense_drafts set status='confirmed',expense_id=(receipt->>'id')::uuid where id=d.id;
  return receipt;
end;
$$;

create function public.r2_cancel_expense(p_sender text,p_draft_id uuid default null)
returns integer language plpgsql security definer set search_path='' as $$
declare b uuid := public.require_whatsapp_business(p_sender); n integer;
begin
  if p_draft_id is not null then
    if not exists(select 1 from public.r2_expense_drafts where id=p_draft_id and business_id=b) then
      raise exception 'EXPENSE_DRAFT_NOT_FOUND'; end if;
    if exists(select 1 from public.r2_expense_drafts where id=p_draft_id and business_id=b and status='confirmed') then
      raise exception 'EXPENSE_ALREADY_CONFIRMED'; end if;
  end if;
  update public.r2_expense_drafts set status='cancelled'
    where business_id=b and status='pending' and (p_draft_id is null or id=p_draft_id);
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.r2_propose_expense(text,text,text,integer,timestamptz),
  public.r2_confirm_expense(text,uuid), public.r2_cancel_expense(text,uuid) from public,anon,authenticated;
grant execute on function public.r2_propose_expense(text,text,text,integer,timestamptz),
  public.r2_confirm_expense(text,uuid), public.r2_cancel_expense(text,uuid) to service_role;
