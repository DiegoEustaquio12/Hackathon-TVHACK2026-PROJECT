import Link from "next/link";
import { Icon } from "./icon";
import styles from "./workspace.module.css";

export function Workspace({ active, mock, children }: { active: "chat" | "distributors"; mock: boolean; children: React.ReactNode }) {
  return <div className={styles.shell}>
    <aside className={styles.sidebar}>
      <Link className={styles.brand} href="/">Micro<span>AI</span></Link>
      <nav className={styles.nav} aria-label="Navegación principal">
        <Link href="/chat" aria-current={active === "chat" ? "page" : undefined}><Icon name="chat" /> Asistente</Link>
        <Link href="/distribuidores" aria-current={active === "distributors" ? "page" : undefined}><Icon name="orders" /> Distribuidores</Link>
      </nav>
      <div className={styles.sidebarFoot}><p>Tu comercio, al día.</p><p>MicroAI · Espacio de trabajo</p></div>
    </aside>
    <div className={styles.body}>
      <header className={styles.topbar}><p>{mock ? "Comercio de demostración" : "Espacio de trabajo"}</p>{mock && <span className={styles.badge}>Demo local</span>}</header>
      <main id="main-content" className={styles.content}>{children}</main>
    </div>
  </div>;
}
