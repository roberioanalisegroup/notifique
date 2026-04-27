import clsx, { type ClassValue } from "clsx";

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
