import type { CatalogueProduct } from './types';

/** Search normalization only: never changes stored product identity. */
export function searchTokens(value: string): string[] {
  const text = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/(\d+(?:[.,]\d+)?)\s*(mililitros?|ml|litros?|l|kilogramos?|kilos?|kg|gramos?|g)\b/g,
      (_, amount: string, unit: string) => {
        const n = Number(amount.replace(',', '.'));
        if (/^(l|litro)/.test(unit)) return `${Math.round(n * 1000 * 1000) / 1000} ml`;
        if (/^(kg|kilo)/.test(unit)) return `${Math.round(n * 1000 * 1000) / 1000} g`;
        return `${n} ${/^(ml|mililitro)/.test(unit) ? 'ml' : 'g'}`;
      }).replace(/[^a-z0-9.]+/g, ' ');
  return text.trim().split(/\s+/).filter(word => word && !['de', 'del', 'la', 'el'].includes(word)).map(word => {
    if (word.endsWith('nes') && word.length > 4) return word.slice(0, -2);
    return word.endsWith('s') && word.length > 3 && !word.endsWith('es') ? word.slice(0, -1) : word;
  });
}

export function findProductCandidates(query: string, catalogue: CatalogueProduct[]): CatalogueProduct[] {
  const tokens = searchTokens(query);
  if (!tokens.length) return [];
  // Collect every matching presentation: an exact colloquial alias must not
  // hide another presentation that also matches the merchant's description.
  return catalogue.filter(product => {
    const names = [product.name, ...(product.aliases ?? [])];
    const identity = [product.product_type, product.brand, product.variant, product.presentation].filter(Boolean).join(' ');
    const technical = product.content_amount != null && product.content_unit
      ? `${product.content_amount} ${product.content_unit === 'piece' ? 'pieza' : product.content_unit}` : '';
    const available = new Set(searchTokens([...names, identity, technical].join(' ')));
    return tokens.every(token => available.has(token));
  });
}
