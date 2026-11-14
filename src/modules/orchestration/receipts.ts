import { z } from 'zod';
import { createContinuations } from '../auth/continuations';
import { formatReceiptReview, ReceiptError, type ReceiptExtraction } from '../interpretation/receipts';
import { AudioError } from '../media/audio';
import type { AudioReference } from '../media/audio';
import type { InboundMessage, WhatsAppActor } from '../messaging/contracts';
/** Initial extraction/review only. Classification never approves an accounting operation. */
export function createReceiptReview(secret:string,prepare:(actor:WhatsAppActor,ref:AudioReference)=>Promise<ReceiptExtraction>) {
  const tokens=createContinuations(secret);
  const context=z.object({businessId:z.string().uuid(),storageKey:z.string().max(1024)}).strict();
  return {
    async review(actor:WhatsAppActor,ref:AudioReference) {
      try {
        const result=await prepare(actor,ref);
        const review=formatReceiptReview(result);
        if(!result.readable) return review;
        const token=tokens.issue(actor.verifiedSender,'receipt-kind',{businessId:actor.businessId,storageKey:ref.storageKey});
        return `${review}\nTIPO TICKET ${token} VENTA\nCambia VENTA por COMPRA o GASTO según corresponda. La selección no registra operaciones.`;
      } catch(error) {
        if((error instanceof ReceiptError||error instanceof AudioError)&&!error.retryable) return 'No pude leer el ticket de forma confiable. Envía otra foto completa y enfocada o escribe los datos. No se registró ninguna operación.';
        throw error;
      }
    },
    command(actor:WhatsAppActor,message:InboundMessage):string|null {
      const match=/^TIPO TICKET (\S+) (VENTA|COMPRA|GASTO)$/i.exec(message.text?.trim()??'');
      if(!match) return null;
      try {
        const data=context.parse(tokens.read(match[1],actor.verifiedSender,'receipt-kind'));
        if(data.businessId!==actor.businessId) throw new Error();
      } catch {return 'La revisión venció o no pertenece a tu negocio. Envía de nuevo el ticket.';}
      const kind=match[2].toUpperCase();
      if(kind==='COMPRA') return 'Lo identificaste como compra a proveedor. No se registró gasto ni entrada de inventario. La recepción de compras y su confirmación todavía no están implementadas; conserva y revisa los datos del ticket.';
      if(kind==='GASTO') return 'Lo identificaste como gasto. Revisa moneda e importe y escribe: Gasté <importe MXN> en <concepto>. Recibirás una propuesta que debes confirmar. Todavía no se guardó ningún gasto.';
      return 'Lo identificaste como venta de tu negocio. Revisa productos, cantidades y presentaciones y escribe: Vendí <cantidades y productos>. Se utilizarán los precios del catálogo y recibirás un resumen para confirmar. Todavía no se registró la venta.';
    },
  };
}
