import { expect,it,vi } from 'vitest';
import { createConversation } from '../src/modules/orchestration/conversation';
import { createChoices } from '../src/modules/orchestration/choices';
import { interpretSaleMessage } from '../src/modules/interpretation/parser';
import { createInfobipWebhook,splitWhatsAppText } from '../src/modules/messaging/webhook';
import { createInfobipRoute } from '../src/modules/http/infobip';

const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444'];
const catalogue=['Coca 600 ml','Coca 2 l','Pan dulce','Pan blanco'].map((name,i)=>({id:ids[i],name,stock:10,sale_price_cents:1000}));
const message={provider:'infobip' as const,providerMessageId:'original',from:'525555555555',to:'447860088970',
  receivedAt:'2026-11-14T12:00:00Z',kind:'text' as const,text:'Vendí una coca y un pan'};
const command=(reply:string)=>reply.split('\n').find(line=>line.startsWith('ELEGIR '))!;
it('splits long summaries into bounded messages without breaking a confirmation command',()=>{
  const commandLine=`CONFIRMAR ${ids[0]} 2`;
  const parts=splitWhatsAppText(('Producto 🍎: $20.00\n').repeat(500)+commandLine);
  expect(parts.every(part=>part.length<=4096)).toBe(true);
  expect(parts.at(-1)).toContain(commandLine);
  expect(parts.join('\n')).not.toContain('\uFFFD');
});

it('retains all line selections and the original operation over multiple clarifications',async()=>{
  const createDraft=vi.fn(async()=>({draft_id:ids[0],status:'pending' as const,expires_at:'2026-11-14T12:15:00Z',quote_version:1,
    quote:{items:[],total_cents:2000}}));
  const conversation=createConversation({
    resolveActor:async()=>({businessId:ids[0],verifiedSender:message.from,channel:'whatsapp'}),
    interpret:async(_actor,request)=>interpretSaleMessage(request,catalogue),
    interpretSelection:async(_actor,text,selections)=>interpretSaleMessage({text},catalogue,selections),
    choices:createChoices('a'.repeat(32)),createDraft,confirmDraft:vi.fn(),cancelDraft:vi.fn(),
  });
  const first=await conversation(message);
  const second=await conversation({...message,providerMessageId:'choice1',text:command(first)});
  expect(second).toContain('Pan dulce');
  const third=await conversation({...message,providerMessageId:'choice2',text:command(second)});
  expect(third).toContain('CONFIRMAR');
  expect(createDraft).toHaveBeenCalledWith(message.from,'infobip:original',[
    {product_id:ids[0],quantity:1},{product_id:ids[2],quantity:1},
  ]);
});
it('chooses per line without removing an explicitly named presentation elsewhere',()=>{
  const result=interpretSaleMessage({text:'Vendí una coca y una coca 2l'},catalogue,{'0':ids[0]});
  expect(result.data.items).toEqual([{product_id:ids[0],quantity:1},{product_id:ids[1],quantity:1}]);
});
it('returns a bounded clarification for a long original sale',()=>{
  const reply=createChoices('a'.repeat(32)).prompt({...message,text:'Vendí una coca '+ '🍎'.repeat(900)},
    {intent:'sale',confidence:0,data:{},needsConfirmation:true,clarification:'Elige',clarificationOptions:[{product_id:ids[0],label:'Coca'}]});
  expect(reply.length).toBeLessThanOrEqual(4096);
});
it('sends a durable business explanation rather than retrying stock failures as server errors',async()=>{
  const sendText=vi.fn(async()=>{}); const completed:string[]=[];
  const webhook=createInfobipWebhook({authenticate:()=>true,recipient:message.to,
    conversation:async()=>{throw {code:'P0001',message:'OUT_OF_STOCK'};},
    processing:{run:async(_message,process)=>{const reply=await process();completed.push(reply);return reply;}},
    provider:{sendText,sendTemplate:vi.fn()},
  });
  const result=await webhook({rawBody:JSON.stringify({results:[{messageId:'stock',from:message.from,to:message.to,
    receivedAt:message.receivedAt,message:{type:'TEXT',text:'sale'}}]}),headers:new Headers({'content-type':'application/json'})});
  expect(result.status).toBe(200);expect(completed[0]).toContain('inventario insuficiente');expect(sendText).toHaveBeenCalledOnce();
});
it('streams the webhook body with a hard limit and preserves auth headers/raw data',async()=>{
  const handler=vi.fn(async (_input:{rawBody:string;headers:Headers})=>{void _input;return {status:200,body:{accepted:1}};});
  const post=createInfobipRoute(()=>handler);
  const response=await post(new Request('https://example.test/api/webhooks/infobip',{method:'POST',headers:{authorization:'Basic fixture'},body:'{"results":[]}'}));
  expect(response.status).toBe(200);expect(handler.mock.calls[0]?.[0]).toMatchObject({rawBody:'{"results":[]}'});
  const oversized=await post(new Request('https://example.test',{method:'POST',body:'x'.repeat(256*1024+1)}));
  expect(oversized.status).toBe(413);expect(handler).toHaveBeenCalledOnce();
});
it('fails closed when real webhook configuration is absent',async()=>{
  const response=await createInfobipRoute(()=>{throw new Error('secret configuration');})(new Request('https://example.test',{method:'POST',body:'{}'}));
  expect(response.status).toBe(503);expect(await response.text()).not.toContain('secret');
});
