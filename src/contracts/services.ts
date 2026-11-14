import type { Actor } from "./common";
import type { ChatHistory, ChatInput, SendMessageResponse } from "./chat";
import type { CreateOrderInput, Dashboard, DashboardQuery, DeleteOrderInput, DeleteOrderResponse, Order, UpdateOrderInput } from "./distributor";
import type { ActivatePlanInput, PlanActivation } from "./plans";

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
  createOrder(actor: Actor, input: CreateOrderInput): Promise<Order>;
  deleteOrder(actor: Actor, orderId: string, input: DeleteOrderInput): Promise<DeleteOrderResponse>;
  activatePlan(actor: Actor, input: ActivatePlanInput): Promise<PlanActivation>;
}
export interface HttpServices { chat: ChatService; distributor: DistributorService }
