import { chatInputSchema, emptyQuerySchema, historySchema, sendMessageResponseSchema } from "@/src/contracts";
import { handle, parseInput, queryInput, readJson } from "@/src/modules/http/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return handle(request, historySchema, async (actor, services) => {
    parseInput(emptyQuerySchema, queryInput(request));
    return services.chat.history(actor);
  });
}
export async function POST(request: Request) {
  return handle(request, sendMessageResponseSchema, async (actor, services) => {
    parseInput(emptyQuerySchema, queryInput(request));
    return services.chat.send(actor, parseInput(chatInputSchema, await readJson(request)));
  }, 201);
}
