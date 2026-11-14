import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "MicroAI", description: "Administración simple para pequeños comercios" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
