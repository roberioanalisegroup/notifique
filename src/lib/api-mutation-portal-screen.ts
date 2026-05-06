/**
 * Associações aproximadas API → área do portal para exigir "edit".
 * Mutations não listadas ficam só com RLS/rotas próprias (comportamento anterior).
 */

export function portalScreenRequiredForMutation(pathname: string): string | null {
  const p = pathname.split("?")[0] ?? pathname;
  if (p.startsWith("/api/companies/import")) return "empresas_importar";
  if (p.startsWith("/api/companies/export")) return "empresas";
  if (p.startsWith("/api/companies/responsible-batch")) return "empresas_responsaveis";
  if (p.startsWith("/api/companies/sync-all")) return "config_sync";
  if (p.startsWith("/api/companies")) return "empresas";
  if (p.startsWith("/api/company-alvaras")) return "acompanhamento";
  if (p.startsWith("/api/alvara-tasks")) return "acompanhamento";
  if (p.startsWith("/api/alvara-groups")) return "alvaras_grupos";
  if (p.startsWith("/api/alvara-tasks/admin")) return "geracao_manutencao";
  if (p.startsWith("/api/alvaras/import")) return "alvaras_importar";
  if (p.startsWith("/api/alvaras")) return "alvaras";
  if (p.startsWith("/api/sync-config") || p.startsWith("/api/sync-logs")) return "config_sync";
  return null;
}
