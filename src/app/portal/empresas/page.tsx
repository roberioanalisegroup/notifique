import dynamic from "next/dynamic";
import { PortalPageLoading } from "@/components/portal/portal-page-loading";

const EmpresasListClient = dynamic(
  () =>
    import("@/components/empresas/empresas-list-client").then((m) => ({
      default: m.EmpresasListClient,
    })),
  { loading: () => <PortalPageLoading /> }
);

export default function EmpresasPage() {
  return <EmpresasListClient variant="ativas" />;
}
