import { randomUUID } from "node:crypto";
import type { Actor, ChatHistory, ChatInput, DashboardQuery, HttpServices, Order, OrderStatus, SendMessageResponse, UpdateOrderInput } from "../../../contracts";
import { HttpError } from "../errors";

const nextStatuses: Record<OrderStatus, OrderStatus[]> = {
  pending: ["confirmed", "cancelled"], confirmed: ["dispatched", "cancelled"], dispatched: ["delivered"], delivered: [], cancelled: [],
};
const iso = () => new Date().toISOString();
type State = { touched: number; bytes: number; history: ChatHistory; orders: Order[]; replies: Map<string, { input: string; result: SendMessageResponse }> };
export interface MockServices extends HttpServices {
  restoreOrders(actor: Actor, orders: Order[]): void;
  snapshotOrders(actor: Actor): Order[];
}

function fixtures(): Order[] {
  const customers = ["Abarrotes La Esquina", "Mini Súper Los Pinos", "Tienda El Sol", "Abarrotes San Miguel", "Miscelánea Las Flores", "Mini Súper Central"];
  const statuses: OrderStatus[] = ["pending", "pending", "confirmed", "dispatched", "delivered", "cancelled"];
  return customers.map((customer, i) => ({ id: `PED-${1042 + i}`, customer, items_count: [12, 8, 24, 6, 18, 9][i],
    total_cents: [248050, 132000, 564080, 98750, 326400, 174500][i], status: statuses[i],
    created_at: new Date(Date.now() - (i + 1) * 3600000).toISOString(), updated_at: iso(), version: 1,
    allowed_statuses: [...nextStatuses[statuses[i]]],
  }));
}

export function createMockServices(): MockServices {
  const states = new Map<string, State>();
  function state(actor: Actor) {
    const now = Date.now();
    for (const [key, value] of states) if (now - value.touched > 6 * 3600000) states.delete(key);
    const key = `${actor.businessId}:${actor.sessionId}`;
    let value = states.get(key);
    if (!value) {
      if (states.size >= 100) states.delete(states.keys().next().value!);
      value = { touched: now, bytes: 0, history: { conversationId: randomUUID(), messages: [] }, orders: fixtures(), replies: new Map() };
      states.set(key, value);
    }
    value.touched = now;
    return value;
  }
  return {
    restoreOrders(actor, orders) {
      const current = state(actor);
      for (const incoming of orders) {
        const local = current.orders.find(o => o.id === incoming.id);
        if (local && incoming.version >= local.version) Object.assign(local, structuredClone(incoming));
      }
    },
    snapshotOrders(actor) { return structuredClone(state(actor).orders); },
    chat: {
      async history(actor) { return structuredClone(state(actor).history); },
      async send(actor, input: ChatInput) {
        const current = state(actor);
        const previous = current.replies.get(input.clientMessageId);
        if (previous) {
          if (previous.input !== JSON.stringify(input)) throw new HttpError(409, "MESSAGE_CONFLICT", "Ese identificador ya se usó con otro mensaje.");
          return structuredClone(previous.result);
        }
        const text = input.kind === "text"
          ? `Recibí tu mensaje: «${input.text.slice(0, 200)}». Esta respuesta es una simulación; no se registró ninguna operación. Puedes probar también una foto o un audio.`
          : input.kind === "image"
            ? `Recibí la imagen «${input.name}» con la descripción «${input.alt}». En esta demo confirmo la recepción, sin analizar la imagen ni registrar operaciones.`
            : `Recibí el audio «${input.name}». En esta demo confirmo la recepción, sin transcribir el archivo ni registrar operaciones.`;
        const result: SendMessageResponse = { conversationId: current.history.conversationId, messages: [
          { id: randomUUID(), role: "user", created_at: iso(), content: input },
          { id: randomUUID(), role: "assistant", created_at: iso(), content: { kind: "text", clientMessageId: randomUUID(), text } },
        ] };
        current.history.messages.push(...result.messages);
        current.history.messages = current.history.messages.slice(-6);
        current.replies.set(input.clientMessageId, { input: JSON.stringify(input), result });
        if (current.replies.size > 3) current.replies.delete(current.replies.keys().next().value!);
        current.bytes = JSON.stringify(current.history).length + [...current.replies.values()].reduce((sum, reply) => sum + reply.input.length, 0);
        // Bound retained media across sessions; this is a temporary demo store.
        let retainedBytes = [...states.values()].reduce((sum, value) => sum + value.bytes, 0);
        for (const [key, value] of [...states.entries()].sort((a, b) => a[1].touched - b[1].touched)) {
          if (retainedBytes <= 24 * 1024 * 1024) break;
          if (value === current) continue;
          retainedBytes -= value.bytes; states.delete(key);
        }
        return structuredClone(result);
      },
    },
    distributor: {
      async dashboard(actor, query: DashboardQuery) {
        const orders = state(actor).orders;
        return { business_name: "Distribuidora de demostración", updated_at: iso(), kpis: {
          orders_count: orders.length, pending_count: orders.filter(o => o.status === "pending").length,
          active_count: orders.filter(o => ["pending", "confirmed", "dispatched"].includes(o.status)).length,
          total_value_cents: orders.filter(o => o.status !== "cancelled").reduce((sum, o) => sum + o.total_cents, 0),
        }, orders: structuredClone(orders.filter(o => (!query.status || o.status === query.status) &&
          (!query.q || `${o.id} ${o.customer}`.toLocaleLowerCase("es-MX").includes(query.q.toLocaleLowerCase("es-MX"))))) };
      },
      async updateStatus(actor, orderId: string, input: UpdateOrderInput) {
        const order = state(actor).orders.find(o => o.id === orderId);
        if (!order) throw new HttpError(404, "ORDER_NOT_FOUND", "No encontramos ese pedido.");
        if (order.version !== input.expected_version) throw new HttpError(409, "ORDER_CONFLICT", "El pedido cambió. Actualiza el panel antes de intentarlo de nuevo.");
        if (!nextStatuses[order.status].includes(input.status)) throw new HttpError(409, "INVALID_STATUS_TRANSITION", "Ese cambio de estado no está disponible.");
        order.status = input.status; order.version++; order.updated_at = iso(); order.allowed_statuses = [...nextStatuses[input.status]];
        return structuredClone(order);
      },
    },
  };
}
