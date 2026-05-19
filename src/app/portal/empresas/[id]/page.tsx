import dynamic from "next/dynamic";
import { PortalPageLoading } from "@/components/portal/portal-page-loading";

const CompanyDetailClient = dynamic(
  () => import("./company-detail-client").then((m) => m.CompanyDetailClient),
  { loading: () => <PortalPageLoading rows={8} /> }
);

export default function EmpresaPerfilPage() {
  return <CompanyDetailClient />;
}
