import { expect,it,vi } from 'vitest';
import { parseInfobipInbound } from '../src/modules/messaging/infobip';
import { createInfobipMediaIngestor } from '../src/modules/messaging/infobip-media';
import type { InboundMessage, WhatsAppActor } from '../src/modules/messaging/contracts';
import { MAX_AUDIO_BYTES } from '../src/modules/media/audio';
const baseUrl='https://fixture.api.infobip.com';const sender='19999999999';
const actor:WhatsAppActor={businessId:'11111111-1111-4111-8111-111111111111',verifiedSender:'525555555555',channel:'whatsapp'};
const url=`${baseUrl}/whatsapp/1/senders/${sender}/media/id-1`;
const config={baseUrl,apiKey:'fixture-secret',sender};
const bytes=new Uint8Array([79,103,103,83,1,2,3]);
const message:InboundMessage={provider:'infobip',providerMessageId:'audio-1',from:actor.verifiedSender,to:sender,
  receivedAt:new Date().toISOString(),kind:'audio',providerMedia:{url,kind:'audio'}};
const reference={storageKey:`${actor.businessId}/audio/22222222-2222-4222-8222-222222222222`,mimeType:'audio/ogg'};
it.each(['AUDIO','IMAGE'])('normalizes official legacy %s URL but ignores external storage/identity fields',type=>{
  const [result]=parseInfobipInbound({results:[{from:actor.verifiedSender,to:sender,messageId:'id',receivedAt:message.receivedAt,
    message:{type,url,storageKey:'forged'},businessId:'forged'}]},sender);
  expect(result.kind).toBe(type.toLowerCase());
  expect(result.providerMedia).toEqual({url,kind:type.toLowerCase()});
  expect(result.audio).toBeUndefined();expect(result.image).toBeUndefined();
});
it('downloads bounded provider media with account authentication and saves by verified actor',async()=>{
  const save=vi.fn(async()=>reference);
  const fetcher=vi.fn<typeof fetch>(async()=>new Response(bytes,{headers:{'content-type':'audio/ogg; codecs=opus'}}));
  const result=await createInfobipMediaIngestor(config,{save},fetcher)(actor,message);
  expect(fetcher.mock.calls[0]).toMatchObject([url,{headers:{Authorization:'App fixture-secret'},redirect:'manual'}]);
  expect(save).toHaveBeenCalledWith(actor,{kind:'audio',operationKey:'infobip:audio-1',mimeType:'audio/ogg',bytes:Buffer.from(bytes)});
  expect(result.audio).toEqual(reference);expect(result.providerMedia).toBeUndefined();
});
it.each(['https://evil.test/file','http://127.0.0.1/file',`${baseUrl}/other`,`${url}?query=secret`,`${baseUrl}/whatsapp/1/senders/123/media/id`])
('rejects untrusted media URLs without requesting them: %s',async invalid=>{
  const save=vi.fn();const fetcher=vi.fn<typeof fetch>();
  await expect(createInfobipMediaIngestor(config,{save},fetcher)(actor,{...message,providerMedia:{url:invalid,kind:'audio'}})).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();expect(save).not.toHaveBeenCalled();
});
it('follows only configured CDN origins and strips authorization from redirects',async()=>{
  const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(null,{status:302,headers:{location:'https://cdn.example.test/file?signed=value'}}))
    .mockResolvedValueOnce(new Response(bytes,{headers:{'content-type':'audio/ogg'}}));
  await createInfobipMediaIngestor({...config,redirectOrigins:['https://cdn.example.test']},{save:async()=>reference},fetcher)(actor,message);
  expect(fetcher.mock.calls[1][1]?.headers).toEqual({});
  const denied=vi.fn<typeof fetch>(async()=>new Response(null,{status:302,headers:{location:'https://evil.test/file'}}));
  await expect(createInfobipMediaIngestor(config,{save:vi.fn()},denied)(actor,message)).rejects.toThrow('INVALID_MEDIA_REDIRECT');
  expect(denied).toHaveBeenCalledTimes(1);
});
it('rejects oversized streams without content-length and mismatched MIME/signatures',async()=>{
  for(const response of [new Response(new Uint8Array(MAX_AUDIO_BYTES+1),{headers:{'content-type':'audio/ogg'}}),
    new Response(bytes,{headers:{'content-type':'image/png'}})]) {
    const save=vi.fn();
    await expect(createInfobipMediaIngestor(config,{save},async()=>response)(actor,message)).rejects.toThrow();
    expect(save).not.toHaveBeenCalled();
  }
});
it('reuses stored media after a processing failure without downloading from expired provider storage',async()=>{
  const fetcher=vi.fn<typeof fetch>();const save=vi.fn();
  expect((await createInfobipMediaIngestor(config,{save,find:async()=>reference},fetcher)(actor,message)).audio).toEqual(reference);
  expect(fetcher).not.toHaveBeenCalled();expect(save).not.toHaveBeenCalled();
});
it('keeps network failures retryable and never sends credentials to an unapproved origin',async()=>{
  await expect(createInfobipMediaIngestor(config,{save:vi.fn()},async()=>{throw new Error('private details');})(actor,message))
    .rejects.toMatchObject({message:'MEDIA_PROCESSING_UNAVAILABLE',retryable:true});
});
