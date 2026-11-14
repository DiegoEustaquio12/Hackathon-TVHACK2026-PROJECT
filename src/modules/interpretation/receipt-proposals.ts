import { receiptSchema,type ReceiptExtraction } from './receipts';
import { findProductCandidates } from './product-matching';
import type { CatalogueProduct,InterpretationResult } from './types';
const clarify=(message:string):InterpretationResult=>({intent:'sale',confidence:0,data:{},needsConfirmation:true,clarification:message});
export function receiptBlocker(receipt:ReceiptExtraction) {
  if(!receipt.readable) return 'El ticket no es legible. Envía otra foto antes de proponer una operación.';
  if(receipt.currency!=='MXN') return 'Confirma o corrige la moneda por texto; no puedo asumir MXN ni convertir el importe del ticket.';
  if(receipt.total_cents===null) return 'El importe total no es legible. Corrígelo antes de continuar.';
  if(receipt.warnings.length) return 'El ticket tiene advertencias de lectura. Corrige los datos por texto o envía una nueva imagen antes de proponer una operación.';
}
/** Structured rows never become executable text. No catalogue creation or price overrides. */
export function interpretReceiptSale(value:ReceiptExtraction,catalogue:CatalogueProduct[],selections:Record<string,string>={}):InterpretationResult {
  const receipt=receiptSchema.parse(value);const blocked=receiptBlocker(receipt);
  if(blocked) return clarify(blocked);
  if(!receipt.items.length) return clarify('No hay renglones legibles en el ticket. Indica los productos y cantidades.');
  const items=new Map<string,number>();let total=0;
  for(const [index,line] of receipt.items.entries()) {
    const quantity=line.quantity;
    if(quantity===null||quantity<=0||Math.abs(quantity*1000-Math.round(quantity*1000))>0.00001)
      return clarify(`La cantidad del renglón ${index+1} no es válida. Indícala por texto; no asumiré una unidad.`);
    const candidates=findProductCandidates(line.description,catalogue);
    if(!candidates.length) return clarify(`No encontré el producto del renglón ${index+1} en tu catálogo. Revisa el nombre o regístralo desde productos.`);
    const selected=selections[String(index)];
    if(selected&&!candidates.some(p=>p.id===selected)) return clarify('El catálogo cambió. Revisa la presentación del ticket de nuevo.');
    if(candidates.length>1&&!selected) return {...clarify(`¿Qué presentación corresponde al renglón ${index+1} del ticket?`),
      clarificationOptions:candidates.map(p=>({product_id:p.id,label:p.name})),clarificationLine:index};
    const product=selected?candidates.find(p=>p.id===selected)!:candidates[0];
    if(product.sale_unit==='piece'&&!Number.isInteger(quantity)) return clarify(`El producto del renglón ${index+1} se vende por pieza; revisa la cantidad.`);
    const subtotal=Math.round(quantity*product.sale_price_cents);
    if((line.unit_price_cents!==null&&line.unit_price_cents!==product.sale_price_cents)
      ||(line.line_total_cents!==null&&line.line_total_cents!==subtotal))
      return clarify(`El precio o importe impreso del renglón ${index+1} no coincide con el catálogo. Revisa el ticket; los precios se editan en productos, nunca desde la venta.`);
    const aggregate=Math.round(((items.get(product.id)??0)+quantity)*1000)/1000;
    if(aggregate>999999999.999||aggregate>product.stock) return clarify(`Agotado o existencia insuficiente en el renglón ${index+1}. Corrige las cantidades.`);
    items.set(product.id,aggregate);total+=subtotal;
  }
  const aggregateTotal=[...items].reduce((sum,[id,quantity])=>sum+Math.round(quantity*catalogue.find(p=>p.id===id)!.sale_price_cents),0);
  if(total!==aggregateTotal) return clarify('El redondeo de los renglones difiere del total agregado. Revisa las cantidades por texto.');
  if(total!==receipt.total_cents) return clarify('El total impreso no coincide con los renglones a precio de catálogo. Revisa impuestos, descuentos o lectura; no registraré un carrito parcial.');
  return {intent:'sale',confidence:1,data:{items:[...items].map(([product_id,quantity])=>({product_id,quantity}))},needsConfirmation:true};
}
