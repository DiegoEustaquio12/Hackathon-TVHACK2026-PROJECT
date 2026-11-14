import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Actor, ChatHistory, ChatInput, SendMessageResponse } from "../../contracts";
import type { ChatService } from "../../contracts/services";
import { interpretSaleMessage } from "../interpretation/parser";
import type { CatalogueProduct } from "../interpretation/types";
import { HttpError } from "./errors";

type Entry = { kind: "sale" | "expense"; cents: number; at: string; concept: string };
type Draft = { entry: Omit<Entry, "at">; items?: { product_id: string; quantity: number }[] };
type LocalState = { history: ChatHistory; catalogue: CatalogueProduct[]; entries: Entry[]; draft?: Draft; replies: { input: ChatInput; result: SendMessageResponse }[] };
const money = (cents: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(cents / 100);
const day = (date: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date(date));
const initial = (): LocalState => ({ history: { conversationId: randomUUID(), messages: [] }, entries: [], replies: [], catalogue: [
  { id: "local-coca", name: "Coca-Cola 600 ml", aliases: ["coca", "cocas"], sale_price_cents: 2000, stock: 100, sale_unit: "piece" },
  { id: "local-pan", name: "Pan dulce por pieza", aliases: ["pan", "panes"], sale_price_cents: 1000, stock: 100, sale_unit: "piece" },
] });
function reply(state: LocalState, input: ChatInput): string {
  if (input.kind !== "text") return input.kind === "image"
    ? `Recibí la imagen «${input.name}» con la descripción «${input.alt}». Queda guardada en este chat local. Para registrar una operación, escríbela en un mensaje; aquí no analizo imágenes.`
    : `Recibí el audio «${input.name}». Puedes reproducirlo en el chat. Este modo local no transcribe audios: escribe la operación para registrarla.`;
  const text = input.text.trim().toLocaleLowerCase("es-MX").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/^(confirmar|confirmo|si)$/.test(text)) {
    if (!state.draft) return "No hay una operación pendiente. Escribe una venta o un gasto para empezar.";
    const draft = state.draft;
    for (const item of draft.items ?? []) {
      const product = state.catalogue.find(p => p.id === item.product_id);
      if (!product || product.stock < item.quantity) { delete state.draft; return "Cambió la existencia. Escribe de nuevo la venta."; }
    }
    for (const item of draft.items ?? []) state.catalogue.find(p => p.id === item.product_id)!.stock -= item.quantity;
    state.entries.push({ ...draft.entry, at: new Date().toISOString() }); delete state.draft;
    return `${draft.entry.kind === "sale" ? "Venta registrada" : "Gasto registrado"} en este equipo: ${draft.entry.concept}. Total: ${money(draft.entry.cents)}.\nPuedes consultar «ventas de hoy».`;
  }
  if (/^(cancelar|cancela|no)$/.test(text)) { const exists = !!state.draft; delete state.draft; return exists ? "Operación cancelada. No se registró ningún movimiento." : "No hay una operación pendiente para cancelar."; }
  if (/^(catalogo|productos|ver catalogo)$/.test(text)) return `Catálogo local de prueba:\n${state.catalogue.map(p => `• ${p.name}: ${money(p.sale_price_cents)} · ${p.stock} disponibles`).join("\n")}\nEstos productos son independientes de tu base de producción.`;
  const result = interpretSaleMessage({ text: input.text }, state.catalogue);
  if (result.intent === "report") {
    const entries = state.entries.filter(e => day(e.at) === day(new Date().toISOString()));
    const sales = entries.filter(e => e.kind === "sale"); const expenses = entries.filter(e => e.kind === "expense");
    return `Hoy en tu registro local (Ciudad de México):\nVentas: ${money(sales.reduce((s, e) => s + e.cents, 0))} · ${sales.length} operaciones.\nGastos: ${money(expenses.reduce((s, e) => s + e.cents, 0))} · ${expenses.length} operaciones.\nSolo incluye movimientos confirmados en este chat.`;
  }
  if (result.clarification && result.intent !== "unknown") return result.clarification;
  let draft: Draft | undefined;
  if (result.data.expense) draft = { entry: { kind: "expense", cents: result.data.expense.amount_cents, concept: result.data.expense.concept } };
  if (result.data.items) {
    const lines = result.data.items.map(item => { const p = state.catalogue.find(p => p.id === item.product_id)!; return { label: `${item.quantity} × ${p.name}`, cents: Math.round(item.quantity * p.sale_price_cents) }; });
    draft = { items: result.data.items, entry: { kind: "sale", cents: lines.reduce((sum, l) => sum + l.cents, 0), concept: lines.map(l => l.label).join(", ") } };
  }
  if (draft) { state.draft = draft; return `¿Registro ${draft.entry.kind === "sale" ? "esta venta" : "este gasto"}?\n${draft.entry.concept}\nTotal: ${money(draft.entry.cents)}\n\nEscribe «confirmar» para guardar o «cancelar».${"\nSe guardará solo en este equipo."}`; }
  return "Hola, soy Knectan. Aquí puedes llevar un registro local sin WhatsApp.\n\nPrueba con:\n• Vendí 3 cocas y 2 panes\n• Gasté 50 en luz\n• Ventas de hoy\n• Catálogo\n\nTe pediré confirmar antes de registrar una venta o un gasto. Fotos y audios se guardan sin análisis automático.";
}

/** Single-machine fallback. Explicitly enabled, isolated from production and WhatsApp. */
export function createLocalChatService(directory = process.env.LOCAL_CHAT_DIR || path.join(process.cwd(), ".local-chat")): ChatService {
  const queues = new Map<string, Promise<unknown>>();
  function run<T>(actor: Actor, action: (state: LocalState) => T, save: boolean): Promise<T> {
    const key = createHash("sha256").update(`${actor.businessId}:${actor.sessionId}`).digest("hex");
    const operation = (queues.get(key) ?? Promise.resolve()).catch(() => {}).then(async () => {
      const file = path.join(directory, `${key}.json`);
      let state: LocalState;
      try { state = JSON.parse(await readFile(file, "utf8")); }
      catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; state = initial(); }
      const result = action(state);
      if (save) {
        await mkdir(directory, { recursive: true, mode: 0o700 });
        const temporary = `${file}.${randomUUID()}.tmp`;
        await writeFile(temporary, JSON.stringify(state), { mode: 0o600 }); await rename(temporary, file);
      }
      return structuredClone(result);
    });
    queues.set(key, operation);
    void operation.finally(() => { if (queues.get(key) === operation) queues.delete(key); }).catch(() => {});
    return operation;
  }
  return {
    history: actor => run(actor, state => state.history, true),
    send: (actor, input) => run(actor, state => {
      const previous = state.replies.find(r => r.input.clientMessageId === input.clientMessageId);
      if (previous) { if (JSON.stringify(previous.input) !== JSON.stringify(input)) throw new HttpError(409, "MESSAGE_CONFLICT", "Ese identificador ya se usó con otro mensaje."); return previous.result; }
      const response = reply(state, input); const at = new Date().toISOString();
      const result: SendMessageResponse = { conversationId: state.history.conversationId, messages: [
        { id: randomUUID(), role: "user", created_at: at, content: input },
        { id: randomUUID(), role: "assistant", created_at: at, content: { kind: "text", text: response, clientMessageId: randomUUID() } },
      ] };
      state.history.messages.push(...result.messages); state.history.messages = state.history.messages.slice(-20);
      state.replies.push({ input, result }); state.replies = state.replies.slice(-10);
      return result;
    }, true),
  };
}
