import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "MicroAI · Tu comercio, al día", template: "%s · MicroAI" },
  description: "Asistente multimodal y pedidos para pequeños comercios y distribuidores.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es-MX"><body><a className="skip-link" href="#main-content">Saltar al contenido</a>{children}</body></html>;
}
