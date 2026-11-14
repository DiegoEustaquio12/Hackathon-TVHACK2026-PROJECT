"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { dashboardSchema, orderSchema, orderStatusSchema, statusLabels, type Dashboard as DashboardData, type DashboardQuery, type Order, type OrderStatus } from "@/src/contracts/distributor";
import { api, errorMessage, jsonRequest } from "./api-client";
import { Icon } from "./icon";
import Link from "next/link";
import { BrandLogo } from "./brand-logo";
import { CreateOrderDialog, DeleteOrderDialog } from "./order-dialog";
import { currency } from "./money";
import { channelLabels } from "@/src/contracts/distributor";
import ui from "./workspace.module.css";
import styles from "./dashboard.module.css";

const date = (iso: string) => new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export function Dashboard({ mock }: { mock: boolean }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState("");
  const [q, setQ] = useState(""); const [status, setStatus] = useState<OrderStatus | "">("");
  const [error, setError] = useState(""); const [feedback, setFeedback] = useState("");
  const [dialog, setDialog] = useState<"create" | Order | null>(null);
  const applied = useRef<DashboardQuery>({}); const sequence = useRef(0);
  const load = useCallback(async () => {
    const current = ++sequence.current; setLoading(true); setError("");
    const params = new URLSearchParams();
    if (applied.current.q) params.set("q", applied.current.q);
    if (applied.current.status) params.set("status", applied.current.status);
    try {
      const result = await api(`/api/distributor/dashboard${params.size ? `?${params}` : ""}`, dashboardSchema);
      if (current === sequence.current) setData(result);
    } catch (e) { if (current === sequence.current) setError(errorMessage(e)); }
    finally { if (current === sequence.current) setLoading(false); }
  }, []);
  useEffect(() => {
    void load();
    const requestSequence = sequence;
    return () => { requestSequence.current++; };
  }, [load]);
  function filter(event: FormEvent) {
    event.preventDefault(); applied.current = { q: q.trim() || undefined, status: status || undefined }; setFeedback(""); void load();
  }
  async function update(order: Order, next: OrderStatus) {
    setSaving(order.id); setError(""); setFeedback("");
    try {
      await api(`/api/distributor/orders/${order.id}/status`, orderSchema, jsonRequest("PATCH", { status: next, expected_version: order.version }));
      setFeedback(`${order.id}: estado actualizado a ${statusLabels[next].toLocaleLowerCase("es-MX")}.`);
      await load();
    } catch (e) { setError(errorMessage(e)); }
    finally { setSaving(""); }
  }
  async function saved(message: string) {
    if (dialog === "create") { applied.current = {}; setQ(""); setStatus(""); }
    setDialog(null); setFeedback(message);
    await load();
  }
  return <>
    <div className={ui.heading}><div className={styles.panelBrand}><BrandLogo compact /><div><h1>Panel de distribuidores</h1><p>Revisa tus pedidos y acompaña cada entrega.</p></div></div><button type="button" className={ui.button} disabled={loading || Boolean(saving)} onClick={() => void load()}><Icon name="refresh" />{loading ? "Actualizando…" : "Actualizar panel"}</button></div>
    <div className={styles.promotion}><div><h2>Publicidad y visibilidad para proveedores</h2><p>Compara tres planes y encuentra el alcance adecuado para tu catálogo.</p></div><Link className={ui.button} href="/publicidad">Explorar planes</Link></div>
    {error && <div className={ui.error} role="alert">{error} <span>Usa «Actualizar panel» para volver a cargar los datos.</span></div>}
    <p className={styles.feedback} role="status" aria-live="polite">{feedback}</p>
    {loading && !data ? <div className={ui.loading} role="status" aria-label="Cargando panel"><p>Cargando indicadores y pedidos…</p><div className={ui.skeleton} /><div className={ui.skeleton} /><div className={ui.skeleton} /></div>
      : data && <div aria-busy={loading}>
        <dl className={styles.kpis} aria-label="Indicadores de todos los pedidos">
          <div className={styles.kpi}><dt>Valor de pedidos</dt><dd>{currency(data.kpis.total_value_cents)}<small>MXN · Excluye cancelados</small></dd></div>
          <div className={styles.kpi}><dt>Pedidos totales</dt><dd>{data.kpis.orders_count}<small>{mock ? "En esta demostración" : "En tu comercio"}</small></dd></div>
          <div className={styles.kpi}><dt>Por confirmar</dt><dd>{data.kpis.pending_count}<small>Pendientes de revisión</small></dd></div>
          <div className={styles.kpi}><dt>Pedidos activos</dt><dd>{data.kpis.active_count}<small>Aún sin entregar</small></dd></div>
        </dl>
        <section className={styles.orders} aria-labelledby="orders-title">
          <div className={styles.ordersHeading}><div><h2 id="orders-title">Pedidos de comercios</h2><p>{data.orders.length} {data.orders.length === 1 ? "pedido" : "pedidos"} en la vista</p></div><button id="add-order" type="button" className={`${ui.button} ${ui.primary}`} disabled={loading || Boolean(saving)} onClick={() => setDialog("create")}>Agregar pedido</button></div>
          <form className={styles.filters} onSubmit={filter}>
            <div className={ui.field}><label htmlFor="search">Buscar comercio o pedido</label><input id="search" type="search" maxLength={80} value={q} onChange={e => setQ(e.target.value)} placeholder="Nombre del comercio o PED-1042" /></div>
            <div className={ui.field}><label htmlFor="filter-status">Estado del pedido</label><select id="filter-status" value={status} onChange={e => setStatus(e.target.value as OrderStatus | "")}><option value="">Todos los estados</option>{orderStatusSchema.options.map(value => <option value={value} key={value}>{statusLabels[value]}</option>)}</select></div>
            <button type="submit" className={ui.button} disabled={loading || Boolean(saving)}>Filtrar pedidos</button>
          </form>
          {loading && <p className={ui.notice} role="status">Actualizando pedidos…</p>}
          {data.orders.length === 0 ? <div className={ui.empty}><h3>No hay pedidos con estos filtros</h3><p>Prueba otro nombre o selecciona todos los estados.</p><button className={ui.button} type="button" onClick={() => { setQ(""); setStatus(""); applied.current = {}; void load(); }}>Limpiar filtros</button></div>
            : <div className={styles.tableWrap} role="region" aria-label="Tabla de pedidos, desplazable horizontalmente" tabIndex={0}><table className={styles.table}>
              <caption className="sr-only">Pedidos de comercios con importes en pesos mexicanos y acciones para cambiar su estado</caption>
              <thead><tr><th scope="col">Pedido</th><th scope="col">Comercio</th><th scope="col">Total MXN</th><th scope="col">Estado</th><th scope="col">Siguiente paso</th></tr></thead>
              <tbody>{data.orders.map(order => <tr key={order.id}><td><strong>{order.id}</strong><small><time dateTime={order.created_at}>{date(order.created_at)}</time></small></td><td>{order.customer}<small>{order.items_count} artículos · {channelLabels[order.channel]}</small></td><td className={styles.money}>{currency(order.total_cents)}</td><td><span className={styles.status} data-status={order.status}>{statusLabels[order.status]}</span></td><td><div className={styles.rowActions}>{order.allowed_statuses.length ? <OrderAction key={`${order.id}:${order.version}`} order={order} disabled={loading || Boolean(saving)} saving={saving === order.id} update={update} /> : <span className={ui.notice}>Finalizado</span>}<button className={`${ui.button} ${styles.remove}`} type="button" disabled={loading || Boolean(saving)} aria-label={`Quitar pedido ${order.id}`} onClick={() => setDialog(order)}>Quitar pedido</button></div></td></tr>)}</tbody>
            </table></div>}
          <p className={styles.footer}>Actualizado {date(data.updated_at)}. Los indicadores muestran todos los pedidos, aunque apliques filtros.</p>
        </section>
        {mock && <p className={ui.notice}>Datos ficticios para explorar el panel. Los cambios son temporales y se limitan a tu sesión.</p>}
      </div>}
    {dialog === "create" && <CreateOrderDialog close={() => setDialog(null)} saved={saved} />}
    {dialog && dialog !== "create" && <DeleteOrderDialog order={dialog} close={() => setDialog(null)} saved={saved} />}
  </>;
}
function OrderAction({ order, disabled, saving, update }: { order: Order; disabled: boolean; saving: boolean; update: (order: Order, status: OrderStatus) => Promise<void> }) {
  const [next, setNext] = useState<OrderStatus>(order.allowed_statuses[0]);
  return <form className={styles.change} onSubmit={e => { e.preventDefault(); void update(order, next); }}><label className="sr-only" htmlFor={`status-${order.id}`}>Nuevo estado de {order.id}</label><select id={`status-${order.id}`} value={next} disabled={disabled} onChange={e => setNext(e.target.value as OrderStatus)}>{order.allowed_statuses.map(value => <option value={value} key={value}>{statusLabels[value]}</option>)}</select><button className={ui.button} disabled={disabled} type="submit" aria-label={`Guardar estado de ${order.id}`}>{saving ? "Guardando…" : "Guardar"}</button></form>;
}
