/**
 * Catálogo de áreas configuráveis (perfil user). Admins ignoram sempre.
 * Ordem: rotas mais específicas primeiro (prefix match).
 */

export type PortalScreenAccessLevel = "read" | "edit";

export interface PortalScreenDef {
  key: string;
  /** Prefixo pathname (portal). */
  pathPrefix: string;
  label: string;
  /** Área apenas para administradores (role admin), independentemente de permissões. */
  adminOnly?: boolean;
}

/** Rotas públicas relativas ao prefixo `/portal`. */
export const PORTAL_SCREEN_DEFS: PortalScreenDef[] = [
  {
    key: "config_usuarios",
    pathPrefix: "/portal/configuracoes/usuarios",
    label: "Configurações — Usuários",
    adminOnly: true,
  },
  {
    key: "geracao_manutencao",
    pathPrefix: "/portal/acompanhamento/geracao",
    label: "Geração e manutenção (tarefas)",
  },
  {
    key: "empresas_importar",
    pathPrefix: "/portal/empresas/importar",
    label: "Empresas — Importar",
  },
  {
    key: "empresas_responsaveis",
    pathPrefix: "/portal/empresas/responsaveis",
    label: "Empresas — Responsáveis",
  },
  {
    key: "alvaras_importar",
    pathPrefix: "/portal/alvaras/importar",
    label: "Alvarás — Importar",
  },
  {
    key: "alvaras_etapas",
    pathPrefix: "/portal/alvaras/etapas",
    label: "Alvarás — Etapas",
  },
  {
    key: "alvaras_grupos",
    pathPrefix: "/portal/alvaras/grupos",
    label: "Alvarás — Grupos",
  },
  {
    key: "config_sync",
    pathPrefix: "/portal/configuracoes/sincronizacao",
    label: "Configurações — Sincronização",
  },
  {
    key: "dashboard",
    pathPrefix: "/portal/dashboard",
    label: "Dashboard",
  },
  {
    key: "acompanhamento",
    pathPrefix: "/portal/acompanhamento",
    label: "Acompanhamento",
  },
  {
    key: "empresas",
    pathPrefix: "/portal/empresas",
    label: "Empresas (lista)",
  },
  {
    key: "alvaras",
    pathPrefix: "/portal/alvaras",
    label: "Alvarás (tipos)",
  },
];
