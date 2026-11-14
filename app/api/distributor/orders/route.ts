import { createOrderSchema, emptyQuerySchema, orderSchema } from "@/src/contracts";
import { handle, parseInput, queryInput, readJson } from "@/src/modules/http/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  return handle(request, orderSchema, async (actor, services) => {
    parseInput(emptyQuerySchema, queryInput(request));
    return services.distributor.createOrder(actor, parseInput(createOrderSchema, await readJson(request)));
  }, 201);
}
