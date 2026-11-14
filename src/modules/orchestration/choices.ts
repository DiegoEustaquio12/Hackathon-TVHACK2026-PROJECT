import { z } from 'zod';
import { createContinuations } from '../auth/continuations';
import type { InboundMessage } from '../messaging/contracts';
import type { InterpretationResult } from '../interpretation/types';
const state = z.object({ originalText: z.string().max(2000), productId: z.string().uuid(), operationKey: z.string().min(1).max(200) });
export function createChoices(secret: string) {
  const tokens = createContinuations(secret);
  return {
    prompt(message: InboundMessage, result: InterpretationResult) {
      const options = result.clarificationOptions?.slice(0, 5) ?? [];
      const lines = options.map(option => {
        const token = tokens.issue(message.from, 'product', { originalText: message.text, productId: option.product_id, operationKey: `infobip:${message.providerMessageId}` });
        return `${option.label}\nELEGIR ${token}`;
      });
      return `${result.clarification}\n${lines.join('\n')}\nCopia el comando ELEGIR de la presentación correcta. Después recibirás el resumen para confirmar la venta. Si no aparece tu producto, escribe la venta completa con sus presentaciones.`;
    },
    read(message: InboundMessage) {
      const match = /^ELEGIR (\S+)$/i.exec(message.text?.trim() ?? '');
      if (!match) return null;
      return state.parse(tokens.read(match[1], message.from, 'product'));
    },
  };
}
