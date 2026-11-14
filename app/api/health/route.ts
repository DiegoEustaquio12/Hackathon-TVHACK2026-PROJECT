import { emptyQuerySchema, healthSchema } from "@/src/contracts";
import { handlePublic, parseInput, queryInput } from "@/src/modules/http/handler";
import { healthService } from "@/src/modules/http/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handlePublic(healthSchema, async () => {
    parseInput(emptyQuerySchema, queryInput(request));
    return healthService.check();
  });
}
