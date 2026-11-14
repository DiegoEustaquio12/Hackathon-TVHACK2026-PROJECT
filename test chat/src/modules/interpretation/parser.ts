import type { CatalogueProduct, InterpretationRequest, InterpretationResult } from './types';
import { findProductCandidates } from './product-matching';

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().trim().replace(/\s+/g, ' ');
const clarify = (message: string): InterpretationResult => ({
  intent: 'sale', confidence: 0, data: {}, needsConfirmation: true, clarification: message,
});

/** Pure deterministic parser. Never writes data, creates products or accepts client prices. */
export function interpretSaleMessage(request: InterpretationRequest, catalogue: CatalogueProduct[], selections: Record<string,string> = {}): InterpretationResult {
  if (request.media?.length) return clarify('Por ahora registra la venta por texto; audio e imágenes aún no están habilitados.');
  const text = request.text?.trim() ?? '';
  if (!text || text.length > 2000) return clarify('Escribe una venta de hasta 2000 caracteres con cantidades y productos.');
  const normalized = normalize(text);
  if (/^(?:\u00bf?cuanto vendi hoy\??|ventas de hoy|reporte de hoy)$/.test(normalized)) return {
    intent: 'report', confidence: 1, data: { report: 'sales_today' }, needsConfirmation: false,
  };
  const expense = /^(?:gaste|gasto)\s+\$?(\d+(?:[.,]\d{1,2})?)\s+en\s+(.+)$/.exec(normalized);
  if (expense) {
    const cents = Math.round(Number(expense[1].replace(',', '.')) * 100);
    const concept = expense[2].trim();
    if (cents > 0 && cents <= 2147483647 && concept.length <= 200) return {
      intent: 'expense', confidence: 1, data: { expense: { concept, amount_cents: cents } }, needsConfirmation: true,
    };
    return { intent: 'expense', confidence: 0, data: {}, needsConfirmation: true, clarification: 'Indica un importe positivo y un concepto de hasta 200 caracteres.' };
  }
  const prefix = /^(?:vendi|vendimos|venta\s*:?)(?:\s+|$)/;
  if (!prefix.test(normalized)) return {
    intent: 'unknown', confidence: 0, data: {}, needsConfirmation: false,
    clarification: 'Para registrar una venta escribe, por ejemplo: Vendí 3 cocas y 2 panes.',
  };
  const body = normalized.replace(prefix, '').replace(/[.!]$/, '').trim();
  const parts = body.split(/\s+y\s+(?=[\d-]|un(?:a|o)?\b)|,\s+(?=[\d-]|un(?:a|o)?\b)/);
  if (parts.length > 100) return clarify('La venta admite hasta 100 productos.');
  const items = new Map<string, number>();
  for (const [lineIndex, part] of parts.entries()) {
    const match = /^(\d+(?:[.,]\d{1,3})?|un|una|uno)\s+(.+?)(?:\s+a\s+\$?(\d+(?:[.,]\d{1,2})?))?$/.exec(part.trim());
    if (!match) return clarify('Indica una cantidad positiva y el producto, por ejemplo: Vendí 3 cocas y 2 panes.');
    const quantity = /^un[ao]?$/.test(match[1]) ? 1 : Number(match[1].replace(',', '.'));
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 999999999.999) return clarify('La cantidad debe ser positiva y tener hasta tres decimales.');
    const candidates = findProductCandidates(match[2], catalogue);
    if (candidates.length === 0) return clarify(`No encontré «${match[2]}» en tu catálogo. Regístralo desde productos o indica otro nombre.`);
    const selected = selections[String(lineIndex)];
    if (selected && !candidates.some(p => p.id === selected)) return clarify('El catálogo cambió. Escribe de nuevo la venta con sus presentaciones.');
    if (candidates.length > 1 && !selected) return {
      ...clarify(`¿Cuál producto vendiste: ${candidates.slice(0, 5).map(p => p.name).join(', ')}?`),
      clarificationOptions: candidates.map(p => ({ product_id: p.id, label: p.name })),
      clarificationLine: lineIndex,
    };
    const product = selected ? candidates.find(p => p.id === selected)! : candidates[0];
    if (product.sale_unit === 'piece' && !Number.isInteger(quantity)) return clarify(`${product.name} se vende por pieza; indica una cantidad entera.`);
    if (match[3] !== undefined) {
      const cents = Math.round(Number(match[3].replace(',', '.')) * 100);
      if (cents !== product.sale_price_cents) return clarify(`El precio de ${product.name} en catálogo es $${(product.sale_price_cents / 100).toFixed(2)}. Los precios se cambian en productos; confirma qué producto vendiste.`);
    }
    const aggregate = Math.round(((items.get(product.id) ?? 0) + quantity) * 1000) / 1000;
    if (aggregate > 999999999.999) return clarify('La cantidad acumulada supera el límite permitido.');
    if (aggregate > product.stock) return clarify(`Agotado o existencia insuficiente de ${product.name}: quedan ${product.stock}. Corrige la cantidad.`);
    items.set(product.id, aggregate);
  }
  if (!items.size) return clarify('Agrega al menos un producto y su cantidad.');
  return { intent: 'sale', confidence: 1, data: {
    items: [...items].map(([product_id, quantity]) => ({ product_id, quantity })),
  }, needsConfirmation: true };
}
