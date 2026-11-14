import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseProcessingStore } from '../messaging/supabase-processing';
import { createConversation } from './conversation';
import { createConversationRepositories } from './repositories';
import { createSupabaseOnboarding } from '../auth/onboarding';
import { createInfobipWebhook } from '../messaging/webhook';
import { basicWebhookAuthenticator, InfobipMessagingProvider } from '../messaging/infobip';
import { createDurableProcessing, type ProcessingStore } from '../messaging/processing';
/** Server-only composition. Requires durable processing; never falls back to a mock. */
export function createRole2Service(config: {
  client: SupabaseClient; processingStore?: ProcessingStore;
  baseUrl: string; apiKey: string; sender: string;
  webhookUsername: string; webhookPassword: string; onboardingSecret: string;
}) {
  const conversation = createConversation({ ...createConversationRepositories(config.client),
    onboard: createSupabaseOnboarding(config.client, config.onboardingSecret) });
  return createInfobipWebhook({
    authenticate: basicWebhookAuthenticator(config.webhookUsername, config.webhookPassword),
    recipient: config.sender, conversation,
    provider: new InfobipMessagingProvider(config), processing: createDurableProcessing(config.processingStore ?? createSupabaseProcessingStore(config.client)),
  });
}
