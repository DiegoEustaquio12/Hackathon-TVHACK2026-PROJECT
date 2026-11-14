import { describe, expect, it } from 'vitest';
import { interpretSaleMessage } from '../src/modules/interpretation/parser';
import { productSpecificationSchema } from '../src/modules/data/products';
import type { CatalogueProduct } from '../src/modules/interpretation/types';

const coke = (id: string, size: number, price: number): CatalogueProduct => ({
  id, name: `Coca-Cola Refresco Original ${size} ml · Botella PET`,
  product_type: 'Refresco', brand: 'Coca-Cola', variant: 'Original', presentation: 'Botella PET',
  content_amount: size, content_unit: 'ml', sale_unit: 'piece', aliases: ['coca'],
  stock: 20, sale_price_cents: price,
});
const catalogue = [coke('small', 600, 2000), coke('large', 2000, 4000)];
const parse = (text: string, products = catalogue) => interpretSaleMessage({ text }, products);

describe('standard products and merchant phrases', () => {
  it('does not guess the presentation of una coca', () => {
    const result = parse('Vendí una coca');
    expect(result.data.items).toBeUndefined();
    expect(result.clarificationOptions?.map(p => p.product_id)).toEqual(['small','large']);
    expect(result.clarification).toContain('600 ml');
    expect(result.clarification).toContain('2000 ml');
  });
  it.each(['Vendí una coca 600ml', 'Vendí una coca-cola de 600 ml', 'Vendí una coca de 0.6 litros'])('resolves explicit specifications: %s', text => {
    expect(parse(text).data.items).toEqual([{ product_id: 'small', quantity: 1 }]);
  });
  it('resolves a unique known presentation but always requires confirmation', () => {
    const result = parse('Vendí una coca', [catalogue[0]]);
    expect(result.data.items).toEqual([{ product_id: 'small', quantity: 1 }]);
    expect(result.needsConfirmation).toBe(true);
  });
  it('resolves litres and does not confuse a product size with a sale quantity', () => {
    expect(parse('Vendí una coca de 2 litros').data.items).toEqual([{ product_id:'large', quantity:1 }]);
    expect(parse('Vendí una coca de 355 ml').data.items).toBeUndefined();
  });
  it('does not hide other presentations behind an exact alias/name', () => {
    expect(parse('Vendí una coca', [catalogue[0], { ...catalogue[1], name:'Coca' }]).clarificationOptions).toHaveLength(2);
  });
  it('does not sell half a packaged unit', () => {
    expect(parse('Vendí 0.5 coca 600ml').data.items).toBeUndefined();
  });
  it('requires a product specification, not a free-form display name', () => {
    expect(productSpecificationSchema.safeParse({ name:'coca', price:20 }).success).toBe(false);
    expect(productSpecificationSchema.safeParse({ product_type:'Refresco', brand:'Coca-Cola',
      presentation:'Botella PET', variant:'Original', content_amount:600,
      content_unit:'ml', sale_unit:'piece', aliases:['coca'] }).success).toBe(true);
  });
  it('interprets a report and an expense without writing them', () => {
    expect(parse('¿Cuánto vendí hoy?').data.report).toBe('sales_today');
    expect(parse('Gasté $50.50 en luz')).toMatchObject({ intent:'expense', needsConfirmation:true,
      data:{ expense:{ concept:'luz', amount_cents:5050 } } });
    expect(parse('Gasté 0 en luz').data.expense).toBeUndefined();
  });
});
