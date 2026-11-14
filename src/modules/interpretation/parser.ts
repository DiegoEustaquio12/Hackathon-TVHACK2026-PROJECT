import type { CatalogueProduct, InterpretationRequest, InterpretationResult } from './types';

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().trim().replace(/\s+/g, ' ');
const singular = (value: string) => normalize(value).split(' ').map(word => {
  if (word.endsWith('nes') && word.length > 4) return word.slice(0, -2);
  return word.endsWith('s') && word.length > 3 && !word.endsWith('es') ? word.slice(0, -1) : word;
}).join(' ');
const clarify = (message: string): InterpretationResult => ({
  intent: 'sale', confidence: 0, data: {}, needsConfirmation: true, clarification: message,
});

/** Pure deterministic parser. Never writes data, creates products or accepts client prices. */
export function interpretSaleMessage(request: InterpretationRequest, catalogue: CatalogueProduct[]): InterpretationResult {
  if (request.media?.length) return clarify('Por ahora registra la venta por texto; audio e imágenes aún no están habilitados.');
  const text = request.text?.trim() ?? '';
  if (!text || text.length > 2000) return clarify('Escribe una venta de hasta 2000 caracteres con cantidades y productos.');
  const normalized = normalize(text);
  const prefix = /^(?:vendi|vendimos|venta\s*:?)(?:\s+|$)/;
  if (!prefix.test(normalized)) return {
    intent: 'unknown', confidence: 0, data: {}, needsConfirmation: false,
    clarification: 'Para registrar una venta escribe, por ejemplo: Vendí 3 cocas y 2 panes.',
  };
  const body = normalized.replace(prefix, '').replace(/[.!]$/, '').trim();
  const parts = body.split(/\s+y\s+(?=[\d-])|,\s+(?=[\d-])/);
  if (parts.length > 100) return clarify('La venta admite hasta 100 productos.');
  const items = new Map<string, number>();
  for (const part of parts) {
    const match = /^(\d+(?:[.,]\d{1,3})?)\s+(.+?)(?:\s+a\s+\$?(\d+(?:[.,]\d{1,2})?))?$/.exec(part.trim());
    if (!match) return clarify('Indica una cantidad positiva y el producto, por ejemplo: Vendí 3 cocas y 2 panes.');
    const quantity = Number(match[1].replace(',', '.'));
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 999999999.999) return clarify('La cantidad debe ser positiva y tener hasta tres decimales.');
    const query = singular(match[2]);
    const names = (product: CatalogueProduct) => [product.name, ...(product.aliases ?? [])].map(singular);
    const exact = catalogue.filter(product => names(product).includes(query));
    const candidates = exact.length ? exact : catalogue.filter(product => names(product).some(name => name.startsWith(`${query} `)));
    if (candidates.length === 0) return clarify(`No encontré «${match[2]}» en tu catálogo. Regístralo desde productos o indica otro nombre.`);
    if (candidates.length > 1) return clarify(`¿Cuál producto vendiste: ${candidates.slice(0, 5).map(p => p.name).join(', ')}?`);
    const product = candidates[0];
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
