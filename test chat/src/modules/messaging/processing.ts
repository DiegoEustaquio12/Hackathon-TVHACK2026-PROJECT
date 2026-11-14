import type { InboundMessage } from './contracts';
import type { DurableProcessing } from './webhook';
/** R1 adapter must persist payload and reply, enforce identity equality, and claim atomically.
 * leaseId fences late workers. Renewal/lease recovery belong to storage; no success on busy. */
export interface ProcessingStore {
  claim(message: InboundMessage): Promise<{ state: 'busy' } | { state: 'completed'; reply: string } | { state: 'claimed'; leaseId: string }>;
  complete(message: InboundMessage, leaseId: string, reply: string): Promise<void>;
  fail(message: InboundMessage, leaseId: string): Promise<void>;
}
export function createDurableProcessing(store: ProcessingStore): DurableProcessing {
  return {
    async run(message, process) {
      const claim = await store.claim(message);
      if (claim.state === 'busy') throw new Error('Event processing in progress');
      if (claim.state === 'completed') return claim.reply;
      try {
        const reply = await process();
        await store.complete(message, claim.leaseId, reply);
        return reply;
      } catch (error) {
        // A lost lease must not replace the original error or undo another worker.
        await store.fail(message, claim.leaseId).catch(() => {});
        throw error;
      }
    },
  };
}
