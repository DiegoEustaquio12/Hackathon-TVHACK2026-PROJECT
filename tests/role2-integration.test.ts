import { expect, it, vi } from 'vitest';
import { createOnboarding } from '../src/modules/auth/onboarding';
import { createConversation, type ConversationDependencies } from '../src/modules/orchestration/conversation';
import { interpretSaleMessage } from '../src/modules/interpretation/parser';
const id = '00000000-0000-4000-8000-000000000001';
const message = { provider: 'infobip' as const, providerMessageId: 'sale-1', from: '525555555555', to: '447860088970', receivedAt: '2026-11-14T12:00:00Z', kind: 'text' as const, text: 'Hola' };
const quote = { items: [{ product_id: id, description: 'cocas', quantity: 3, unit_price_cents: 2000, subtotal_cents: 6000 }], total_cents: 6000 };
it('asks for explicit name and type, confirms signed details and rejects other senders, tampering and expiry', async () => {
  const complete = vi.fn(async () => {});
  let now = 1000;
  const onboard = createOnboarding({ complete }, 'a'.repeat(32), () => now);
  expect(await onboard(message)).toContain('nombre y giro');
  expect(complete).not.toHaveBeenCalled();
  const reply = await onboard({ ...message, text: 'ALTA Tienda Lupita | Abarrotes' });
  const command = reply.split('\n').find(l => l.includes('CONFIRMAR ALTA'))!.split('responde ')[1];
  expect(await onboard({ ...message, text: command, from: '525555555556' })).toContain('no es válida');
  expect(await onboard({ ...message, text: `${command}x` })).toContain('no es válida');
  await onboard({ ...message, text: command });
  expect(complete).toHaveBeenCalledExactlyOnceWith({ verifiedSender: message.from, name: 'Tienda Lupita', businessType: 'Abarrotes' });
  now += 900001;
  expect(await onboard({ ...message, text: command })).toContain('venció');
});
it('uses the real text interpreter and draft quote; requires the new version after a price change', async () => {
  const confirmDraft = vi.fn<ConversationDependencies['confirmDraft']>();
  confirmDraft.mockResolvedValueOnce({ status: 'price_changed', draft_id: id, quote_version: 2, previous_quote: quote,
    quote: { ...quote, total_cents: 6600, items: [{ ...quote.items[0], unit_price_cents: 2200, subtotal_cents: 6600 }] } });
  confirmDraft.mockResolvedValueOnce({ status: 'quote_outdated', draft_id: id, quote_version: 2, quote });
  confirmDraft.mockResolvedValueOnce({ status: 'confirmed', receipt: { sale_id: id, total_cents: 6600, replayed: false, items: [] } });
  const conversation = createConversation({ resolveActor: async () => ({ businessId: id, verifiedSender: message.from, channel: 'whatsapp' }),
    interpret: async (_actor, request) => interpretSaleMessage(request, [{ id, name: 'cocas', sale_price_cents: 2000, stock: 20 }]),
    createDraft: async () => ({ draft_id: id, status: 'pending', quote_version: 1, expires_at: '2026-11-14T12:15:00Z', quote }),
    confirmDraft, cancelDraft: async () => {} });
  const reply = await conversation({ ...message, text: 'Vendí 3 cocas' });
  expect(reply).toContain('$60.00');
  expect(reply).toContain(`CONFIRMAR ${id} 1`);
  expect(confirmDraft).not.toHaveBeenCalled();
  expect(await conversation({ ...message, text: `CONFIRMAR ${id}` })).toContain('versión');
  const changed = await conversation({ ...message, text: `CONFIRMAR ${id} 1` });
  expect(changed).toContain(`CONFIRMAR ${id} 2`);
  expect(changed).toContain('$66.00');
  expect(changed).not.toContain('Venta registrada:');
  expect(await conversation({ ...message, text: `CONFIRMAR ${id} 1` })).toContain('anterior');
  expect(await conversation({ ...message, text: `CONFIRMAR ${id} 2` })).toContain('Venta registrada: $66.00');
});
