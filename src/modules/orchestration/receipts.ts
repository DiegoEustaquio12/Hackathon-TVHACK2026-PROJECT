import { z } from 'zod';
import { createContinuations } from '../auth/continuations';
import { formatReceiptReview, ReceiptError, type ReceiptExtraction } from '../interpretation/receipts';
import { interpretReceiptSale,receiptBlocker } from '../interpretation/receipt-proposals';
import type { ReceiptReview,ReceiptReviewRepository } from '../data/receipt-reviews';
import { AudioError,type AudioReference } from '../media/audio';
import type { CatalogueProduct,InterpretationResult } from '../interpretation/types';
import type { InboundMessage,WhatsAppActor } from '../messaging/contracts';
import type { SelectionContext } from './choices';
export type ReceiptSaleProposal={kind:'sale';result:InterpretationResult;context:SelectionContext;notice:string};
export type ReceiptExpenseProposal={kind:'expense';reviewId:string;occurredAt:string;expense:{concept:string;amount_cents:number}};
export function createReceiptReview(secret:string,deps:{
  prepare:(actor:WhatsAppActor,ref:AudioReference)=>Promise<ReceiptExtraction>;
  repository:ReceiptReviewRepository;
  catalogue:(actor:WhatsAppActor)=>Promise<CatalogueProduct[]>;
}) {
  const tokens=createContinuations(secret);
  const context=z.object({businessId:z.string().uuid(),reviewId:z.string().uuid()}).strict();
  function verify(actor:WhatsAppActor,review:ReceiptReview) {
    if(review.business_id!==actor.businessId) throw new Error('RECEIPT_REVIEW_NOT_FOUND');
    if(!Number.isFinite(Date.parse(review.expires_at))||Date.parse(review.expires_at)<=Date.now()) throw new Error('RECEIPT_REVIEW_EXPIRED');
  }
  async function sale(actor:WhatsAppActor,review:ReceiptReview,selections:Record<string,string>={}):Promise<ReceiptSaleProposal> {
    verify(actor,review);
    if(review.classification!=='sale') throw new Error('RECEIPT_KIND_LOCKED');
    const result=interpretReceiptSale(review.extraction,await deps.catalogue(actor),selections);
    return {kind:'sale',result,context:{receiptId:review.id,originalText:`Ticket ${review.id}`,operationKey:`receipt:${review.id}`,selections},
      notice:`Ticket revisado. Total impreso: $${((review.extraction.total_cents??0)/100).toFixed(2)} MXN. El resumen usa precios vigentes del catálogo.\n`};
  }
  return {
    async review(actor:WhatsAppActor,ref:AudioReference,occurredAt:string) {
      try {
        const extraction=await deps.prepare(actor,ref);
        if(!extraction.readable) return formatReceiptReview(extraction);
        const saved=await deps.repository.save(actor.verifiedSender,ref.storageKey,extraction,occurredAt);
        verify(actor,saved);
        const token=tokens.issue(actor.verifiedSender,'receipt-kind',{businessId:actor.businessId,reviewId:saved.id});
        return `${formatReceiptReview(saved.extraction)}\nTIPO TICKET ${token} VENTA\nCambia VENTA por COMPRA o GASTO. Al elegir revisarás una propuesta; no se registra nada hasta confirmar.`;
      } catch(error) {
        if((error instanceof ReceiptError||error instanceof AudioError)&&!error.retryable) return 'No pude leer el ticket de forma confiable. Envía otra foto completa y enfocada o escribe los datos. No se registró ninguna operación.';
        throw error;
      }
    },
    async command(actor:WhatsAppActor,message:InboundMessage):Promise<string|ReceiptSaleProposal|ReceiptExpenseProposal|null> {
      const match=/^TIPO TICKET (\S+) (VENTA|COMPRA|GASTO)$/i.exec(message.text?.trim()??'');
      if(!match) return null;
      let data:z.infer<typeof context>;
      try {
        data=context.parse(tokens.read(match[1],actor.verifiedSender,'receipt-kind'));
        if(data.businessId!==actor.businessId) throw new Error();
      } catch {return 'La revisión venció o no pertenece a tu negocio. Envía de nuevo el ticket.';}
      const kinds={VENTA:'sale',COMPRA:'purchase',GASTO:'expense'} as const;
      const kind=kinds[match[2].toUpperCase() as keyof typeof kinds];
      const review=await deps.repository.classify(actor.verifiedSender,data.reviewId,kind);
      verify(actor,review);
      if(kind==='purchase') return 'Lo identificaste como compra a proveedor. No se registró gasto ni entrada de inventario. La recepción de compras y su confirmación todavía no están implementadas; conserva y revisa los datos del ticket.';
      if(kind==='sale') return sale(actor,review);
      const blocked=receiptBlocker(review.extraction);
      if(blocked) return blocked;
      if(review.extraction.total_cents!<=0) return 'Un gasto requiere un importe positivo. Revisa el total del ticket.';
      const merchant=(review.extraction.merchant??'sin comercio legible').replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g,' ');
      return {kind:'expense',reviewId:review.id,occurredAt:review.occurred_at,
        expense:{concept:`Ticket: ${merchant}`.slice(0,200),amount_cents:review.extraction.total_cents!}};
    },
    async select(actor:WhatsAppActor,reviewId:string,selections:Record<string,string>) {
      return sale(actor,await deps.repository.get(actor.verifiedSender,reviewId),selections);
    },
  };
}
