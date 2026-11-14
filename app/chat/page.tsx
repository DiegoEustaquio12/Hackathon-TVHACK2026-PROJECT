import type { Metadata } from "next";
import { Chat } from "@/components/chat";
import { Workspace } from "@/components/workspace";
import { isMockMode } from "@/src/modules/http/session";

export const metadata: Metadata = { title: "Asistente" };
export const dynamic = "force-dynamic";
export default function ChatPage() {
  const mock = isMockMode();
  return <Workspace active="chat" mock={mock}><Chat mock={mock} /></Workspace>;
}
