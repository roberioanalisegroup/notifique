import clsx, { type ClassValue } from "clsx";
import type { CompanyCadastroTipo } from "@/types";

export function onlyDigits(s: string): string {
  return s.replace(/\D/g, "");
}

export function cleanCNPJ(cnpj: string): string {
  return cnpj.replace(/\D/g, "").slice(0, 14);
}

export function formatCNPJ(cnpj: string): string {
  const d = cleanCNPJ(cnpj);
  if (d.length !== 14) return cnpj;
  return d.replace(
    /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
    "$1.$2.$3/$4-$5"
  );
}

export function formatCPF(cpf: string): string {
  const d = onlyDigits(cpf).slice(0, 11);
  if (d.length !== 11) return cpf;
  return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
}

/** Validação clássica de CPF (dígitos verificadores). */
export function isValidCPF(digits: string): boolean {
  const d = onlyDigits(digits);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += parseInt(d[i]!, 10) * (10 - i);
  let r = (s * 10) % 11;
  if (r === 10) r = 0;
  if (r !== parseInt(d[9]!, 10)) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += parseInt(d[i]!, 10) * (11 - i);
  r = (s * 10) % 11;
  if (r === 10) r = 0;
  return r === parseInt(d[10]!, 10);
}

export function normalizeDocumentoForTipo(
  tipo: CompanyCadastroTipo,
  raw: string
): { ok: true; value: string } | { ok: false; message: string } {
  const n = onlyDigits(raw);
  switch (tipo) {
    case "cnpj":
    case "mei":
      if (n.length !== 14) return { ok: false, message: "Informe 14 dígitos (CNPJ)." };
      return { ok: true, value: n };
    case "caepf":
      if (n.length !== 14) return { ok: false, message: "CAEPF deve ter 14 dígitos." };
      return { ok: true, value: n };
    case "cpf":
      if (n.length !== 11) return { ok: false, message: "CPF deve ter 11 dígitos." };
      if (!isValidCPF(n)) return { ok: false, message: "CPF inválido (dígitos verificadores)." };
      return { ok: true, value: n };
    case "outros":
      if (n.length < 4) return { ok: false, message: "Informe ao menos 4 dígitos no identificador." };
      if (n.length > 20) return { ok: false, message: "Identificador muito longo (máx. 20 dígitos)." };
      return { ok: true, value: n };
    default:
      return { ok: false, message: "Tipo inválido." };
  }
}

export function canConsultarBrasilApiCnpj(
  tipo: CompanyCadastroTipo,
  consultaLigada: boolean
): boolean {
  if (!consultaLigada) return false;
  return tipo === "cnpj" || tipo === "mei";
}

export function formatCompanyDocumento(
  tipo: CompanyCadastroTipo,
  numeroDocumento: string,
  cnpj: string | null | undefined
): string {
  const n = numeroDocumento || onlyDigits(String(cnpj ?? ""));
  if (!n) return "—";
  if (tipo === "cpf") return formatCPF(n);
  if (n.length === 14) return formatCNPJ(n);
  return n;
}

export function cadastroTipoLabel(tipo: CompanyCadastroTipo): string {
  const m: Record<CompanyCadastroTipo, string> = {
    cnpj: "CNPJ",
    mei: "MEI (CNPJ do MEI)",
    caepf: "CAEPF",
    cpf: "CPF (pessoa física / produtor)",
    outros: "Outro identificador",
  };
  return m[tipo] ?? tipo;
}

export function formatDate(
  date: string | Date | null | undefined,
  options?: { empty?: string; includeTime?: boolean }
): string {
  if (date == null) return options?.empty ?? "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return options?.empty ?? "—";
  const dt = d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  if (options?.includeTime) {
    const tm = d.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${dt} às ${tm}`;
  }
  return dt;
}

/** Converte ISO `yyyy-mm-dd` para texto **dd/mm/aaaa** (entrada manual pt-BR). */
export function formatIsoDateParaBR(iso: string | null | undefined): string {
  if (!iso || typeof iso !== "string") return "";
  const part = iso.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(part)) return "";
  const [y, m, d] = part.split("-");
  return `${d}/${m}/${y}`;
}

/** Interpreta **dd/mm/aaaa** em data-only ISO `yyyy-mm-dd` ou `null` se vazio. */
export function parseDataBRParaIso(s: string): string | null {
  const t = s.trim();
  if (t === "") return null;
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100) return null;
  const dt = new Date(year, month - 1, day);
  if (dt.getFullYear() !== year || dt.getMonth() !== month - 1 || dt.getDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Máscara dd/mm/aaaa enquanto digita (apenas dígitos, no máx. 8). */
export function maskDataBRInput(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

export function formatCurrency(
  value: number | null | undefined,
  options?: { empty?: string }
): string {
  if (value == null || Number.isNaN(value)) return options?.empty ?? "—";
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function sanitizeText(text: string | null | undefined): string {
  if (text == null) return "";
  // Remove tags HTML para evitar XSS básico
  return text.replace(/<[^>]*>?/gm, "").trim();
}

export function cn(...classes: ClassValue[]) {
  return clsx(classes);
}

import type { AlvaraTask, CompanyAlvara, Alvara } from "@/types";

type TaskRowForStatus = AlvaraTask & {
  company_alvaras: (CompanyAlvara & {
    alvaras: (Alvara & { alvara_groups: any }) | null;
  }) | null;
};

export function getTaskStatusMeta(
  task: TaskRowForStatus | null | undefined,
  hoje: string,
  lane?: string
): { className: string; text: string } {
  if (!task) {
    return { className: "", text: "Sem validade no vínculo" };
  }
  if (task.status === "concluida") {
    const compDate = task.completed_at ? task.completed_at.slice(0, 10) : null;
    const ca = task.company_alvaras;
    const limitDate = task.due_date
      ? task.due_date.slice(0, 10)
      : (task.inicio_obrigatorio_ate
          ? task.inicio_obrigatorio_ate.slice(0, 10)
          : (ca?.data_vencimento ? ca.data_vencimento.slice(0, 10) : null));

    if (compDate && limitDate && compDate > limitDate) {
      return {
        className: "bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-900",
        text: "Concluído - Vencido",
      };
    }

    return {
      className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200",
      text: "Concluída",
    };
  }
  if (task.status === "cancelada") {
    return {
      className: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
      text: "Cancelada",
    };
  }

  if (lane === "andamento") {
    const due = task.due_date ? task.due_date.slice(0, 10) : (task.company_alvaras?.data_vencimento ? task.company_alvaras.data_vencimento.slice(0, 10) : null);
    if (due && due < hoje) {
      return {
        className: "bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-900",
        text: "Em Andamento - Vencido",
      };
    }
    return {
      className: "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-200",
      text: "Em Andamento",
    };
  }
  if (lane === "impedimento") {
    const due = task.due_date ? task.due_date.slice(0, 10) : (task.company_alvaras?.data_vencimento ? task.company_alvaras.data_vencimento.slice(0, 10) : null);
    if (due && due < hoje) {
      return {
        className: "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-200",
        text: "Com Impedimento - Vencido",
      };
    }
    return {
      className: "bg-rose-100 text-rose-800 border border-rose-200 dark:bg-rose-950/60 dark:text-rose-200 dark:border-rose-900",
      text: "Com Impedimento",
    };
  }

  const ca = task.company_alvaras;
  const hasEmissao = ca?.data_emissao != null && String(ca.data_emissao).trim() !== "";

  if (!hasEmissao) {
    if (task.due_date) {
      const limitDate = task.due_date.slice(0, 10);
      if (limitDate < hoje) {
        return {
          className: "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-200",
          text: "Pendente - Vencida",
        };
      }

      const today = new Date(hoje + "T00:00:00");
      const limit = new Date(limitDate + "T00:00:00");
      const diffDays = Math.ceil((limit.getTime() - today.getTime()) / (1000 * 3600 * 24));

      if (diffDays <= 90) {
        return {
          className: "bg-orange-100 text-orange-950 dark:bg-orange-950/50 dark:text-orange-200",
          text: `Pendente - Vence em ${diffDays} dias`,
        };
      }

      return {
        className: "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-200",
        text: `Válido até ${limit.toLocaleDateString("pt-BR")}`,
      };
    }

    const prazoDias = ca?.alvaras?.prazo_inicio_dias ?? 30;
    const baseDia = task.created_at.slice(0, 10);
    const n = Math.min(3650, Math.max(1, Number(prazoDias ?? 30) || 30));
    
    let prazoInicio: string | null = task.inicio_obrigatorio_ate ? task.inicio_obrigatorio_ate.slice(0, 10) : null;
    if (!prazoInicio && baseDia) {
      const dt = new Date(baseDia + "T00:00:00");
      dt.setDate(dt.getDate() + n);
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, "0");
      const d = String(dt.getDate()).padStart(2, "0");
      prazoInicio = `${y}-${m}-${d}`;
    }

    if (prazoInicio) {
      if (prazoInicio < hoje) {
        return {
          className: "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-200",
          text: "Pendente - Vencida",
        };
      }

      const today = new Date(hoje + "T00:00:00");
      const limitDate = new Date(prazoInicio + "T00:00:00");
      const diffDays = Math.ceil((limitDate.getTime() - today.getTime()) / (1000 * 3600 * 24));

      const diasRestantesText = diffDays === 0
        ? "hoje é o limite"
        : (diffDays === 1 ? "resta 1 dia" : `restam ${diffDays} dias`);

      return {
        className: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200",
        text: `Pendente - Não definida (${diasRestantesText})`,
      };
    }

    return {
      className: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200",
      text: "Pendente - Não definida",
    };
  }

  const due = task.due_date ? task.due_date.slice(0, 10) : (ca?.data_vencimento ? ca.data_vencimento.slice(0, 10) : null);
  if (!due) {
    return {
      className: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200",
      text: "Pendente - Não definida",
    };
  }

  if (due < hoje) {
    return {
      className: "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-200",
      text: "Pendente - Vencida",
    };
  }

  const today = new Date(hoje + "T00:00:00");
  const exp = new Date(due + "T00:00:00");
  const diffDays = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 3600 * 24));

  if (diffDays <= 90) {
    return {
      className: "bg-orange-100 text-orange-950 dark:bg-orange-950/50 dark:text-orange-200",
      text: `Pendente - Vence em ${diffDays} dias`,
    };
  }

  return {
    className: "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-200",
    text: `Válido até ${exp.toLocaleDateString("pt-BR")}`,
  };
}
