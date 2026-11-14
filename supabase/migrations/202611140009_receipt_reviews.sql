-- Durable, immutable OCR snapshots. Classification proposes; it never confirms accounting.
alter table public.business_media add constraint business_media_id_tenant_unique unique(id,business_id);
create table public.receipt_reviews (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  media_id uuid not null,
  media_sha256 text not null check(media_sha256 ~ '^[a-f0-9]{64}$'),
  extraction jsonb not null check(jsonb_typeof(extraction)='object' and octet_length(extraction::text)<=40000),
  classification text check(classification in ('sale','expense','purchase')),
  occurred_at timestamptz not null,
  expires_at timestamptz not null default(now()+interval '15 minutes'),
  created_at timestamptz not null default now(),
  unique(business_id,media_sha256),
  foreign key(media_id,business_id) references public.business_media(id,business_id)
);
alter table public.receipt_reviews enable row level security;
revoke all on public.receipt_reviews from anon,authenticated;
grant select,delete on public.receipt_reviews to service_role;

create function public.save_receipt_review(p_sender text,p_storage_key text,p_extraction jsonb,p_occurred_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare b uuid:=public.require_whatsapp_business(p_sender); m public.business_media%rowtype; r public.receipt_reviews%rowtype;
begin
  select * into m from public.business_media where business_id=b and storage_key=p_storage_key and kind='image';
  if not found then raise exception 'RECEIPT_MEDIA_NOT_FOUND'; end if;
  if p_extraction is null or jsonb_typeof(p_extraction)<>'object' or octet_length(p_extraction::text)>40000 or p_occurred_at is null then
    raise exception 'INVALID_RECEIPT_REVIEW'; end if;
  insert into public.receipt_reviews(business_id,media_id,media_sha256,extraction,occurred_at)
    values(b,m.id,m.sha256,p_extraction,p_occurred_at)
    on conflict(business_id,media_sha256) do nothing returning * into r;
  if not found then select * into r from public.receipt_reviews where business_id=b and media_sha256=m.sha256; end if;
  -- Never replace an earlier extraction or renew its deadline on reupload/retry.
  return to_jsonb(r);
end $$;

create function public.get_receipt_review(p_sender text,p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare b uuid:=public.require_whatsapp_business(p_sender); r public.receipt_reviews%rowtype;
begin
  select * into r from public.receipt_reviews where id=p_id and business_id=b;
  if not found then raise exception 'RECEIPT_REVIEW_NOT_FOUND'; end if;
  if r.expires_at<=clock_timestamp() then raise exception 'RECEIPT_REVIEW_EXPIRED'; end if;
  return to_jsonb(r);
end $$;

create function public.classify_receipt_review(p_sender text,p_id uuid,p_kind text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare b uuid:=public.require_whatsapp_business(p_sender); r public.receipt_reviews%rowtype;
begin
  if p_kind is null or p_kind not in ('sale','expense','purchase') then raise exception 'INVALID_RECEIPT_KIND'; end if;
  select * into r from public.receipt_reviews where id=p_id and business_id=b for update;
  if not found then raise exception 'RECEIPT_REVIEW_NOT_FOUND'; end if;
  if r.expires_at<=clock_timestamp() then raise exception 'RECEIPT_REVIEW_EXPIRED'; end if;
  if r.classification is not null and r.classification<>p_kind then raise exception 'RECEIPT_KIND_LOCKED'; end if;
  update public.receipt_reviews set classification=p_kind where id=r.id returning * into r;
  return to_jsonb(r);
end $$;
revoke all on function public.save_receipt_review(text,text,jsonb,timestamptz),public.get_receipt_review(text,uuid),
  public.classify_receipt_review(text,uuid,text) from public,anon,authenticated;
grant execute on function public.save_receipt_review(text,text,jsonb,timestamptz),public.get_receipt_review(text,uuid),
  public.classify_receipt_review(text,uuid,text) to service_role;
