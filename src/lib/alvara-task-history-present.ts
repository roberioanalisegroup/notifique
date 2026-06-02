import { formatDate } from "@/lib/utils";
import type { AlvaraTaskHistory } from "@/types";

function labelStatus(status: string): string {
  const s = status.trim().toLowerCase();
  if (s === "pendente") return "pendente";
  if (s === "concluida") return "concluída";
  if (s === "cancelada") return "cancelada";
  return status;
}

/** Texto único por evento — sem JSON nem formato de código. */
export function linhasHistoricoTarefa(h: AlvaraTaskHistory): string[] {
  const meta = (h.metadata ?? {}) as Record<string, unknown>;
  const tipo = h.event_type;

  switch (tipo) {
    case "created": {
      const status = meta.status != null ? labelStatus(String(meta.status)) : "pendente";
      const base = (h.summary ?? "Tarefa criada").replace(/\.\s*$/, "");
      const linhas = [`${base}. Estado inicial: ${status}.`];
      const dd = meta.due_date;
      if (dd != null && String(dd).trim() !== "") {
        linhas.push(`Data de vencimento inicial registada: ${formatDate(String(dd), { empty: "—" })}.`);
      }
      return linhas;
    }
    case "status": {
      const de = meta.de != null ? labelStatus(String(meta.de)) : "—";
      const para = meta.para != null ? labelStatus(String(meta.para)) : "—";
      return [`Estado alterado de «${de}» para «${para}».`];
    }
    case "notes": {
      if (meta.evidence_attachments && Array.isArray(meta.evidence_attachments) && meta.evidence_attachments.length > 0) {
        const attachStr = meta.evidence_attachments.length > 1 
          ? `Foram anexadas ${meta.evidence_attachments.length} evidências/apoios à tarefa.`
          : "Foi anexada uma nova evidência/apoio à tarefa.";
        
        const temAnterior = meta.anterior != null && String(meta.anterior).trim() !== "";
        const temNovo = meta.novo != null && String(meta.novo).trim() !== "";
        
        if (temNovo && meta.novo !== meta.anterior) {
           return ["Comentário e evidência adicionados.", attachStr];
        }
        return [attachStr];
      }

      const temAnterior = meta.anterior != null && String(meta.anterior).trim() !== "";
      const temNovo = meta.novo != null && String(meta.novo).trim() !== "";
      if (!temAnterior && temNovo) return ["Comentário adicionado à tarefa."];
      return ["A descrição ou comentário da tarefa foi atualizado."];
    }
    case "attachment": {
      const antes = meta.anterior;
      const novo = meta.novo;
      const tinhaAntes = antes != null && String(antes).trim() !== "";
      const temNovo = novo != null && String(novo).trim() !== "";
      if (!tinhaAntes && temNovo) return ["Foi associado um documento ao vínculo desta tarefa."];
      if (tinhaAntes && !temNovo) return ["O documento foi removido do vínculo."];
      return ["O documento anexo ao vínculo foi substituído por outro ficheiro."];
    }
    case "due_date":
      return [
        h.summary?.trim()
          ? h.summary
          : "A data de vencimento da tarefa foi alterada.",
      ];
    case "system": {
      const dv = meta.data_vencimento;
      const de = meta.data_emissao;
      const prox = meta.proxima_data;
      if (de != null && dv != null) {
        return [
          `Baixa registada no vínculo: emissão em ${formatDate(String(de), { empty: "—" })}, validade até ${formatDate(String(dv), { empty: "—" })}.`,
        ];
      }
      if (prox != null && String(prox).trim() !== "") {
        return [
          `Nova tarefa agendada com vencimento em ${formatDate(String(prox), { empty: "—" })} (consoante a periodicidade do tipo e a emissão deste ciclo).`,
        ];
      }
      return [h.summary?.trim() ? h.summary : "Operação automática registada no sistema."];
    }
    case "checklist": {
      const label = meta.label != null ? String(meta.label) : "Etapa";
      const completed = meta.completed === true;
      const comment = meta.comment != null ? String(meta.comment).trim() : "";
      const attachUrl = meta.attachment_url != null ? String(meta.attachment_url).trim() : "";
      const completedAt = meta.completed_at != null ? String(meta.completed_at).trim() : "";
      const linhas: string[] = [];
      if (completed) {
        linhas.push(`✅ Etapa «${label}» concluída${completedAt ? ` em ${formatDate(completedAt, { empty: "", includeTime: true })}` : ""}.`);
      } else {
        linhas.push(`↩️ Etapa «${label}» reaberta.`);
      }
      if (comment) {
        linhas.push(`💬 ${comment}`);
      }
      if (attachUrl) {
        linhas.push("📎 Anexo adicionado à etapa.");
      }
      return linhas;
    }
    default:
      return [h.summary?.trim() ? h.summary : "Registo no histórico."];
  }
}
