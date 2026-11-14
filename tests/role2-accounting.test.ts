import { expect, it, vi } from 'vitest';
import { createAccounting } from '../src/modules/orchestration/accounting';
import { createChoices } from '../src/modules/orchestration/choices';
const message = { provider: 'infobip' as const, providerMessageId: 'expense-original', from: '525555555555', to: '447860088970', receivedAt: '2026-11-14T12:00:00Z', kind: 'text' as const, text: 'Gasté 50 en luz' };
it('requires signed expense approval and preserves operation and occurrence across retries', async () => {
  const record = vi.fn(async () => ({}));
  const accounting = createAccounting({ record, report: vi.fn(), setTimeZone: vi.fn() }, 'a'.repeat(32), () => 1000);
  const proposal = accounting.propose(message, { concept: 'luz', amount_cents: 5000 });
  const command = proposal.split('\n')[1].replace('Responde ', '');
  expect(record).not.toHaveBeenCalled();
  expect(await accounting.command({ ...message, text: command, from: '525555555556' })).toContain('no es válida');
  await accounting.command({ ...message, text: command });
  await accounting.command({ ...message, providerMessageId: 'retry', text: command });
  expect(record).toHaveBeenCalledTimes(2);
  expect(record.mock.calls[0]).toEqual(record.mock.calls[1]);
  expect(record.mock.calls[0]).toEqual([{ verifiedSender: message.from, operationKey: 'expense:expense-original', concept: 'luz', amountCents: 5000, occurredAt: message.receivedAt }]);
});
it('asks for explicit timezone and rejects invalid settings', async () => {
  const setTimeZone = vi.fn();
  const accounting = createAccounting({ record: vi.fn(), report: async () => { throw new Error('TIME_ZONE_REQUIRED'); }, setTimeZone }, 'a'.repeat(32));
  expect(await accounting.report(message.from)).toContain('zona horaria');
  expect(await accounting.command({ ...message, text: 'ZONA inventada' })).toContain('no válida');
  expect(setTimeZone).not.toHaveBeenCalled();
});
it('binds product choices to sender, original sale and original operation', () => {
  const choices = createChoices('a'.repeat(32));
  const reply = choices.prompt({ ...message, text: 'Vendí 3 cocas' }, { intent: 'sale', confidence: 0, data: {}, needsConfirmation: true,
    clarification: 'Elige presentación', clarificationOptions: [{ product_id: '00000000-0000-4000-8000-000000000001', label: 'Coca 600 ml' }] });
  const command = reply.split('\n').find(line => line.startsWith('ELEGIR '))!;
  expect(choices.read({ ...message, text: command })).toMatchObject({ originalText: 'Vendí 3 cocas', operationKey: 'infobip:expense-original' });
  expect(() => choices.read({ ...message, text: command, from: '525555555556' })).toThrow();
});
