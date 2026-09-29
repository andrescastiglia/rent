import type { Metadata } from "next";
import { MercadoLibreCallback } from "@/components/integrations/MercadoLibreCallback";
export const metadata: Metadata = { robots: { index: false, follow: false } };
export default function MercadoLibreCallbackPage() {
  return <MercadoLibreCallback />;
}
