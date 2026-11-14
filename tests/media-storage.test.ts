import { createHash } from 'node:crypto';
import { expect,it,vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseMediaStore,createSupabaseAudioReader } from '../src/modules/media/supabase-storage';
import { validateMediaContent } from '../src/modules/media/formats';

const business='11111111-1111-4111-8111-111111111111';
const actor={businessId:business,verifiedSender:'19999999999'};
const key=`${business}/audio/22222222-2222-4222-8222-222222222222`;
const bytes=new Uint8Array([79,103,103,83,1,2]);
const ref={storageKey:key,mimeType:'audio/ogg'};
const row={business_id:business,storage_key:key,bucket_id:'business-audio',kind:'audio',mime_type:'audio/ogg',
  byte_size:bytes.byteLength,sha256:createHash('sha256').update(bytes).digest('hex')};
function fixture(options:{public?:boolean;row?:object|null;business?:string|null}={}) {
  const client={from:(table:string)=>{
    const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({error:null,data:table==='businesses'
      ? options.business===null ? null : {id:options.business??business,name:'Fixture',whatsapp_id:actor.verifiedSender,
        business_type:'Abarrotes',onboarding_completed_at:new Date().toISOString()}
      : options.row===null ? null : options.row??row})};return q;
  },storage:{getBucket:async()=>({error:null,data:{public:options.public??false}})}} as unknown as SupabaseClient;
  return client;
}
const response=(data:Uint8Array=bytes,headers:Record<string,string>={})=>new Response(new Uint8Array(data),{headers:{'content-type':'audio/ogg',...headers}});
it('reads only a registered object after actor authorization and validates bytes/hash',async()=>{
  const fetcher=vi.fn<typeof fetch>(async()=>response());
  const store=createSupabaseMediaStore({client:fixture(),url:'https://fixture.supabase.co',serviceKey:'fixture-key'},fetcher);
  expect((await store.read(actor,ref,10)).bytes).toEqual(Buffer.from(bytes));
  expect(fetcher.mock.calls[0][0]).toBe(`https://fixture.supabase.co/storage/v1/object/authenticated/business-audio/${key}`);
  expect(fetcher.mock.calls[0][1]).toMatchObject({redirect:'error',cache:'no-store'});
});
it.each(['../other','https://attacker.test/audio',key.replace(business,'33333333-3333-4333-8333-333333333333')])
('rejects untrusted paths before downloading: %s',async storageKey=>{
  const fetcher=vi.fn<typeof fetch>();
  const store=createSupabaseMediaStore({client:fixture(),url:'https://fixture.supabase.co',serviceKey:'fixture'},fetcher);
  await expect(store.read(actor,{...ref,storageKey},10)).rejects.toThrow('MEDIA_ACCESS_DENIED');
  expect(fetcher).not.toHaveBeenCalled();
});
it('denies mismatched actor, missing registration and accidentally public buckets',async()=>{
  for(const client of [fixture({business:null}),fixture({row:null}),fixture({public:true}),fixture({business:'33333333-3333-4333-8333-333333333333'})]) {
    const fetcher=vi.fn<typeof fetch>();
    const store=createSupabaseMediaStore({client,url:'https://fixture.supabase.co',serviceKey:'fixture'},fetcher);
    await expect(store.read(actor,ref,10)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  }
});
it('rejects advertised and streamed overflow, even without content-length',async()=>{
  for(const result of [response(bytes,{'content-length':'100'}),response(new Uint8Array(11))]) {
    const store=createSupabaseMediaStore({client:fixture(),url:'https://fixture.supabase.co',serviceKey:'fixture'},async()=>result);
    await expect(store.read(actor,ref,10)).rejects.toMatchObject({code:'AUDIO_TOO_LARGE'});
  }
});
it('rejects different content, MIME or size instead of transcribing it',async()=>{
  for(const result of [response(new Uint8Array([79,103,103,83,9,9])),response(bytes,{'content-type':'image/png'}),response(bytes.subarray(0,5))]) {
    const store=createSupabaseMediaStore({client:fixture(),url:'https://fixture.supabase.co',serviceKey:'fixture'},async()=>result);
    await expect(store.read(actor,ref,10)).rejects.toMatchObject({code:'INVALID_AUDIO'});
  }
});
it('sanitizes failed storage requests and refuses insecure remote endpoints',async()=>{
  const config={client:fixture(),url:'https://fixture.supabase.co',serviceKey:'secret-fixture'};
  await expect(createSupabaseMediaStore(config,async()=>{throw new Error('secret provider body');}).read(actor,ref,10))
    .rejects.toThrow('MEDIA_DOWNLOAD_UNAVAILABLE');
  for(const url of ['http://remote.test','https://user:pass@remote.test','https://remote.test/path'])
    expect(()=>createSupabaseMediaStore({...config,url})).toThrow('Invalid storage configuration');
});
it('checks supported media signatures and the audio reader never accepts images',async()=>{
  expect(validateMediaContent('audio','audio/ogg; codecs=opus',bytes)).toBe('audio/ogg');
  expect(validateMediaContent('image','image/png',Buffer.from('89504e470d0a1a0a','hex'))).toBe('image/png');
  expect(()=>validateMediaContent('image','image/png',bytes)).toThrow();
  expect(()=>validateMediaContent('audio','audio/ogg',new Uint8Array([1,2,3]))).toThrow();
  const read=vi.fn();
  expect(()=>createSupabaseAudioReader({read} as unknown as ReturnType<typeof createSupabaseMediaStore>).read(actor,
    {...ref,mimeType:'image/png'},10)).toThrow();
  expect(read).not.toHaveBeenCalled();
});
