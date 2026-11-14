/** Domain contracts for R1. Kept separate from R3's existing web session Actor. */
export type Business = {
  id: string; name: string; whatsapp_id: string;
  business_type: string | null; onboarding_completed_at: string | null;
};
export type CatalogueProduct = {
  id: string; name: string; sale_price_cents: number; stock: number;
  aliases?: string[];
};
export type InterpretationRequest = {
  text?: string;
  media?: { kind: 'audio' | 'image'; storageKey: string; mimeType: string }[];
};
export type InterpretationResult = {
  intent: 'sale' | 'unknown';
  confidence: number;
  data: { items?: { product_id: string; quantity: number }[] };
  needsConfirmation: boolean;
  clarification?: string;
};
