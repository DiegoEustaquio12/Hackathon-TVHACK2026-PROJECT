import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { completeBusinessOnboarding, findBusinessByWhatsApp } from '../data/businesses';
import type { InboundMessage } from '../messaging/contracts';
const details = z.object({ verifiedSender: z.string().regex(/^[1-9][0-9]{7,14}$/),
  name: z.string().trim().min(1).max(160), businessType: z.string().trim().min(1).max(160) });
const signedDetails = details.extend({ expiresAt: z.number().int().positive() }).strict();
export interface OnboardingRepository {
  complete(input: z.infer<typeof details>): Promise<void>;
}
/** Stateless, signed and short-lived. Only an authenticated provider sender may redeem. */
export function createOnboarding(repository: OnboardingRepository, secret: string, now = Date.now) {
  if (Buffer.byteLength(secret) < 32) throw new Error('Onboarding signing key must have at least 32 bytes');
  const sign = (payload: string) => createHmac('sha256', secret).update(payload).digest('base64url');
  return async (message: InboundMessage) => {
    if (message.kind !== 'text') return 'Para dar de alta tu negocio, escribe ALTA Nombre del negocio | Giro.';
    const text = message.text!.trim();
    if (/^CANCELAR ALTA$/i.test(text)) return 'Alta cancelada. No se guardó ningún negocio.';
    const confirmation = /^CONFIRMAR ALTA ([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/i.exec(text);
    if (confirmation) {
      let value: z.infer<typeof signedDetails>;
      try {
        if (text.length > 3000) throw new Error();
        const expected = Buffer.from(sign(confirmation[1]));
        const actual = Buffer.from(confirmation[2]);
        if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new Error();
        value = signedDetails.parse(JSON.parse(Buffer.from(confirmation[1], 'base64url').toString('utf8')));
        if (value.verifiedSender !== message.from || value.expiresAt <= now()) throw new Error();
      } catch { return 'La confirmación de alta no es válida o venció. Escribe ALTA Nombre del negocio | Giro otra vez.'; }
      await repository.complete({ verifiedSender: value.verifiedSender, name: value.name, businessType: value.businessType });
      return 'Negocio registrado. Ahora escribe tu venta con productos y cantidades. El catálogo debe estar configurado antes de vender.';
    }
    const match = /^ALTA\s+([^|]+)\|([^|]+)$/i.exec(text);
    const parsed = match ? details.safeParse({ verifiedSender: message.from, name: match[1], businessType: match[2] }) : null;
    if (!parsed?.success) return 'Antes de vender necesito el nombre y giro de tu negocio. Escribe ALTA Nombre del negocio | Giro (ejemplo: ALTA Tienda Lupita | Abarrotes).';
    const value = { ...parsed.data, expiresAt: now() + 15 * 60 * 1000 };
    const payload = Buffer.from(JSON.stringify(value)).toString('base64url');
    return `Nombre: ${value.name}\nGiro: ${value.businessType}\nRevisa tus datos. Para registrarlos responde CONFIRMAR ALTA ${payload}.${sign(payload)}\nVence en 15 minutos. Para cancelar responde CANCELAR ALTA.`;
  };
}
export function createSupabaseOnboarding(client: SupabaseClient, secret: string) {
  return createOnboarding({ async complete(input) {
    // Retry of the same confirmed registration must not overwrite an existing business.
    const existing = await findBusinessByWhatsApp(client, input.verifiedSender);
    if (existing?.onboarding_completed_at && existing.business_type) return;
    await completeBusinessOnboarding(client, input);
  } }, secret);
}
