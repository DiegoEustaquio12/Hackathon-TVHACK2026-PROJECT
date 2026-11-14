import { emptyQuerySchema, orderParamsSchema, orderSchema, updateOrderSchema } from "@/src/contracts";
import { handle, parseInput, queryInput, readJson } from "@/src/modules/http/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function PATCH(request: Request, context: { params: Promise<{ orderId: string }> }) {
  return handle(request, orderSchema, async (actor, services) => {
    parseInput(emptyQuerySchema, queryInput(request));
    const { orderId } = parseInput(orderParamsSchema, await context.params);
    return services.distributor.updateStatus(actor, orderId, parseInput(updateOrderSchema, await readJson(request)));
  });
}
