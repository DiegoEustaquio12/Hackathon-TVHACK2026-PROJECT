import { describe, expect, it } from 'vitest';
import { interpretSaleMessage } from '../src/modules/interpretation/parser';
import type { CatalogueProduct } from '../src/modules/interpretation/types';
import { formatPriceChangeNotice } from '../src/modules/data/sale-results';

const catalogue: CatalogueProduct[] = [
  { id: 'coca', name: 'Coca', sale_price_cents: 2000, stock: 10 },
  { id: 'pan', name: 'Pan', sale_price_cents: 1500, stock: 10 },
];
const parse = (text: string, products = catalogue) => interpretSaleMessage({ text }, products);

describe('deterministic sale interpretation', () => {
  it('clearly explains old and new amounts without claiming the sale was saved', () => {
    const product = { product_id: '22222222-2222-4222-8222-222222222221', description: 'Coca', quantity: 3 };
    const message = formatPriceChangeNotice({ status: 'price_changed', draft_id: '11111111-1111-4111-8111-111111111111', quote_version: 2,
      previous_quote: { total_cents: 6000, items: [{ ...product, unit_price_cents: 2000, subtotal_cents: 6000 }] },
      quote: { total_cents: 7500, items: [{ ...product, unit_price_cents: 2500, subtotal_cents: 7500 }] },
    });
    expect(message).toContain('Total anterior: $60.00');
    expect(message).toContain('Nuevo total: $75.00');
    expect(message).toContain('confirma otra vez');
  });
  it('resolves the MVP example without prices or writes and requires confirmation', () => {
    expect(parse('Vendí 3 cocas y 2 panes')).toEqual({ intent: 'sale', confidence: 1,
      data: { items: [{ product_id: 'coca', quantity: 3 }, { product_id: 'pan', quantity: 2 }] },
      needsConfirmation: true });
  });
  it('accepts catalogue prices but rejects overrides', () => {
    expect(parse('Vendí 3 cocas a $20 y 2 panes a $15').clarification).toBeUndefined();
    expect(parse('Vendí 3 cocas a $1').data.items).toBeUndefined();
  });
  it('asks about multiple presentations and does not expose a partial cart', () => {
    const result = parse('Vendí 2 cocas', [
      { ...catalogue[0], name: 'Coca 600 ml' }, { ...catalogue[0], id: 'other', name: 'Coca 2 litros' },
    ]);
    expect(result.clarification).toContain('¿Cuál');
    expect(result.data.items).toBeUndefined();
  });
  it('does not invent unknown products or use another business catalogue', () => {
    expect(parse('Vendí 2 cocas', []).data.items).toBeUndefined();
    expect(parse('Vendí 1 pan y 2 jabones').data.items).toBeUndefined();
  });
  it.each(['Vendí 0 cocas', 'Vendí -1 pan', 'Vendí 1.1234 pan', 'Vendí 1000000000 panes', 'Vendí'])('rejects invalid quantities: %s', text => {
    expect(parse(text).data.items).toBeUndefined();
  });
  it('aggregates repeated items and checks combined stock', () => {
    expect(parse('Vendí 2 cocas y 3 cocas').data.items).toEqual([{ product_id: 'coca', quantity: 5 }]);
    expect(parse('Vendí 6 cocas y 6 cocas').clarification).toContain('insuficiente');
  });
  it('handles decimal quantities and explicit aliases', () => {
    expect(parse('Vendí 1,5 pan').data.items?.[0].quantity).toBe(1.5);
    expect(parse('Vendí 2 refrescos', [{ ...catalogue[0], aliases: ['refresco'] }]).data.items?.[0].product_id).toBe('coca');
  });
  it('does not treat unsupported messages or media as executed sales', () => {
    expect(parse('Hola').intent).toBe('unknown');
    expect(interpretSaleMessage({ media: [{ kind: 'audio', storageKey: 'fixture', mimeType: 'audio/ogg' }] }, catalogue).data.items).toBeUndefined();
  });
});
