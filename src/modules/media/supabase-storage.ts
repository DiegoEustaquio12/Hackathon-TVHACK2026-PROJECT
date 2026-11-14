import { createHash, randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { findBusinessByWhatsApp } from '../data/businesses';
import { AudioError, MAX_AUDIO_BYTES, type AudioActor, type AudioReference, type TrustedAudioReader } from './audio';
import { canonicalMime, validateMediaContent, type MediaKind } from './formats';

const recordSchema=z.object({ business_id:z.string().uuid(),kind:z.enum(['audio','image']),
  bucket_id:z.enum(['business-audio','business-images']),storage_key:z.string(),mime_type:z.string(),
  byte_size:z.number().int().positive().max(MAX_AUDIO_BYTES),sha256:z.string().regex(/^[a-f0-9]{64}$/) });
const digest=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const buckets={audio:'business-audio',image:'business-images'} as const;

/** Server only. Never expose serviceKey or accept an actor from a browser/body. */
export function createSupabaseMediaStore(config:{client:SupabaseClient;url:string;serviceKey:string},fetcher:typeof fetch=fetch) {
  const base=new URL(config.url);
  if((base.protocol!=='https:' && !(base.protocol==='http:'&&['127.0.0.1','localhost'].includes(base.hostname)))
    ||base.username||base.password||base.pathname!=='/'||base.search||base.hash||!config.serviceKey) throw new Error('Invalid storage configuration');
  async function authorize(actor:AudioActor) {
    const business=await findBusinessByWhatsApp(config.client,actor.verifiedSender);
    if(!business?.onboarding_completed_at||business.id!==actor.businessId) throw new Error('MEDIA_ACCESS_DENIED');
  }
  async function privateBucket(bucket:string) {
    const {data,error}=await config.client.storage.getBucket(bucket);
    if(error||!data||data.public) throw new Error('PRIVATE_MEDIA_BUCKET_REQUIRED');
  }
  function reference(row:z.infer<typeof recordSchema>):AudioReference {
    return {storageKey:row.storage_key,mimeType:row.mime_type};
  }
  return {
    async find(actor:AudioActor,operationKey:string,kind:MediaKind):Promise<AudioReference|null> {
      await authorize(actor);
      const {data,error}=await config.client.from('business_media').select('*').eq('business_id',actor.businessId)
        .eq('operation_key',operationKey).maybeSingle();
      if(error) throw new Error('MEDIA_METADATA_UNAVAILABLE');
      if(!data) return null;
      const row=recordSchema.parse(data);
      if(row.kind!==kind||row.bucket_id!==buckets[kind]) throw new Error('MEDIA_IDEMPOTENCY_CONFLICT');
      await privateBucket(row.bucket_id);
      return reference(row);
    },
    /** Input bytes must come from a bounded, authenticated provider download by R2. */
    async save(actor:AudioActor,input:{kind:MediaKind;operationKey:string;mimeType:string;bytes:Uint8Array}):Promise<AudioReference> {
      await authorize(actor);
      z.string().trim().min(1).max(200).parse(input.operationKey);
      if(!input.bytes.byteLength) throw new AudioError('INVALID_AUDIO');
      if(input.bytes.byteLength>MAX_AUDIO_BYTES) throw new AudioError('AUDIO_TOO_LARGE');
      const mime=validateMediaContent(input.kind,input.mimeType,input.bytes);
      const hash=digest(input.bytes);
      const existing=async()=>{
        const {data,error}=await config.client.from('business_media').select('*').eq('business_id',actor.businessId)
          .eq('operation_key',input.operationKey).maybeSingle();
        if(error) throw new Error('MEDIA_METADATA_UNAVAILABLE');
        if(!data) return null;
        const row=recordSchema.parse(data);
        if(row.kind!==input.kind||row.mime_type!==mime||row.sha256!==hash||row.byte_size!==input.bytes.byteLength) throw new Error('MEDIA_IDEMPOTENCY_CONFLICT');
        return reference(row);
      };
      const bucket=buckets[input.kind];
      await privateBucket(bucket);
      const replay=await existing();
      if(replay) return replay;
      const key=`${actor.businessId}/${input.kind}/${randomUUID()}`;
      const uploaded=await config.client.storage.from(bucket).upload(key,input.bytes,{contentType:mime,upsert:false,cacheControl:'0'});
      if(uploaded.error) throw new Error('MEDIA_UPLOAD_UNAVAILABLE');
      const {error}=await config.client.from('business_media').insert({business_id:actor.businessId,operation_key:input.operationKey,
        kind:input.kind,bucket_id:bucket,storage_key:key,mime_type:mime,byte_size:input.bytes.byteLength,sha256:hash});
      if(error) {
        // A lost HTTP response can hide a committed INSERT: reconcile before deleting.
        let winner:AudioReference|null;
        try {winner=await existing();} catch {throw new Error('MEDIA_RECONCILIATION_REQUIRED');}
        if(winner?.storageKey===key) return winner;
        // Only remove this call's UUID object, never another request's winning object.
        const cleaned=await config.client.storage.from(bucket).remove([key]);
        if(cleaned.error) throw new Error('MEDIA_CLEANUP_REQUIRED');
        if(winner) return winner;
        throw new Error('MEDIA_METADATA_UNAVAILABLE');
      }
      return {storageKey:key,mimeType:mime};
    },
    async read(actor:AudioActor,ref:AudioReference,maxBytes:number) {
      await authorize(actor);
      if(!Number.isInteger(maxBytes)||maxBytes<1||maxBytes>MAX_AUDIO_BYTES) throw new AudioError('INVALID_AUDIO');
      if(!ref.storageKey.startsWith(`${actor.businessId}/`)||!/^[a-f0-9-]{36}\/(audio|image)\/[a-f0-9-]{36}$/.test(ref.storageKey)) throw new Error('MEDIA_ACCESS_DENIED');
      const {data,error}=await config.client.from('business_media').select('*').eq('business_id',actor.businessId)
        .eq('storage_key',ref.storageKey).maybeSingle();
      if(error) throw new Error('MEDIA_METADATA_UNAVAILABLE');
      if(!data) throw new Error('MEDIA_ACCESS_DENIED');
      const row=recordSchema.parse(data);
      if(row.bucket_id!==buckets[row.kind]||canonicalMime(ref.mimeType)!==row.mime_type) throw new AudioError('INVALID_AUDIO');
      if(row.byte_size>maxBytes) throw new AudioError('AUDIO_TOO_LARGE');
      await privateBucket(row.bucket_id);
      const path=row.storage_key.split('/').map(encodeURIComponent).join('/');
      let response:Response;
      try {
        response=await fetcher(`${base.origin}/storage/v1/object/authenticated/${row.bucket_id}/${path}`,{
          headers:{apikey:config.serviceKey,Authorization:`Bearer ${config.serviceKey}`},
          redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000),
        });
      } catch {throw new Error('MEDIA_DOWNLOAD_UNAVAILABLE');}
      if(!response.ok) {await response.body?.cancel();throw new Error('MEDIA_DOWNLOAD_UNAVAILABLE');}
      const reader=response.body?.getReader();
      if(!reader) throw new AudioError('INVALID_AUDIO');
      const chunks:Uint8Array[]=[];let length=0;
      try {
        const advertised=Number(response.headers.get('content-length'));
        if(advertised>maxBytes) throw new AudioError('AUDIO_TOO_LARGE');
        if(canonicalMime(response.headers.get('content-type')??'')!==row.mime_type) throw new AudioError('INVALID_AUDIO');
        while(true) {
          const part=await reader.read();if(part.done) break;
          length+=part.value.byteLength;
          if(length>maxBytes) throw new AudioError('AUDIO_TOO_LARGE');
          chunks.push(part.value);
        }
      } finally {await reader.cancel().catch(()=>{});reader.releaseLock();}
      const bytes=Buffer.concat(chunks);
      if(length!==row.byte_size||digest(bytes)!==row.sha256) throw new AudioError('INVALID_AUDIO');
      validateMediaContent(row.kind,row.mime_type,bytes);
      return {bytes,mimeType:row.mime_type};
    },
  };
}
export function createSupabaseAudioReader(store:ReturnType<typeof createSupabaseMediaStore>):TrustedAudioReader {
  return {read(actor,ref,maxBytes) {
    if(!ref.mimeType.toLowerCase().startsWith('audio/')) throw new AudioError('INVALID_AUDIO');
    return store.read(actor,ref,maxBytes);
  }};
}
