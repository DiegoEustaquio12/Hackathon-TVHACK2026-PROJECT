"use client";

import { useState } from "react";
import { planActivationSchema, recommendPlan, supplierPlans, type SupplierPlan } from "@/src/contracts/plans";
import { api, errorMessage, jsonRequest } from "./api-client";
import { currency } from "./money";
import ui from "./workspace.module.css";
import styles from "./supplier-plans.module.css";

export function SupplierPlans({ mock }: { mock: boolean }) {
  const [catalogue, setCatalogue] = useState(50); const [volume, setVolume] = useState(100);
  const [busy, setBusy] = useState<SupplierPlan["id"] | null>(null);
  const [active, setActive] = useState<SupplierPlan["id"] | null>(null);
  const [feedback, setFeedback] = useState(""); const [error, setError] = useState("");
  const recommended = recommendPlan(catalogue, volume);
  async function activate(plan: SupplierPlan) {
    if (busy) return;
    setBusy(plan.id); setFeedback(""); setError("");
    try {
      const result = await api("/api/distributor/plans", planActivationSchema, jsonRequest("POST", { planId: plan.id }));
      setActive(result.planId);
      setFeedback(`${plan.name}: plan activado en modo mock por ${currency(result.monthly_price_cents)} MXN al mes. No se realizó ningún cobro ni se publicaron anuncios.`);
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(null); }
  }
  return <>
    <div className={ui.heading}><div><h1>Publicidad y visibilidad para proveedores</h1><p>Elige dónde dar a conocer tu catálogo a los comercios que buscan tus productos.</p></div></div>
    <p className={ui.notice}>Precios y beneficios ilustrativos de la demo. La activación simula una solicitud: no cobra, publica anuncios ni modifica las recomendaciones del chat. Los espacios de pago se identificarían como patrocinados.</p>
    <section className={styles.guide} aria-labelledby="guide-title">
      <div><h2 id="guide-title">Encuentra tu plan</h2><p>Usamos el mayor alcance que requiera tu catálogo o tu volumen mensual.</p></div>
      <div className={ui.field}><label htmlFor="catalogue-size">Tamaño del catálogo</label><select id="catalogue-size" value={catalogue} onChange={e => setCatalogue(Number(e.target.value))}><option value="50">Hasta 50 productos</option><option value="250">De 51 a 250 productos</option><option value="251">Más de 250 productos</option></select></div>
      <div className={ui.field}><label htmlFor="monthly-volume">Pedidos mensuales</label><select id="monthly-volume" value={volume} onChange={e => setVolume(Number(e.target.value))}><option value="100">Hasta 100 pedidos</option><option value="500">De 101 a 500 pedidos</option><option value="501">Más de 500 pedidos</option></select></div>
      <p className={styles.recommendation} role="status">Te recomendamos <strong>{supplierPlans.find(p => p.id === recommended)!.name}</strong>.</p>
    </section>
    <section aria-labelledby="plans-title" className={styles.comparison}>
      <h2 id="plans-title">Compara los planes</h2>
      <div className={styles.plans}>{supplierPlans.map(plan => <article key={plan.id} className={styles.plan} data-recommended={recommended === plan.id} aria-labelledby={`plan-${plan.id}`}>
        <div className={styles.planHeading}><h3 id={`plan-${plan.id}`}>{plan.name}</h3><span>{recommended === plan.id ? "Recomendado para ti" : "Plan de visibilidad"}</span></div>
        <p className={styles.price}>{currency(plan.monthly_price_cents)} <span>MXN / mes</span></p>
        <dl><div><dt>Alcance</dt><dd>{plan.reach}</dd></div><div><dt>Posición en el chat</dt><dd>{plan.positioning}</dd></div><div><dt>Analíticas</dt><dd>{plan.analytics}</dd></div></dl>
        <ul>{plan.benefits.map(benefit => <li key={benefit}>{benefit}</li>)}</ul>
        <button type="button" className={`${ui.button} ${recommended === plan.id ? ui.primary : ""}`} disabled={!mock || Boolean(busy) || active === plan.id} onClick={() => void activate(plan)} aria-label={`Activar ${plan.name} en demo`}>{busy === plan.id ? "Activando…" : active === plan.id ? "Activo en esta vista" : "Activar plan en demo"}</button>
      </article>)}</div>
    </section>
    {error && <p role="alert" className={ui.error}>{error}</p>}
    <p role="status" className={styles.feedback}>{feedback}</p>
    {!mock && <p className={ui.notice}>La activación de demostración está disponible únicamente con MOCK_MODE=true.</p>}
  </>;
}
