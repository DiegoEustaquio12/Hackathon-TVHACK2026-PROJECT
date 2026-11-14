import Link from "next/link";

export default function HomePage() {
  return <main><h1>MicroAI</h1><p>Administración simple para pequeños comercios.</p><nav><Link href="/chat">Registrar una operación</Link> · <Link href="/distribuidores">Distribuidores</Link></nav></main>;
}
