-- Proposed additive migration for R1 review. Apply once with privileged migration role.
-- No deployment is performed by this file. Payload retention must be configured operationally.
create table public.r2_events (
  event_key text primary key, sender text not null, recipient text not null,
  payload jsonb not null, state text not null check(state in ('processing','completed','failed')),
  lease_id uuid not null, lease_until timestamptz not null, reply text,
  check (state <> 'completed' or reply is not null)
);
create table public.r2_sessions (
  token_hash text primary key, actor jsonb not null, expires_at bigint not null, revoked_at bigint
);
create table public.r2_links (
  token_hash text primary key, actor jsonb not null, expires_at bigint not null, consumed boolean not null default false, revoked boolean not null default false
);
alter table public.r2_events enable row level security;
alter table public.r2_sessions enable row level security;
alter table public.r2_links enable row level security;
revoke all on public.r2_events, public.r2_sessions, public.r2_links from anon, authenticated;
grant all on public.r2_events, public.r2_sessions, public.r2_links to service_role;

create function public.r2_claim_event(p_key text, p_sender text, p_recipient text, p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare r public.r2_events; lease uuid := gen_random_uuid();
begin
  insert into public.r2_events values(p_key,p_sender,p_recipient,p_payload,'processing',lease,now()+interval '60 seconds',null)
  on conflict do nothing;
  select * into r from public.r2_events where event_key=p_key for update;
  if r.sender <> p_sender or r.recipient <> p_recipient or r.payload <> p_payload then raise exception 'EVENT_IDENTITY_CONFLICT'; end if;
  if r.lease_id=lease then return jsonb_build_object('state','claimed','leaseId',lease); end if;
  if r.state='completed' then return jsonb_build_object('state','completed','reply',r.reply); end if;
  if r.state='processing' and r.lease_until > now() then return jsonb_build_object('state','busy'); end if;
  update public.r2_events set state='processing',lease_id=lease,lease_until=now()+interval '60 seconds' where event_key=p_key;
  return jsonb_build_object('state','claimed','leaseId',lease);
end $$;
create function public.r2_finish_event(p_key text,p_lease uuid,p_reply text)
returns void language plpgsql security invoker set search_path = public as $$
begin
  update public.r2_events set state=case when p_reply is null then 'failed' else 'completed' end, reply=p_reply
  where event_key=p_key and lease_id=p_lease and state='processing' and lease_until>now();
  if not found then raise exception 'LEASE_LOST'; end if;
end $$;
create function public.r2_consume_link(p_hash text,p_now bigint)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare identity jsonb;
begin
  update public.r2_links set consumed=true where token_hash=p_hash and not consumed and not revoked and expires_at>p_now returning actor into identity;
  return identity;
end $$;
revoke all on function public.r2_claim_event(text,text,text,jsonb), public.r2_finish_event(text,uuid,text), public.r2_consume_link(text,bigint) from public, anon, authenticated;
grant execute on function public.r2_claim_event(text,text,text,jsonb), public.r2_finish_event(text,uuid,text), public.r2_consume_link(text,bigint) to service_role;
