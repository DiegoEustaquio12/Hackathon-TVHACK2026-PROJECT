"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { channelLabels, createOrderSchema, deleteOrderResponseSchema, orderChannelSchema, orderSchema, type Order } from "@/src/contracts/distributor";
import { api, errorMessage, jsonRequest } from "./api-client";
import { currency, mxnToCents } from "./money";
import ui from "./workspace.module.css";
import styles from "./order-dialog.module.css";

function Dialog({ children, title, busy, close, confirm = false }: { children: ReactNode; title: string; busy: boolean; close: () => void; confirm?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const element = dialog.current!;
    element.showModal();
    if (confirm) element.querySelector<HTMLButtonElement>("[data-cancel]")?.focus();
    return () => { element.close(); (trigger?.isConnected ? trigger : document.getElementById("add-order"))?.focus(); };
  }, [confirm]);
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="order-dialog-title" aria-busy={busy} onCancel={event => { event.preventDefault(); if (!busy) close(); }}>
    <h2 id="order-dialog-title">{title}</h2>{children}
  </dialog>;
}

export function CreateOrderDialog({ close, saved }: { close: () => void; saved: (message: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const parsed = createOrderSchema.safeParse({ customer: values.get("customer"), channel: values.get("channel"),
      items_count: Number(values.get("items_count")), total_cents: mxnToCents(String(values.get("total"))) });
    const messages: Record<string, string> = {
      customer: "Escribe un cliente de 1 a 80 caracteres.", channel: "Selecciona un canal válido.",
      items_count: "Ingresa entre 1 y 10,000 artículos, sin decimales.", total_cents: "Ingresa de 0 a 999,999,999.00 MXN, con punto y hasta dos decimales.",
    };
    if (!parsed.success) {
      const errors = Object.fromEntries(parsed.error.issues.map(issue => [String(issue.path[0]), messages[String(issue.path[0])]]));
      setFields(errors);
      const first = String(parsed.error.issues[0].path[0]);
      form.querySelector<HTMLElement>(`[name="${first === "total_cents" ? "total" : first}"]`)?.focus();
      return;
    }
    setFields({}); setError(""); setBusy(true);
    try {
      const order = await api("/api/distributor/orders", orderSchema, jsonRequest("POST", parsed.data));
      await saved(`${order.id}: pedido agregado para ${order.customer}.`);
    } catch (e) { setError(errorMessage(e)); setBusy(false); }
  }
  const invalid = (key: string) => ({ "aria-invalid": Boolean(fields[key]), "aria-describedby": fields[key] ? `error-${key}` : undefined });
  return <Dialog title="Agregar pedido" busy={busy} close={close}>
    <p>Registra el pedido en pesos mexicanos. Comenzará como pendiente.</p>
    <form onSubmit={submit} noValidate className={styles.form}>
      <div className={ui.field}><label htmlFor="order-customer">Cliente</label><input id="order-customer" name="customer" maxLength={80} required disabled={busy} {...invalid("customer")} />{fields.customer && <small id="error-customer" className={styles.fieldError}>{fields.customer}</small>}</div>
      <div className={ui.field}><label htmlFor="order-channel">Canal</label><select id="order-channel" name="channel" disabled={busy} {...invalid("channel")}>{orderChannelSchema.options.map(value => <option key={value} value={value}>{channelLabels[value]}</option>)}</select></div>
      <div className={ui.field}><label htmlFor="order-items">Cantidad de artículos</label><input id="order-items" name="items_count" type="number" min="1" max="10000" step="1" defaultValue="1" required disabled={busy} {...invalid("items_count")} />{fields.items_count && <small id="error-items_count" className={styles.fieldError}>{fields.items_count}</small>}</div>
      <div className={ui.field}><label htmlFor="order-total">Monto total en MXN</label><input id="order-total" name="total" inputMode="decimal" placeholder="Ej. 1250.50" required disabled={busy} {...invalid("total_cents")} />{fields.total_cents && <small id="error-total_cents" className={styles.fieldError}>{fields.total_cents}</small>}</div>
      {error && <p role="alert" className={ui.error}>{error}</p>}
      <div className={styles.actions}><button type="button" className={ui.button} disabled={busy} onClick={close}>Cancelar</button><button type="submit" className={`${ui.button} ${ui.primary}`} disabled={busy}>{busy ? "Agregando…" : "Guardar pedido"}</button></div>
    </form>
  </Dialog>;
}

export function DeleteOrderDialog({ order, close, saved }: { order: Order; close: () => void; saved: (message: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function remove() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      await api(`/api/distributor/orders/${order.id}`, deleteOrderResponseSchema, jsonRequest("DELETE", { expected_version: order.version }));
      await saved(`${order.id}: pedido quitado. Indicadores actualizados.`);
    } catch (e) { setError(errorMessage(e)); setBusy(false); }
  }
  return <Dialog title={`Quitar pedido ${order.id}`} busy={busy} close={close} confirm>
    <p id="delete-description">Vas a quitar el pedido de <strong>{order.customer}</strong> por {currency(order.total_cents)} MXN. Se removerá del listado y de los indicadores. Esta acción no se puede deshacer.</p>
    {error && <p role="alert" className={ui.error}>{error}</p>}
    <div className={styles.actions}><button data-cancel type="button" className={ui.button} disabled={busy} onClick={close}>Cancelar</button><button type="button" aria-describedby="delete-description" className={`${ui.button} ${styles.danger}`} disabled={busy} onClick={() => void remove()}>{busy ? "Quitando…" : "Confirmar quitar pedido"}</button></div>
  </Dialog>;
}
