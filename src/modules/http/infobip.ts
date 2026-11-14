import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { createRole2Service } from '../orchestration/service';
import { createSupabaseMediaStore, createSupabaseAudioReader } from '../media/supabase-storage';
import { createInfobipMediaIngestor } from '../messaging/infobip-media';
import { createOpenAIReceiptExtractor } from '../media/openai-receipts';
import { createOpenAIAudioTranscriber } from '../media/openai-transcriber';

type WebhookHandler = ReturnType<typeof createRole2Service>;
let handler: WebhookHandler | undefined;
/** Lazy server composition. Never falls back to demo services or a public key. */
export function getInfobipHandler(): WebhookHandler {
  if (process.env.INFOBIP_WEBHOOK_ENABLED !== 'true') throw new Error('Webhook disabled');
  if (handler) return handler;
  const config = z.object({
    url:z.url(), serviceKey:z.string().min(20),baseUrl:z.url(),apiKey:z.string().min(1),
    sender:z.string().regex(/^[1-9][0-9]{7,14}$/),webhookUsername:z.string().min(1),
    webhookPassword:z.string().min(24),onboardingSecret:z.string().min(32),
  }).parse({url:process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL,
    serviceKey:process.env.SUPABASE_SERVICE_ROLE_KEY,baseUrl:process.env.INFOBIP_BASE_URL,
    apiKey:process.env.INFOBIP_API_KEY,sender:process.env.INFOBIP_WHATSAPP_SENDER,
    webhookUsername:process.env.INFOBIP_WEBHOOK_USERNAME,webhookPassword:process.env.INFOBIP_WEBHOOK_PASSWORD,
    onboardingSecret:process.env.INFOBIP_ONBOARDING_SECRET});
  const client=createClient(config.url,config.serviceKey,
    {auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const store=createSupabaseMediaStore({client,url:config.url,serviceKey:config.serviceKey});
  const audio=process.env.WHATSAPP_AUDIO_ENABLED==='true' ? {
    reader:createSupabaseAudioReader(store),
    transcriber:createOpenAIAudioTranscriber({apiKey:process.env.OPENAI_API_KEY??''}),
  } : undefined;
  const receipts=process.env.WHATSAPP_RECEIPTS_ENABLED==='true'?{
    reader:store,extractor:createOpenAIReceiptExtractor({apiKey:process.env.OPENAI_API_KEY??'',model:process.env.OPENAI_RECEIPT_MODEL}),
  }:undefined;
  const ingestMedia=audio||receipts?createInfobipMediaIngestor({...config,
    redirectOrigins:(process.env.INFOBIP_MEDIA_REDIRECT_ORIGINS??'').split(',').map(v=>v.trim()).filter(Boolean)},store):undefined;
  handler = createRole2Service({ ...config,client,audio,receipts,ingestMedia });
  return handler;
}

/** Accepts external provider traffic; it intentionally does not require web cookies. */
export function createInfobipRoute(factory: () => WebhookHandler = getInfobipHandler) {
  return async (request: Request): Promise<Response> => {
    const json = (body: object,status:number) => Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
    try {
      const limit = 256*1024;
      const size = request.headers.get('content-length');
      if (size && Number(size)>limit) return json({code:'PAYLOAD_TOO_LARGE'},413);
      const run = factory();
      const reader = request.body?.getReader();
      if (!reader) return json({code:'INVALID_PAYLOAD'},400);
      const chunks:Uint8Array[]=[]; let total=0;
      while (true) {
        const {done,value}=await reader.read();
        if (done) break;
        total+=value.byteLength;
        if (total>limit) { await reader.cancel(); return json({code:'PAYLOAD_TOO_LARGE'},413); }
        chunks.push(value);
      }
      const result=await run({rawBody:Buffer.concat(chunks).toString('utf8'),headers:request.headers});
      return json(result.body,result.status);
    } catch { return json({code:'WEBHOOK_UNAVAILABLE'},503); }
  };
}
