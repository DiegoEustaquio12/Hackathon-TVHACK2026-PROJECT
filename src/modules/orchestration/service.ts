import { createSupabaseAccounting } from './accounting';
import { createChoices } from './choices';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseProcessingStore } from '../messaging/supabase-processing';
import { createConversation } from './conversation';
import { createConversationRepositories } from './repositories';
import { createSupabaseOnboarding } from '../auth/onboarding';
import { createInfobipWebhook } from '../messaging/webhook';
import { basicWebhookAuthenticator, InfobipMessagingProvider } from '../messaging/infobip';
import { createDurableProcessing, type ProcessingStore } from '../messaging/processing';
import { createAudioPreparation } from '../interpretation/audio';
import { createReceiptPreparation, type ReceiptExtractor } from '../interpretation/receipts';
import { createReceiptReview } from './receipts';
import type { InboundMessage, WhatsAppActor } from '../messaging/contracts';
import type { AudioTranscriber, TrustedAudioReader } from '../media/audio';
/** Server-only composition. Requires durable processing; never falls back to a mock. */
export function createRole2Service(config: {
  client: SupabaseClient; processingStore?: ProcessingStore;
  baseUrl: string; apiKey: string; sender: string;
  webhookUsername: string; webhookPassword: string; onboardingSecret: string;
  ingestMedia?:(actor:WhatsAppActor,message:InboundMessage)=>Promise<InboundMessage>;
  receipts?: {reader:TrustedAudioReader;extractor:ReceiptExtractor};
  audio?: { reader: TrustedAudioReader; transcriber: AudioTranscriber };
}) {
  const conversation = createConversation({ ...createConversationRepositories(config.client),
    ingestMedia:config.ingestMedia,
    receipts:config.receipts?createReceiptReview(config.onboardingSecret,createReceiptPreparation(config.receipts)):undefined,
    prepareAudio: config.audio ? createAudioPreparation(config.audio) : undefined,
    accounting: createSupabaseAccounting(config.client, config.onboardingSecret), choices: createChoices(config.onboardingSecret),
    onboard: createSupabaseOnboarding(config.client, config.onboardingSecret) });
  return createInfobipWebhook({
    authenticate: basicWebhookAuthenticator(config.webhookUsername, config.webhookPassword),
    recipient: config.sender, conversation,
    provider: new InfobipMessagingProvider(config), processing: createDurableProcessing(config.processingStore ?? createSupabaseProcessingStore(config.client)),
  });
}
