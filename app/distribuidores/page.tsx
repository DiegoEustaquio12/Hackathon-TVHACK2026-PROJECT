import type { Metadata } from "next";
import { Dashboard } from "@/components/dashboard";
import { Workspace } from "@/components/workspace";
import { isMockMode } from "@/src/modules/http/session";

export const metadata: Metadata = { title: "Distribuidores" };
export const dynamic = "force-dynamic";
export default function DistributorsPage() {
  const mock = isMockMode();
  return <Workspace active="distributors" mock={mock}><Dashboard mock={mock} /></Workspace>;
}
