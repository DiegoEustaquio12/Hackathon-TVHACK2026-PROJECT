-- Private MVP media. Binary objects live in Storage, references in PostgreSQL.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
  ('business-audio','business-audio',false,10485760,array['audio/ogg','audio/mpeg','audio/mp4','audio/wav','audio/webm','audio/flac']),
  ('business-images','business-images',false,10485760,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create table public.business_media (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  operation_key text not null check(length(operation_key) between 1 and 200),
  kind text not null check(kind in ('audio','image')),
  bucket_id text not null check(bucket_id in ('business-audio','business-images')),
  storage_key text not null unique,
  mime_type text not null,
  byte_size integer not null check(byte_size between 1 and 10485760),
  sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  unique(business_id,operation_key),
  check((kind='audio' and bucket_id='business-audio') or (kind='image' and bucket_id='business-images')),
  check(storage_key like business_id::text || '/%')
);
alter table public.business_media enable row level security;
revoke all on public.business_media from anon,authenticated;
grant all on public.business_media to service_role;

-- Restrictive policies deny client access even if a future broad permissive policy is added.
-- WhatsApp identity is verified in the server; service_role bypasses RLS.
create policy "private business media deny clients" on storage.objects as restrictive
  for all to anon,authenticated
  using(bucket_id not in ('business-audio','business-images'))
  with check(bucket_id not in ('business-audio','business-images'));
create policy "private business buckets deny clients" on storage.buckets as restrictive
  for all to anon,authenticated
  using(id not in ('business-audio','business-images'))
  with check(id not in ('business-audio','business-images'));
