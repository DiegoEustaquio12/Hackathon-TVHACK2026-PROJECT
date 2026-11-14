import type { Actor } from "./common";
import type { ChatHistory, ChatInput, SendMessageResponse } from "./chat";
import type { Dashboard, DashboardQuery, Order, UpdateOrderInput } from "./distributor";

/** R2 provides a verified identity; HTTP never derives tenancy from client input. */
export interface SessionVerifier { verify(request: Request): Promise<Actor | null> }
/** R2 orchestration can replace this adapter without changing HTTP or UI. */
export interface ChatService {
  history(actor: Actor): Promise<ChatHistory>;
  send(actor: Actor, input: ChatInput): Promise<SendMessageResponse>;
}
/** R1/R2 supply domain services. Monetary fields are integer MXN cents. */
export interface DistributorService {
  dashboard(actor: Actor, query: DashboardQuery): Promise<Dashboard>;
  updateStatus(actor: Actor, orderId: string, input: UpdateOrderInput): Promise<Order>;
}
export interface HttpServices { chat: ChatService; distributor: DistributorService }
