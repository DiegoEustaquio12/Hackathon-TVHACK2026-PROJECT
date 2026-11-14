import { randomUUID } from 'node:crypto';
import { expect,it,vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { completeBusinessOnboarding } from '../src/modules/data/businesses';
import { createStandardProduct,updateProductCommercials } from '../src/modules/data/products';
import { createRole2Service } from '../src/modules/orchestration/service';
import { createConversation } from '../src/modules/orchestration/conversation';
import { createConversationRepositories } from '../src/modules/orchestration/repositories';
import { createAudioPreparation } from '../src/modules/interpretation/audio';
import { createOpenAIAudioTranscriber } from '../src/modules/media/openai-transcriber';
import { createDurableProcessing } from '../src/modules/messaging/processing';
import { createSupabaseProcessingStore } from '../src/modules/messaging/supabase-processing';
import type { InboundMessage } from '../src/modules/messaging/contracts';

// Opt-in only. Uses real local PostgreSQL/PostgREST and mocks ONLY Infobip HTTP.
it.skipIf(process.env.RUN_LOCAL_SUPABASE_TESTS !== 'true')('persists the real webhook flow, replays, repricing and expense cancellation',async()=>{
  const url=process.env.ROLE2_LOCAL_URL!;
  if(!['localhost','127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Local database required');
  const client=createClient(url,process.env.ROLE2_LOCAL_SERVICE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
  const sender=`1999${Math.floor(Math.random()*9000000+1000000)}`;
  const recipient='19999999999'; const prefix=`local-${randomUUID()}`;
  let businessId:string|undefined;
  const replies:string[]=[]; const originalFetch=globalThis.fetch;
  vi.stubGlobal('fetch',async(input:string|URL|Request,init?:RequestInit)=>{
    const target=typeof input==='string'?input:input instanceof URL?input.href:input.url;
    if(target.startsWith('https://fixture.api.infobip.com/')) {
      replies.push(JSON.parse(String(init?.body)).content.text);
      return Response.json({messageId:'fake-provider-reply',status:{groupId:1,id:26}});
    }
    return originalFetch(input,init);
  });
  try {
    const business=await completeBusinessOnboarding(client,{verifiedSender:sender,name:'Integration fixture',businessType:'Abarrotes'});
    businessId=business.id;
    const product=await createStandardProduct(client,{verifiedSender:sender,operationKey:prefix,
      specification:{product_type:'Refresco',brand:'Coca-Cola',variant:'Original',presentation:'Botella PET',
        content_amount:600,content_unit:'ml',sale_unit:'piece',aliases:['coca']},priceCents:2000,stock:10});
    const claimArgs={p_key:`infobip:${prefix}-concurrent`,p_sender:sender,p_recipient:recipient,p_payload:{kind:'fixture'}};
    const claims=await Promise.all([client.rpc('r2_claim_event',claimArgs),client.rpc('r2_claim_event',claimArgs)]);
    expect(claims.every(result=>!result.error)).toBe(true);
    expect(claims.map(result=>result.data.state).sort()).toEqual(['busy','claimed']);
    const username='local-test';const password='p'.repeat(32);
    const handler=createRole2Service({client,baseUrl:'https://fixture.api.infobip.com',apiKey:'fixture',sender:recipient,
      webhookUsername:username,webhookPassword:password,onboardingSecret:'s'.repeat(32)});
    const timestamps=new Map<string,string>();
    const send=async(id:string,text:string)=>{
      if(!timestamps.has(id)) timestamps.set(id,new Date().toISOString());
      const response=await handler({rawBody:JSON.stringify({results:[{messageId:`${prefix}-${id}`,from:sender,to:recipient,
        receivedAt:timestamps.get(id),message:{type:'TEXT',text}}]}),headers:new Headers({
          'content-type':'application/json',authorization:`Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`})});
      expect(response.status).toBe(200);
      return replies.at(-1)!;
    };
    const command=(text:string)=>text.match(/CONFIRMAR [a-f0-9-]{36} \d+/)![0];
    const proposal=await send('sale','Vendí 3 cocas');
    const confirmation=command(proposal);
    await Promise.all([send('confirm',confirmation),send('concurrent-confirm',confirmation)]);
    await send('confirm',confirmation); // Same provider event must replay its durable response.
    // Different incoming messages approving the same draft still produce one sale.
    await send('confirm-again',confirmation);
    let sales=await client.from('sales').select('id,total_cents').eq('business_id',businessId);
    expect(sales.error).toBeNull();expect(sales.data).toHaveLength(1);expect(sales.data?.[0].total_cents).toBe(6000);
    const next=await send('price-sale','Vendí una coca');
    await updateProductCommercials(client,{verifiedSender:sender,productId:product.id,priceCents:2500,stock:7,
      expected:{priceCents:2000,stock:7,costCents:null}});
    const changed=await send('price-confirm',command(next));
    expect(changed).toContain('Total anterior');expect(changed).toContain('Nuevo total');
    await send('price-new-confirm',command(changed));
    sales=await client.from('sales').select('id,total_cents').eq('business_id',businessId);
    expect(sales.data).toHaveLength(2);
    const stock=await client.from('products').select('stock').eq('id',product.id).single();
    expect(Number(stock.data?.stock)).toBe(6);
    // Real DB and draft confirmation; OpenAI/storage are fixtures, not real audio accuracy tests.
    const transcribeHttp=vi.fn<typeof fetch>(async()=>Response.json({text:'Vendí una coca'}));
    const audioConversation=createConversation({...createConversationRepositories(client),
      prepareAudio:createAudioPreparation({reader:{read:async()=>({bytes:new Uint8Array([79,103,103,83]),mimeType:'audio/ogg'})},
        transcriber:createOpenAIAudioTranscriber({apiKey:'fixture'},transcribeHttp)})});
    const audioMessage:InboundMessage={provider:'infobip',providerMessageId:`${prefix}-audio`,from:sender,to:recipient,
      receivedAt:new Date().toISOString(),kind:'audio',audio:{storageKey:`${businessId}/fixture.ogg`,mimeType:'audio/ogg'}};
    const durable=createDurableProcessing(createSupabaseProcessingStore(client));
    const audioSummary=await durable.run(audioMessage,()=>audioConversation(audioMessage));
    expect(audioSummary).toContain('Transcripción: «Vendí una coca»');
    expect(audioSummary).toContain('No se ha registrado la venta');
    expect(await durable.run(audioMessage,()=>audioConversation(audioMessage))).toBe(audioSummary);
    expect(transcribeHttp).toHaveBeenCalledTimes(1);
    expect((await client.from('sales').select('id').eq('business_id',businessId)).data).toHaveLength(2);
    expect(Number((await client.from('products').select('stock').eq('id',product.id).single()).data?.stock)).toBe(6);
    await send('audio-confirm',command(audioSummary));
    await send('audio-confirm-repeat',command(audioSummary));
    expect((await client.from('sales').select('id').eq('business_id',businessId)).data).toHaveLength(3);
    expect(Number((await client.from('products').select('stock').eq('id',product.id).single()).data?.stock)).toBe(5);
    const expense=await send('expense','Gasté 50 en luz');
    const expenseCommand=expense.split('\n')[1].replace('Responde ','');
    await send('cancel-expense','CANCELAR GASTO');
    expect(await send('confirm-cancelled-expense',expenseCommand)).toContain('cancelada');
    const expenses=await client.from('expenses').select('id').eq('business_id',businessId);
    expect(expenses.data).toHaveLength(0);
  } finally {
    vi.unstubAllGlobals();
    // Explicit order respects the private draft foreign keys. No real user data.
    await client.from('r2_events').delete().like('event_key',`infobip:${prefix}%`);
    if(businessId) {
      for(const table of ['r2_expense_drafts','whatsapp_sale_drafts','sale_items','sales','products','expenses']) {
        const result=await client.from(table).delete().eq('business_id',businessId);
        if(result.error) throw result.error;
      }
      const result=await client.from('businesses').delete().eq('id',businessId);
      if(result.error) throw result.error;
    }
  }
},30000);
