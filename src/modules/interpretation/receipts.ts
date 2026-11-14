import { z } from 'zod';
import type { AudioActor, AudioReference } from '../media/audio';
import { MAX_AUDIO_BYTES } from '../media/audio';
import { validateMediaContent } from '../media/formats';

const cents=z.number().int().nonnegative().max(2147483647).nullable();
export const receiptSchema=z.object({
  readable:z.boolean(),merchant:z.string().max(160).nullable(),date:z.string().max(40).nullable(),
  currency:z.enum(['MXN','other','unknown']),total_cents:cents,
  items:z.array(z.object({description:z.string().min(1).max(160),
    quantity:z.number().positive().max(999999999.999).nullable(),unit_price_cents:cents,line_total_cents:cents}).strict()).max(60),
  warnings:z.array(z.string().max(200)).max(12),
}).strict();
export type ReceiptExtraction=z.infer<typeof receiptSchema>;
export class ReceiptError extends Error {
  constructor(public readonly retryable:boolean){super('RECEIPT_EXTRACTION_UNAVAILABLE');}
}
export interface ReceiptExtractor { extract(image:{bytes:Uint8Array;mimeType:string}):Promise<ReceiptExtraction>; }
export function createReceiptPreparation(deps:{reader:{read(actor:AudioActor,ref:AudioReference,maxBytes:number):Promise<{bytes:Uint8Array;mimeType:string}>};extractor:ReceiptExtractor}) {
  return async(actor:AudioActor,ref:AudioReference)=>{
    if(!ref.mimeType.startsWith('image/')) throw new ReceiptError(false);
    const image=await deps.reader.read(actor,ref,MAX_AUDIO_BYTES);
    validateMediaContent('image',image.mimeType,image.bytes);
    return receiptSchema.parse(await deps.extractor.extract(image));
  };
}
export function formatReceiptReview(value:ReceiptExtraction) {
  const receipt=receiptSchema.parse(value);
  const clean=(text:string)=>text.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g,' ');
  const amount=(n:number|null)=>n===null?'ilegible':`$${(n/100).toFixed(2)}`;
  if(!receipt.readable) return 'No pude leer el ticket. Envía una foto completa, enfocada y con buena luz. No se registró ninguna operación.';
  return ['Lectura preliminar del ticket; revisa los datos.',`Comercio: ${receipt.merchant?clean(receipt.merchant):'ilegible'}`,
    `Fecha impresa: ${receipt.date?clean(receipt.date):'ilegible'}`,`Moneda: ${receipt.currency}`, ...receipt.items.map(i=>
      `${i.quantity??'?'} × ${clean(i.description)}: ${amount(i.line_total_cents)}`),`Total impreso: ${amount(receipt.total_cents)}`,
    ...receipt.warnings.map(w=>`Revisar: ${clean(w)}`),
    '¿Es una VENTA de tu negocio, una COMPRA a proveedor o un GASTO? Indica el tipo antes de registrar.',
    'Esta primera etapa solo extrae datos: no crea productos, no modifica precios/stock y no registra ventas ni gastos. Para registrar una operación revisada, usa el flujo de texto con su resumen y confirmación. Las compras de inventario aún no tienen registro automático.',
  ].join('\n');
}
