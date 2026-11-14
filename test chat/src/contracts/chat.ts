import { z } from "zod";
import { timestampSchema } from "./common";

export const MAX_MEDIA_BYTES = 2 * 1024 * 1024;
export const MAX_REQUEST_BYTES = 3 * 1024 * 1024;
export const imageMimeTypes = ["image/jpeg", "image/png", "image/webp"] as const;
export const audioMimeTypes = ["audio/webm", "audio/ogg", "audio/mpeg", "audio/mp4", "audio/wav"] as const;

function dataUrlSchema(types: readonly string[]) {
  return z.string().max(Math.ceil(MAX_MEDIA_BYTES / 3) * 4 + 80).superRefine((value, ctx) => {
    const match = /^data:([\w/+.-]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
    if (!match || !types.includes(match[1]) || match[2].length % 4 !== 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Archivo o formato no válido." });
      return;
    }
    const size = match[2].length * 3 / 4 - (match[2].endsWith("==") ? 2 : match[2].endsWith("=") ? 1 : 0);
    if (size > MAX_MEDIA_BYTES) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "El archivo supera 2 MB." });
  });
}

const base = { clientMessageId: z.string().uuid() };
const caption = z.string().trim().max(2000).optional();
export const textInputSchema = z.object({ ...base, kind: z.literal("text"), text: z.string().trim().min(1).max(2000) }).strict();
export const imageInputSchema = z.object({
  ...base, kind: z.literal("image"), text: caption,
  name: z.string().trim().min(1).max(120), alt: z.string().trim().min(1).max(240),
  data_url: dataUrlSchema(imageMimeTypes),
}).strict();
export const audioInputSchema = z.object({
  ...base, kind: z.literal("audio"), text: caption,
  name: z.string().trim().min(1).max(120), data_url: dataUrlSchema(audioMimeTypes),
}).strict();
export const chatInputSchema = z.discriminatedUnion("kind", [textInputSchema, imageInputSchema, audioInputSchema]);
export const chatMessageSchema = z.object({
  id: z.string().uuid(), role: z.enum(["user", "assistant"]),
  created_at: timestampSchema, content: chatInputSchema,
}).strict();
export const historySchema = z.object({ conversationId: z.string().uuid(), messages: z.array(chatMessageSchema).max(60) }).strict();
export const sendMessageResponseSchema = z.object({
  conversationId: z.string().uuid(), messages: z.array(chatMessageSchema).length(2),
}).strict();
export type ChatInput = z.infer<typeof chatInputSchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type ChatHistory = z.infer<typeof historySchema>;
export type SendMessageResponse = z.infer<typeof sendMessageResponseSchema>;
