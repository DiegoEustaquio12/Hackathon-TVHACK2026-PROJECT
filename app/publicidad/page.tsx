import type { Metadata } from "next";
import { SupplierPlans } from "@/components/supplier-plans";
import { Workspace } from "@/components/workspace";
import { isMockMode } from "@/src/modules/http/session";

export const metadata: Metadata = { title: "Publicidad para proveedores" };
export const dynamic = "force-dynamic";
export default function AdvertisingPage() {
  const mock = isMockMode();
  return <Workspace active="advertising" mock={mock}><SupplierPlans mock={mock} /></Workspace>;
}
