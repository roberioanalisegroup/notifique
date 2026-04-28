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

export function cn(...classes: ClassValue[]) {
  return clsx(classes);
}
