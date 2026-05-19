"use client";

import { PortalRouteError } from "@/components/portal/portal-route-error";

export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <PortalRouteError error={error} reset={reset} />;
}
