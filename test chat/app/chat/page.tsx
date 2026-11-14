import type { Metadata } from "next";
import { Chat } from "@/components/chat";
import { isMockMode } from "@/src/modules/http/session";

export const metadata: Metadata = { title: "Chat Knectan" };
export const dynamic = "force-dynamic";
export default function ChatPage() {
  return <Chat mock={isMockMode()} local={isMockMode() && process.env.LOCAL_CHAT_MODE === "true"} />;
}
