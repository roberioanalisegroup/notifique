import { FREQUENCIA_LABELS } from "@/lib/alvara-frequency";
import { cadastroTipoLabel, formatCompanyDocumento } from "@/lib/utils";
import type { CompanyCadastroTipo, CompanyAlvaraSummary } from "@/types";
import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export const EMPRESAS_EXPORT_MAX_ROWS = 5000;

type AlvaraJoin = {
  id: string;
  name: string;
  frequencia: string;
  orgao_emissor: string | null;
  alvara_groups: { id: string; name: string } | null;
} | null;

export type CompanyAlvaraExportRow = {
  id: string;
  company_id: string;
  numero: string | null;
  data_emissao: string | null;
  data_vencimento: string | null;
  status: string;
  observacoes: string | null;
  alvaras: AlvaraJoin;
};

function fmtPtDate(iso: string | null | undefined): string {
  if (iso == null || iso === "") return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function freqLabel(slug: string): string {
  const k = slug as keyof typeof FREQUENCIA_LABELS;
  return FREQUENCIA_LABELS[k] ?? slug;
}

function docFmt(tipo: CompanyCadastroTipo, num: string, cnpj: string | null): string {
  return formatCompanyDocumento(tipo, num, cnpj?.length === 14 ? cnpj : null);
}

/**
 * Collect all unique alvará names across every company and build
 * a per-company map of alvará-name → most-recent emission date.
 */
function buildAlvaraPivot(
  summaries: CompanyAlvaraSummary[],
  linksByCompany: Map<string, CompanyAlvaraExportRow[]>
): {
  alvaraNames: string[];
  datesByCompany: Map<string, Map<string, string>>;
} {
  const nameSet = new Set<string>();
  const datesByCompany = new Map<string, Map<string, string>>();

  for (const s of summaries) {
    const links = linksByCompany.get(s.id) ?? [];
    const dateMap = new Map<string, string>();
    for (const L of links) {
      const name = L.alvaras?.name ?? "Sem nome";
      nameSet.add(name);
      const cur = dateMap.get(name);
      const iso = L.data_emissao ?? "";
      // keep the most recent date
      if (!cur || iso > cur) {
        dateMap.set(name, iso);
      }
    }
    datesByCompany.set(s.id, dateMap);
  }

  const alvaraNames = [...nameSet].sort((a, b) => a.localeCompare(b, "pt"));
  return { alvaraNames, datesByCompany };
}

export async function buildEmpresasExportXlsx(
  summaries: CompanyAlvaraSummary[],
  linksByCompany: Map<string, CompanyAlvaraExportRow[]>
): Promise<Buffer> {
  const { alvaraNames, datesByCompany } = buildAlvaraPivot(summaries, linksByCompany);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Analise Alvará";
  wb.created = new Date();

  const ws1 = wb.addWorksheet("Empresas", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  const fixedCols: Partial<ExcelJS.Column>[] = [
    { header: "Documento", key: "doc", width: 22 },
    { header: "Tipo", key: "tipo", width: 18 },
    { header: "Razão social", key: "razao", width: 36 },
    { header: "Nome fantasia", key: "fantasia", width: 26 },
    { header: "Município", key: "mun", width: 22 },
    { header: "UF", key: "uf", width: 6 },
    { header: "Situação cadastral", key: "sit", width: 16 },
    { header: "Última sincronização", key: "sync", width: 18 },
    { header: "Total alvarás", key: "t", width: 12 },
    { header: "Emitidos", key: "e", width: 10 },
    { header: "Pendentes", key: "p", width: 10 },
    { header: "Vencidos", key: "v", width: 10 },
    { header: "Com notificação", key: "n", width: 14 },
  ];
  const alvaraCols: Partial<ExcelJS.Column>[] = alvaraNames.map((name, i) => ({
    header: name,
    key: `alv_${i}`,
    width: 14,
  }));
  ws1.columns = [...fixedCols, ...alvaraCols];
  ws1.getRow(1).font = { bold: true };

  for (const r of summaries) {
    const tipo = (r.cadastro_tipo ?? "cnpj") as CompanyCadastroTipo;
    const row: Record<string, unknown> = {
      doc: docFmt(tipo, r.numero_documento ?? "", r.cnpj ?? null),
      tipo: cadastroTipoLabel(tipo),
      razao: r.razao_social ?? "",
      fantasia: r.nome_fantasia ?? "",
      mun: r.municipio ?? "",
      uf: r.uf ?? "",
      sit: r.situacao_cadastral ?? "",
      sync: fmtPtDate(r.last_sync_at ?? undefined),
      t: r.total_alvaras ?? 0,
      e: r.alvaras_emitidos ?? 0,
      p: r.alvaras_pendentes ?? 0,
      v: r.alvaras_vencidos ?? 0,
      n: r.alvaras_notificados ?? 0,
    };
    const dateMap = datesByCompany.get(r.id);
    for (let i = 0; i < alvaraNames.length; i++) {
      const iso = dateMap?.get(alvaraNames[i]) ?? "";
      row[`alv_${i}`] = iso ? fmtPtDate(iso) : "—";
    }
    ws1.addRow(row);
  }

  const ws2 = wb.addWorksheet("Vínculos alvarás", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  ws2.columns = [
    { header: "Documento empresa", key: "doc", width: 22 },
    { header: "Razão social", key: "razao", width: 34 },
    { header: "Grupo", key: "grupo", width: 24 },
    { header: "Alvará", key: "alvara", width: 36 },
    { header: "Frequência", key: "freq", width: 14 },
    { header: "Órgão emissor", key: "orgao", width: 22 },
    { header: "Status vínculo", key: "st", width: 14 },
    { header: "Nº certificado", key: "nro", width: 14 },
    { header: "Emissão", key: "em", width: 12 },
    { header: "Vencimento", key: "ve", width: 12 },
    { header: "Observações vínculo", key: "obs", width: 40 },
  ];
  ws2.getRow(1).font = { bold: true };

  for (const s of summaries) {
    const tipo = (s.cadastro_tipo ?? "cnpj") as CompanyCadastroTipo;
    const doc = docFmt(tipo, s.numero_documento ?? "", s.cnpj ?? null);
    const razao = s.razao_social ?? "—";
    const list = linksByCompany.get(s.id) ?? [];
    if (list.length === 0) {
      ws2.addRow({
        doc,
        razao,
        grupo: "—",
        alvara: "—",
        freq: "—",
        orgao: "—",
        st: "—",
        nro: "—",
        em: "—",
        ve: "—",
        obs: "Nenhum alvará vinculado",
      });
      continue;
    }
    list.sort((a, b) => {
      const ga = (a.alvaras?.alvara_groups?.name ?? "").localeCompare(b.alvaras?.alvara_groups?.name ?? "", "pt");
      if (ga !== 0) return ga;
      return (a.alvaras?.name ?? "").localeCompare(b.alvaras?.name ?? "", "pt");
    });
    for (const L of list) {
      const a = L.alvaras;
      ws2.addRow({
        doc,
        razao,
        grupo: a?.alvara_groups?.name ?? "Sem grupo",
        alvara: a?.name ?? "—",
        freq: a?.frequencia ? freqLabel(a.frequencia) : "—",
        orgao: a?.orgao_emissor ?? "—",
        st: L.status ?? "—",
        nro: L.numero ?? "—",
        em: fmtPtDate(L.data_emissao ?? undefined),
        ve: fmtPtDate(L.data_vencimento ?? undefined),
        obs: L.observacoes ?? "",
      });
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export function buildEmpresasExportPdf(
  summaries: CompanyAlvaraSummary[],
  linksByCompany: Map<string, CompanyAlvaraExportRow[]>
): Buffer {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  doc.setFont("helvetica", "normal");

  doc.setFontSize(14);
  doc.text("Empresas — resumo", 14, 16);
  doc.setFontSize(8);

  const { alvaraNames, datesByCompany } = buildAlvaraPivot(summaries, linksByCompany);

  const fixedHeads = [
    "Documento",
    "Tipo",
    "Razão social",
    "Município",
    "UF",
    "Situação",
    "Últ. sync",
    "Tot.",
    "Em.",
    "Pend.",
    "Ven.",
    "Notif.",
  ];
  const headEmpresa = [[
    ...fixedHeads,
    ...alvaraNames.map((n) => n.slice(0, 30)),
  ]];

  const bodyEmpresa: string[][] = [];
  for (const r of summaries) {
    const tipo = (r.cadastro_tipo ?? "cnpj") as CompanyCadastroTipo;
    const base = [
      docFmt(tipo, r.numero_documento ?? "", r.cnpj ?? null),
      cadastroTipoLabel(tipo),
      (r.razao_social ?? "—").slice(0, 80),
      r.municipio ?? "—",
      r.uf ?? "—",
      (r.situacao_cadastral ?? "—").slice(0, 24),
      fmtPtDate(r.last_sync_at ?? undefined),
      String(r.total_alvaras ?? 0),
      String(r.alvaras_emitidos ?? 0),
      String(r.alvaras_pendentes ?? 0),
      String(r.alvaras_vencidos ?? 0),
      String(r.alvaras_notificados ?? 0),
    ];
    const dateMap = datesByCompany.get(r.id);
    const alvCells = alvaraNames.map((name) => {
      const iso = dateMap?.get(name) ?? "";
      return iso ? fmtPtDate(iso) : "—";
    });
    bodyEmpresa.push([...base, ...alvCells]);
  }

  autoTable(doc, {
    head: headEmpresa,
    body: bodyEmpresa,
    startY: 20,
    margin: { left: 10, right: 10 },
    styles: { fontSize: 6, cellPadding: 1.2, overflow: "linebreak", minCellHeight: 4 },
    headStyles: { fillColor: [37, 99, 235], textColor: 255 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    tableWidth: "auto",
    columnStyles: {
      0: { cellWidth: 28 },
      2: { cellWidth: 36 },
    },
  });

  doc.addPage();
  doc.setFontSize(14);
  doc.setFont("helvetica", "normal");
  doc.text("Vínculos — alvarás por empresa", 14, 16);

  const headVinc: string[][] = [
    [
      "Documento empresa",
      "Grupo",
      "Alvará",
      "Frequência",
      "Status vínculo",
      "Emissão",
      "Vencimento",
    ],
  ];
  const bodyVinc: string[][] = [];

  for (const s of summaries) {
    const tipo = (s.cadastro_tipo ?? "cnpj") as CompanyCadastroTipo;
    const docStr = docFmt(tipo, s.numero_documento ?? "", s.cnpj ?? null);
    const list = linksByCompany.get(s.id) ?? [];
    if (list.length === 0) {
      bodyVinc.push([docStr, "—", "—", "—", "—", "—", "—"]);
      continue;
    }
    const sorted = [...list].sort((a, b) => {
      const ga = (a.alvaras?.alvara_groups?.name ?? "").localeCompare(
        b.alvaras?.alvara_groups?.name ?? "",
        "pt"
      );
      if (ga !== 0) return ga;
      return (a.alvaras?.name ?? "").localeCompare(b.alvaras?.name ?? "", "pt");
    });
    for (const L of sorted) {
      const a = L.alvaras;
      bodyVinc.push([
        docStr,
        (a?.alvara_groups?.name ?? "Sem grupo").slice(0, 42),
        (a?.name ?? "—").slice(0, 46),
        a?.frequencia ? freqLabel(a.frequencia) : "—",
        (L.status ?? "—").slice(0, 16),
        fmtPtDate(L.data_emissao ?? undefined),
        fmtPtDate(L.data_vencimento ?? undefined),
      ]);
    }
  }

  autoTable(doc, {
    head: headVinc,
    body: bodyVinc,
    startY: 22,
    margin: { left: 14, right: 14 },
    styles: { fontSize: 7, cellPadding: 1.5, overflow: "linebreak", minCellHeight: 4 },
    headStyles: { fillColor: [37, 99, 235], textColor: 255 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 38 },
      2: { cellWidth: 52 },
    },
    didDrawPage: (data) => {
      doc.setFontSize(8);
      doc.setTextColor(100);
      doc.text(
        `Página ${data.pageNumber}`,
        doc.internal.pageSize.getWidth() / 2,
        doc.internal.pageSize.getHeight() - 8,
        { align: "center" }
      );
      doc.setTextColor(0);
    },
  });

  const out = doc.output("arraybuffer");
  return Buffer.from(out);
}
