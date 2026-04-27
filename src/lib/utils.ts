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
    cnpj: "CNPJ (pessoa jurídica)",
    mei: "MEI (CNPJ do MEI)",
    caepf: "CAEPF",
    cpf: "CPF (pessoa física / produtor)",
    outros: "Outro identificador",
  };
  return m[tipo] ?? tipo;
}

export function formatDate(
  date: string | Date | null | undefined,
  options?: { empty?: string }
): string {
  if (date == null) return options?.empty ?? "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return options?.empty ?? "—";
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
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

export function cn(...classes: ClassValue[]) {
  return clsx(classes);
}
