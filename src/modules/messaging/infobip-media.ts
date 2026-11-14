import { MAX_AUDIO_BYTES, AudioError } from '../media/audio';
import { canonicalMime, validateMediaContent } from '../media/formats';
import { MessagingError, type InboundMessage, type WhatsAppActor } from './contracts';
import type { createSupabaseMediaStore } from '../media/supabase-storage';

/** Download URLs are constrained to the account endpoint; redirect origins require explicit server configuration. */
export function createInfobipMediaIngestor(config:{baseUrl:string;apiKey:string;sender:string;redirectOrigins?:string[]},
  store:Pick<ReturnType<typeof createSupabaseMediaStore>,'save'> & Partial<Pick<ReturnType<typeof createSupabaseMediaStore>,'find'>>,fetcher:typeof fetch=fetch) {
  const base=new URL(config.baseUrl);
  if(base.protocol!=='https:'||!base.hostname.endsWith('.api.infobip.com')||base.username||base.password||base.port
    ||base.pathname!=='/'||base.search||base.hash||!config.apiKey||!/^[1-9][0-9]{7,14}$/.test(config.sender)) throw new Error('Invalid media configuration');
  const redirectOrigins=new Set((config.redirectOrigins??[]).map(value=>{
    const url=new URL(value);
    if(url.protocol!=='https:'||url.username||url.password||url.port||url.pathname!=='/'||url.search||url.hash) throw new Error('Invalid media redirect origin');
    return url.origin;
  }));
  return async(actor:WhatsAppActor,message:InboundMessage):Promise<InboundMessage>=>{
    const media=message.providerMedia;
    if(!media||message.from!==actor.verifiedSender||message.to!==config.sender||message.kind!==media.kind) throw new MessagingError('INVALID_MEDIA',false);
    let url=new URL(media.url);
    const prefix=`/whatsapp/1/senders/${config.sender}/media/`;
    if(url.origin!==base.origin||url.username||url.password||url.search||url.hash||!url.pathname.startsWith(prefix)
      ||! /^[A-Za-z0-9_-]{1,256}$/.test(url.pathname.slice(prefix.length))) throw new MessagingError('INVALID_MEDIA_URL',false);
    const operationKey=`infobip:${message.providerMessageId}`;
    const existing=await store.find?.(actor,operationKey,media.kind);
    if(existing) return {...message,providerMedia:undefined,...(media.kind==='audio'?{audio:existing}:{image:existing})};
    const signal=AbortSignal.timeout(10000);
    let response:Response|undefined;
    try {
      for(let hop=0;hop<3;hop++) {
        const headers:Record<string,string>=url.origin===base.origin?{Authorization:`App ${config.apiKey}`} : {};
        response=await fetcher(url.href,{headers,redirect:'manual',signal,cache:'no-store'});
        if(![301,302,303,307,308].includes(response.status)) break;
        const location=response.headers.get('location');await response.body?.cancel();response=undefined;
        if(!location) throw new MessagingError('INVALID_MEDIA_REDIRECT',false);
        const target=new URL(location,url);
        // Never send the API credential to CDN URLs; no redirects back from a CDN to the API.
        if(target.protocol!=='https:'||target.username||target.password||target.port||target.hash
          ||!redirectOrigins.has(target.origin)||target.origin===base.origin) throw new MessagingError('INVALID_MEDIA_REDIRECT',false);
        url=target;
      }
      if(!response||!response.ok) {
        const status=response?.status;
        await response?.body?.cancel();
        throw new MessagingError('MEDIA_DOWNLOAD_FAILED',!status||status===429||status>=500);
      }
      const mime=canonicalMime(response.headers.get('content-type')??'');
      const reader=response.body?.getReader();if(!reader) throw new AudioError('INVALID_AUDIO');
      const chunks:Uint8Array[]=[];let size=0;
      try {
        if(Number(response.headers.get('content-length'))>MAX_AUDIO_BYTES) throw new AudioError('AUDIO_TOO_LARGE');
        while(true) {
          const part=await reader.read();if(part.done) break;
          size+=part.value.byteLength;if(size>MAX_AUDIO_BYTES) throw new AudioError('AUDIO_TOO_LARGE');
          chunks.push(part.value);
        }
      } finally {await reader.cancel().catch(()=>{});reader.releaseLock();}
      const bytes=Buffer.concat(chunks);
      validateMediaContent(media.kind,mime,bytes);
      const reference=await store.save(actor,{kind:media.kind,operationKey,mimeType:mime,bytes});
      return {...message,providerMedia:undefined,...(media.kind==='audio'?{audio:reference}:{image:reference})};
    } catch(error) {
      if(error instanceof AudioError||error instanceof MessagingError) throw error;
      throw new MessagingError('MEDIA_PROCESSING_UNAVAILABLE',true);
    }
  };
}
