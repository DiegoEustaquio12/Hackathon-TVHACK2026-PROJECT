/** Domain contracts for R1. Kept separate from R3's existing web session Actor. */
export type Business = {
  id: string; name: string; whatsapp_id: string;
  business_type: string | null; onboarding_completed_at: string | null;
  time_zone?: string | null;
};
export type CatalogueProduct = {
  id: string; name: string; sale_price_cents: number; stock: number;
  aliases?: string[];
  unit_cost_cents?: number | null;
  product_type?: string | null;
  brand?: string | null;
  variant?: string | null;
  presentation?: string | null;
  content_amount?: number | null;
  content_unit?: 'ml' | 'g' | 'piece' | null;
  sale_unit?: 'piece' | 'kg' | 'g' | 'l' | 'ml' | null;
};
export type InterpretationRequest = {
  text?: string;
  media?: { kind: 'audio' | 'image'; storageKey: string; mimeType: string }[];
};
export type InterpretationResult = {
  intent: 'sale' | 'expense' | 'report' | 'unknown';
  confidence: number;
  data: {
    items?: { product_id: string; quantity: number }[];
    expense?: { concept: string; amount_cents: number };
    report?: 'sales_today';
  };
  needsConfirmation: boolean;
  clarification?: string;
  clarificationOptions?: { product_id: string; label: string }[];
};
