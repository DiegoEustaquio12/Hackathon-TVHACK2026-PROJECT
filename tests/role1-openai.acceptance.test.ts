import { readFile } from 'node:fs/promises';
import { dirname,resolve } from 'node:path';
import { expect,it } from 'vitest';
import { z } from 'zod';
import { createOpenAIAudioTranscriber } from '../src/modules/media/openai-transcriber';
import { createOpenAIReceiptExtractor } from '../src/modules/media/openai-receipts';
import { interpretSaleMessage } from '../src/modules/interpretation/parser';
// Opt-in real uploads only. No Supabase, messaging, catalogue writes or accounting effects.
it.skipIf(process.env.RUN_OPENAI_ACCEPTANCE!=='true')('evaluates real OpenAI audio/image fixtures against reviewed expected fields',async()=>{
  const path=process.env.ROLE1_OPENAI_FIXTURE_MANIFEST;
  const apiKey=process.env.OPENAI_API_KEY;
  if(!path||!apiKey) throw new Error('Configure fixture manifest and OPENAI_API_KEY locally; never paste credentials into chat.');
  const product=z.object({id:z.string().uuid(),name:z.string(),sale_price_cents:z.number().int().nonnegative(),stock:z.number().nonnegative(),
    aliases:z.array(z.string()).optional(),sale_unit:z.enum(['piece','kg','g','l','ml']).optional()});
  const item=z.object({product_id:z.string().uuid(),quantity:z.number().positive()});
  const manifest=z.object({catalogue:z.array(product),
    audio:z.array(z.object({file:z.string(),mimeType:z.string(),expected:z.discriminatedUnion('kind',[
      z.object({kind:z.literal('sale'),items:z.array(item).min(1)}),z.object({kind:z.literal('clarification')})])})).max(20),
    images:z.array(z.object({file:z.string(),mimeType:z.string(),currency:z.enum(['MXN','other','unknown']),total_cents:z.number().int().nullable(),
      items:z.array(z.object({description:z.string(),quantity:z.number().nullable(),unit_price_cents:z.number().int().nullable(),line_total_cents:z.number().int().nullable()}))})).max(20),
  }).parse(JSON.parse(await readFile(path,'utf8')));
  if(!manifest.audio.length&&!manifest.images.length) throw new Error('At least one reviewed fixture is required.');
  const normal=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
  const canonicalItems=(items:z.infer<typeof item>[])=>JSON.stringify([...items].sort((a,b)=>a.product_id.localeCompare(b.product_id)));
  const transcriber=createOpenAIAudioTranscriber({apiKey});
  const vision=createOpenAIReceiptExtractor({apiKey,model:process.env.OPENAI_RECEIPT_MODEL});
  for(const [index,fixture] of manifest.audio.entries()) {
    const text=await transcriber.transcribe({bytes:await readFile(resolve(dirname(path),fixture.file)),mimeType:fixture.mimeType});
    const result=interpretSaleMessage({text},manifest.catalogue);
    const passed=fixture.expected.kind==='clarification'?Boolean(result.clarification)&&!result.data.items:
      result.needsConfirmation&&!result.clarification&&canonicalItems(result.data.items??[])===canonicalItems(fixture.expected.items);
    // Boolean assertions avoid printing actual audio transcriptions or receipt contents on failure.
    expect(passed,`Audio fixture ${index+1}: products/quantities/clarification`).toBe(true);
  }
  for(const [index,fixture] of manifest.images.entries()) {
    const result=await vision.extract({bytes:await readFile(resolve(dirname(path),fixture.file)),mimeType:fixture.mimeType});
    const equal=result.readable&&result.currency===fixture.currency&&result.total_cents===fixture.total_cents
      &&result.items.length===fixture.items.length&&result.items.every((line,i)=>{
        const expected=fixture.items[i];return normal(line.description)===normal(expected.description)&&line.quantity===expected.quantity
          &&line.unit_price_cents===expected.unit_price_cents&&line.line_total_cents===expected.line_total_cents;
      });
    expect(equal,`Image fixture ${index+1}: currency, amounts, descriptions and quantities`).toBe(true);
  }
},120000);
