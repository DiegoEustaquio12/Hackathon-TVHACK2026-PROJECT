import { errorSchema } from "../../contracts/common";

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export function errorResponse(error: unknown): Response {
  const known = error instanceof HttpError;
  return Response.json(errorSchema.parse({
    code: known ? error.code : "INTERNAL_ERROR",
    message: known ? error.message : "No pudimos completar la solicitud. Intenta de nuevo.",
  }), { status: known ? error.status : 500, headers: { "Cache-Control": "no-store" } });
}
