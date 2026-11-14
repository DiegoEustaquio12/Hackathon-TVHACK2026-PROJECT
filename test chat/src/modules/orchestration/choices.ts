import { z } from 'zod';
import { createContinuations } from '../auth/continuations';
import type { InboundMessage } from '../messaging/contracts';
import type { InterpretationResult } from '../interpretation/types';
const contextSchema = z.object({ originalText: z.string().max(2000), operationKey: z.string().min(1).max(200),
  selections: z.record(z.string().regex(/^\d{1,2}$/), z.string().uuid()).default({}) });
const state = contextSchema.extend({ lineIndex: z.number().int().min(0).max(99), options: z.array(z.string().uuid()).min(1).max(5) });
export type SelectionContext = z.infer<typeof contextSchema>;
export function createChoices(secret: string) {
  const tokens = createContinuations(secret);
  return {
    prompt(message: InboundMessage, result: InterpretationResult, previous?: SelectionContext) {
      const options = result.clarificationOptions?.slice(0, 5) ?? [];
      const context = previous ?? { originalText: message.text!.trim(), operationKey: `infobip:${message.providerMessageId}`, selections: {} };
      const token = tokens.issue(message.from, 'product', { ...context, lineIndex: result.clarificationLine ?? 0, options: options.map(o => o.product_id) });
      const lines = options.map((option,i) => `${i+1}. ${option.label}`);
      const reply = `${result.clarification}\n${lines.join('\n')}\nELEGIR ${token} 1\nCambia el último número por la opción elegida. Después recibirás el resumen para confirmar. Si no aparece, escribe la venta completa con sus presentaciones.`;
      return reply.length <= 4096 ? reply : 'La venta es demasiado larga para aclararla aquí. Escríbela de nuevo con la presentación completa de cada producto o divídela en ventas más pequeñas.';
    },
    read(message: InboundMessage) {
      const match = /^ELEGIR (\S+) ([1-5])$/i.exec(message.text?.trim() ?? '');
      if (!match) return null;
      const value = state.parse(tokens.read(match[1], message.from, 'product'));
      const productId = value.options[Number(match[2])-1];
      if (!productId) throw new Error('Invalid selection');
      return { originalText: value.originalText, operationKey: value.operationKey,
        selections: { ...value.selections, [String(value.lineIndex)]: productId } };
    },
  };
}
