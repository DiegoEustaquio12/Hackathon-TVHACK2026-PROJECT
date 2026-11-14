import { activatePlanSchema, emptyQuerySchema, planActivationSchema } from "@/src/contracts";
import { handle, parseInput, queryInput, readJson } from "@/src/modules/http/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  return handle(request, planActivationSchema, async (actor, services) => {
    parseInput(emptyQuerySchema, queryInput(request));
    return services.distributor.activatePlan(actor, parseInput(activatePlanSchema, await readJson(request)));
  }, 201);
}
