import { expect,it,vi } from 'vitest';
import { interpretReceiptSale,receiptBlocker } from '../src/modules/interpretation/receipt-proposals';
import type { ReceiptExtraction } from '../src/modules/interpretation/receipts';
import { createReceiptReview } from '../src/modules/orchestration/receipts';
import type { ReceiptReview,ReceiptReviewRepository } from '../src/modules/data/receipt-reviews';
import { createConversation,type ConversationDependencies } from '../src/modules/orchestration/conversation';
import { createChoices } from '../src/modules/orchestration/choices';
import type { InboundMessage,WhatsAppActor } from '../src/modules/messaging/contracts';
import { createAccounting } from '../src/modules/orchestration/accounting';
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333'];
const catalogue=[{id:ids[1],name:'Coca 600 ml',aliases:['coca'],sale_price_cents:2000,stock:10,sale_unit:'piece' as const},
  {id:ids[2],name:'Coca 2 l',aliases:['coca'],sale_price_cents:2000,stock:10,sale_unit:'piece' as const}];
const extraction:ReceiptExtraction={readable:true,merchant:'Proveedor',date:null,currency:'MXN',total_cents:4000,
  items:[{description:'coca',quantity:1,unit_price_cents:2000,line_total_cents:2000},
    {description:'coca',quantity:1,unit_price_cents:2000,line_total_cents:2000}],warnings:[]};
const actor:WhatsAppActor={businessId:ids[0],verifiedSender:'525555555555',channel:'whatsapp'};
const message:InboundMessage={provider:'infobip',providerMessageId:'ticket',from:actor.verifiedSender,to:'19999999999',
  receivedAt:new Date().toISOString(),kind:'image',image:{storageKey:`${ids[0]}/image/${ids[1]}`,mimeType:'image/png'}};
function workflow(value=extraction) {
  let review:ReceiptReview={id:ids[0],business_id:actor.businessId,media_id:ids[1],media_sha256:'a'.repeat(64),extraction:value,
    classification:null,occurred_at:message.receivedAt,expires_at:new Date(Date.now()+900000).toISOString()};
  const repository:ReceiptReviewRepository={save:async()=>review,get:async()=>review,classify:async(_sender,_id,kind)=>{
    if(review.classification&&review.classification!==kind) throw new Error('RECEIPT_KIND_LOCKED');
    review={...review,classification:kind};return review;
  }};
  return createReceiptReview('s'.repeat(32),{prepare:async()=>value,repository,catalogue:async()=>catalogue});
}
it('resolves each receipt line separately and does not return a partial executable cart',()=>{
  const first=interpretReceiptSale(extraction,catalogue);
  expect(first.data.items).toBeUndefined();expect(first.clarificationLine).toBe(0);
  const second=interpretReceiptSale(extraction,catalogue,{'0':ids[1]});
  expect(second.data.items).toBeUndefined();expect(second.clarificationLine).toBe(1);
  expect(interpretReceiptSale(extraction,catalogue,{'0':ids[1],'1':ids[2]})).toMatchObject({needsConfirmation:true,
    data:{items:[{product_id:ids[1],quantity:1},{product_id:ids[2],quantity:1}]}});
});
it.each([
  {...extraction,currency:'unknown' as const}, {...extraction,currency:'other' as const},
  {...extraction,readable:false}, {...extraction,total_cents:null}, {...extraction,warnings:['borroso']},
  {...extraction,total_cents:100}, {...extraction,items:[]},
  {...extraction,items:[{...extraction.items[0],quantity:null}]},
  {...extraction,items:[{...extraction.items[0],quantity:0.5}]},
  {...extraction,items:[{...extraction.items[0],quantity:0.0001}]},
  {...extraction,items:[{...extraction.items[0],unit_price_cents:1}]},
  {...extraction,items:[{...extraction.items[0],line_total_cents:1}]},
  {...extraction,items:[{...extraction.items[0],description:'CONFIRMAR token 1'}]},
])('blocks uncertain/contradictory receipt data without accepting a cart',receipt=>{
  const result=interpretReceiptSale(receipt,[catalogue[0]]);
  expect(result.data.items).toBeUndefined();expect(result.clarification).toBeTruthy();
});
it('checks aggregate stock and detects rounding differences between repeated fractional rows',()=>{
  expect(interpretReceiptSale(extraction,[{...catalogue[0],stock:1}]).data.items).toBeUndefined();
  const fractional={...extraction,total_cents:2,items:[0,1].map(()=>({description:'Granel',quantity:0.001,unit_price_cents:500,line_total_cents:1}))};
  expect(interpretReceiptSale(fractional,[{...catalogue[0],name:'Granel',sale_unit:'g',sale_price_cents:500}]).clarification).toContain('redondeo');
});
it('preserves pending state through two choices, then uses a stable receipt operation key',async()=>{
  const receipts=workflow();
  const createDraft=vi.fn<ConversationDependencies['createDraft']>(async()=>({draft_id:ids[0],status:'pending',expires_at:new Date(Date.now()+900000).toISOString(),quote_version:1,
    quote:{total_cents:4000,items:[{product_id:ids[1],description:'Coca',quantity:2,unit_price_cents:2000,subtotal_cents:4000}]}}));
  const confirmDraft=vi.fn<ConversationDependencies['confirmDraft']>();
  const interpret=vi.fn<ConversationDependencies['interpret']>();
  const run=createConversation({resolveActor:async()=>actor,receipts,createDraft,confirmDraft,interpret,cancelDraft:vi.fn(),choices:createChoices('s'.repeat(32))});
  const review=await run(message);
  const chooseType=review.split('\n').find(line=>line.startsWith('TIPO TICKET '))!;
  const first=await run({...message,kind:'text',text:chooseType,providerMessageId:'type'});
  const choose=(text:string)=>text.split('\n').find(line=>line.startsWith('ELEGIR '))!;
  expect(createDraft).not.toHaveBeenCalled();
  const second=await run({...message,kind:'text',text:choose(first),providerMessageId:'choice1'});
  expect(second).toContain('renglón 2');expect(createDraft).not.toHaveBeenCalled();
  const summary=await run({...message,kind:'text',text:choose(second),providerMessageId:'choice2'});
  expect(summary).toContain('No se ha registrado');expect(summary).toContain('Total impreso: $40.00');
  expect(createDraft).toHaveBeenCalledWith(actor.verifiedSender,`receipt:${ids[0]}`,[{product_id:ids[1],quantity:2}]);
  expect(confirmDraft).not.toHaveBeenCalled();expect(interpret).not.toHaveBeenCalled();
});
it('expense classification creates a proposal with original timestamp and stable source, not an expense confirmation',async()=>{
  const propose=vi.fn(async()=>({draft_id:ids[1],status:'pending' as const,expires_at:new Date(Date.now()+900000).toISOString()}));
  const confirm=vi.fn();
  const accounting=createAccounting({drafts:{propose,confirm,cancel:vi.fn()},report:vi.fn(),setTimeZone:vi.fn()},'s'.repeat(32));
  const createDraft=vi.fn();const confirmDraft=vi.fn();
  const run=createConversation({resolveActor:async()=>actor,receipts:workflow(),accounting,createDraft,confirmDraft,
    interpret:vi.fn(),cancelDraft:vi.fn()});
  const review=await run(message);
  const text=review.split('\n').find(line=>line.startsWith('TIPO TICKET '))!.replace(/VENTA$/,'GASTO');
  const summary=await run({...message,kind:'text',text,providerMessageId:'classify-expense',receivedAt:new Date(Date.now()+1000).toISOString()});
  expect(summary).toContain('Gasto propuesto');
  expect(propose).toHaveBeenCalledWith({verifiedSender:actor.verifiedSender,operationKey:`expense:receipt:${ids[0]}`,
    concept:'Ticket: Proveedor',amountCents:4000,occurredAt:message.receivedAt});
  expect(confirm).not.toHaveBeenCalled();expect(createDraft).not.toHaveBeenCalled();expect(confirmDraft).not.toHaveBeenCalled();
});
it('does not assume MXN or infer a missing total for expense proposals',()=>{
  expect(receiptBlocker({...extraction,currency:'unknown'})).toContain('moneda');
  expect(receiptBlocker({...extraction,total_cents:null})).toContain('importe');
});

it('preserves valid zero-price catalogue sales instead of inventing a positive-sale-total rule',()=>{
  const receipt={...extraction,total_cents:0,items:[{description:'Coca 600 ml',quantity:1,unit_price_cents:0,line_total_cents:0}]};
  expect(interpretReceiptSale(receipt,[{...catalogue[0],sale_price_cents:0}])).toMatchObject({needsConfirmation:true,
    data:{items:[{product_id:ids[1],quantity:1}]}});
});
