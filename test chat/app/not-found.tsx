import Link from "next/link";
import ui from "@/components/workspace.module.css";
export default function NotFound() {
  return <main id="main-content" className={ui.content}><h1>No encontramos esta página</h1><p>Vuelve al asistente para continuar.</p><Link className={ui.button} href="/chat">Abrir asistente</Link></main>;
}
