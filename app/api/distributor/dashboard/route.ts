import { dashboardQuerySchema, dashboardSchema } from "@/src/contracts";
import { handle, parseInput, queryInput } from "@/src/modules/http/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return handle(request, dashboardSchema, async (actor, services) => services.distributor.dashboard(actor, parseInput(dashboardQuerySchema, queryInput(request))));
}
