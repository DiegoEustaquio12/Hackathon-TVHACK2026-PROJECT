import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { createLocalChatService } from "../src/modules/http/local-chat";
import type { Actor, ChatInput } from "../src/contracts";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });
const actor: Actor = { businessId: "demo-business", userId: "demo-user", channel: "web", sessionId: "local-test" };
const input = (text: string): ChatInput => ({ kind: "text", text, clientMessageId: randomUUID() });
async function setup() { const directory = await mkdtemp(path.join(tmpdir(), "knectan-chat-")); directories.push(directory); return { directory, chat: createLocalChatService(directory) }; }
const response = (value: Awaited<ReturnType<ReturnType<typeof createLocalChatService>["send"]>>) => value.messages[1].content.text!;

describe("local fallback chat", () => {
  it("requires confirmation, persists sales and stock across restarts, isolates sessions", async () => {
    const { chat, directory } = await setup();
    expect(response(await chat.send(actor, input("Vendí 3 cocas y 2 panes")))).toContain("$80.00");
    expect(response(await chat.send(actor, input("ventas de hoy")))).toContain("Ventas: $0.00");
    const confirmation = input("confirmar");
    const confirmed = await chat.send(actor, confirmation);
    expect(response(confirmed)).toContain("Venta registrada");
    const restarted = createLocalChatService(directory);
    expect(await restarted.send(actor, confirmation)).toEqual(confirmed);
    expect(response(await restarted.send(actor, input("ventas de hoy")))).toContain("Ventas: $80.00 · 1 operaciones");
    expect(response(await restarted.send(actor, input("catálogo")))).toContain("97 disponibles");
    expect(response(await restarted.send({ ...actor, sessionId: "other" }, input("ventas de hoy")))).toContain("Ventas: $0.00");
  });
  it("cancels expenses, serializes concurrent confirmations, rejects reused ids and insufficient stock", async () => {
    const { chat } = await setup();
    await chat.send(actor, input("Gasté 50 en luz"));
    await chat.send(actor, input("cancelar"));
    expect(response(await chat.send(actor, input("confirmar")))).toContain("No hay una operación pendiente");
    await chat.send(actor, input("Gasté 50 en luz"));
    const results = await Promise.all([chat.send(actor, input("confirmar")), chat.send(actor, input("confirmar"))]);
    expect(results.map(response).filter(text => text.includes("Gasto registrado"))).toHaveLength(1);
    expect(response(await chat.send(actor, input("ventas de hoy")))).toContain("Gastos: $50.00");
    const reused = input("ayuda"); await chat.send(actor, reused);
    await expect(chat.send(actor, { ...reused, text: "otro mensaje" })).rejects.toThrow("Ese identificador");
    expect(response(await chat.send(actor, input("Vendí 101 cocas")))).toContain("existencia insuficiente");
  });
});
