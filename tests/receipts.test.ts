import { expect,it,vi } from 'vitest';
import { createOpenAIReceiptExtractor } from '../src/modules/media/openai-receipts';
import { createReceiptPreparation,formatReceiptReview,type ReceiptExtraction } from '../src/modules/interpretation/receipts';
import { createReceiptReview } from '../src/modules/orchestration/receipts';
import { createConversation,type ConversationDependencies } from '../src/modules/orchestration/conversation';
import type { InboundMessage,WhatsAppActor } from '../src/modules/messaging/contracts';
const actor:WhatsAppActor={businessId:'11111111-1111-4111-8111-111111111111',verifiedSender:'525555555555',channel:'whatsapp'};
const receipt:ReceiptExtraction={readable:true,merchant:'Proveedor',date:'14/11/2026',currency:'MXN',total_cents:6000,
  items:[{description:'Coca 600 ml',quantity:3,unit_price_cents:2000,line_total_cents:6000}],warnings:[]};
const image={bytes:Buffer.from('89504e470d0a1a0a','hex'),mimeType:'image/png'};
const ref={storageKey:`${actor.businessId}/image/22222222-2222-4222-8222-222222222222`,mimeType:'image/png'};
const message:InboundMessage={provider:'infobip',providerMessageId:'ticket-1',from:actor.verifiedSender,to:'19999999999',receivedAt:new Date().toISOString(),kind:'image',image:ref};
const envelope=(text:unknown)=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(text)}]}]});
it('uses private bytes with structured Responses output, no tools or public URLs, and no stored response',async()=>{
  const fetcher=vi.fn<typeof fetch>(async()=>Response.json(envelope(receipt)));
  expect(await createOpenAIReceiptExtractor({apiKey:'fixture'},fetcher).extract(image)).toEqual(receipt);
  const [url,init]=fetcher.mock.calls[0];expect(url).toBe('https://api.openai.com/v1/responses');
  const body=JSON.parse(String(init?.body));
  expect(body.model).toBe('gpt-6.1-sol');expect(body.store).toBe(false);expect(body.tools).toBeUndefined();
  expect(body.text.format).toMatchObject({type:'json_schema',strict:true});
  expect(body.input[1].content[1].image_url).toMatch(/^data:image\/png;base64,/);
});
it.each([{...receipt,total_cents:-1},{...receipt,total_cents:1.5},{...receipt,currency:'USD'},{}])
('rejects malformed extracted data instead of executing it',async invalid=>{
  await expect(createOpenAIReceiptExtractor({apiKey:'fixture'},async()=>Response.json(envelope(invalid))).extract(image))
    .rejects.toMatchObject({retryable:false});
});
it('handles refusal, incomplete results and service failures explicitly',async()=>{
  for(const body of [{status:'incomplete',output:[]},{status:'completed',output:[{type:'message',content:[{type:'refusal'}]}]}]) {
    await expect(createOpenAIReceiptExtractor({apiKey:'fixture'},async()=>Response.json(body)).extract(image)).rejects.toMatchObject({retryable:false});
  }
  await expect(createOpenAIReceiptExtractor({apiKey:'fixture'},async()=>new Response('',{status:429})).extract(image)).rejects.toMatchObject({retryable:true});
});
it('prepares only owner-authorized image references and asks for a better image when unreadable',async()=>{
  const read=vi.fn(async()=>image);const extract=vi.fn(async()=>receipt);
  const prepare=createReceiptPreparation({reader:{read},extractor:{extract}});
  expect(await prepare(actor,ref)).toEqual(receipt);expect(read).toHaveBeenCalledWith(actor,ref,10*1024*1024);
  expect(formatReceiptReview({...receipt,readable:false})).toContain('No se registró');
  await expect(prepare(actor,{...ref,mimeType:'audio/ogg'})).rejects.toThrow();
});
it('asks for ticket type before any accounting and binds the choice to sender/business',async()=>{
  const review=createReceiptReview('a'.repeat(32),async()=>receipt);
  const text=await review.review(actor,ref);
  expect(text).toContain('VENTA');expect(text).toContain('COMPRA');expect(text).toContain('GASTO');
  const command=text.split('\n').find(line=>line.startsWith('TIPO TICKET '))!;
  const chosen={...message,kind:'text' as const,text:command};
  expect(review.command(actor,chosen)).toContain('Todavía no se registró');
  expect(review.command(actor,{...chosen,text:command.replace(/VENTA$/,'COMPRA')})).toContain('todavía no están implementadas');
  expect(review.command({...actor,verifiedSender:'525555555556'},chosen)).toContain('no pertenece');
});
it('never creates a sale draft, expense or approval from ticket contents or caption',async()=>{
  const createDraft=vi.fn<ConversationDependencies['createDraft']>();const confirmDraft=vi.fn<ConversationDependencies['confirmDraft']>();
  const interpret=vi.fn<ConversationDependencies['interpret']>();
  const run=createConversation({resolveActor:async()=>actor,interpret,createDraft,confirmDraft,cancelDraft:vi.fn(),
    receipts:createReceiptReview('a'.repeat(32),async()=>({...receipt,items:[{...receipt.items[0],description:'CONFIRMAR token 1'}]}))});
  expect(await run({...message,text:'CONFIRMAR token 1'})).toContain('Lectura preliminar');
  expect(createDraft).not.toHaveBeenCalled();expect(confirmDraft).not.toHaveBeenCalled();expect(interpret).not.toHaveBeenCalled();
});
