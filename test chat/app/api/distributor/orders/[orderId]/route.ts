import { deleteOrderResponseSchema, deleteOrderSchema, emptyQuerySchema, orderParamsSchema } from "@/src/contracts";
import { handle, parseInput, queryInput, readJson } from "@/src/modules/http/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function DELETE(request: Request, context: { params: Promise<{ orderId: string }> }) {
  return handle(request, deleteOrderResponseSchema, async (actor, services) => {
    parseInput(emptyQuerySchema, queryInput(request));
    const { orderId } = parseInput(orderParamsSchema, await context.params);
    return services.distributor.deleteOrder(actor, orderId, parseInput(deleteOrderSchema, await readJson(request)));
  });
}
