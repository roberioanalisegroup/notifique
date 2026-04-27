import { getSupabaseForRequest } from "@/lib/api-auth";
import {
  alvaraNameKey,
  buildLegalFromImportRow,
  isSemGrupoCell,
  parseAtivoCell,
  parseFrequenciaCell,
  parseWeekendCell,
  resolveGroupIdByExactName,
  validateImportRowLegal,
  type AlvaraImportRow,
} from "@/lib/alvara-import";
import { parseCsvBestScore, scoreRowsWithNome } from "@/lib/csv-import";
import { NextRequest } from "next/server";

function cell(row: AlvaraImportRow, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

export async function POST(request: NextRequest) {
  const auth = await getSupabaseForRequest(request);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const form = await request.formData();
  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    return new Response(JSON.stringify({ error: "Arquivo (file) é obrigatório" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const text = await file.text();
  const parsed = parseCsvBestScore(text, scoreRowsWithNome);

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      };

      const { data: groups, error: gErr } = await supabase.from("alvara_groups").select("id, name");

      if (gErr) {
        send({ type: "done", imported: 0, skipped: 0, duplicates: 0, errors: [gErr.message] });
        controller.close();
        return;
      }

      const groupList = (groups ?? []) as { id: string; name: string }[];

      const { data: existingRows, error: exErr } = await supabase.from("alvaras").select("name");
      if (exErr) {
        send({ type: "done", imported: 0, skipped: 0, duplicates: 0, errors: [exErr.message] });
        controller.close();
        return;
      }

      const existingNameKeys = new Set(
        (existingRows ?? []).map((r) => alvaraNameKey(String((r as { name: string }).name)))
      );

      const rows = parsed.data.filter((r) => Object.values(r).some((v) => String(v ?? "").trim() !== ""));
      const total = rows.length;
      let imported = 0;
      let duplicates = 0;
      let skipped = 0;
      const errors: string[] = [];
      const batchNameKeys = new Set<string>();

      let index = 0;
      for (const row of rows) {
        index += 1;
        const nome = cell(row, "nome", "name", "alvara", "tipo");
        const nameKey = nome ? alvaraNameKey(nome) : "";

        if (!nome) {
          skipped += 1;
          send({
            type: "progress",
            index,
            total,
            name: "(sem nome)",
            ok: false,
            detail: "Linha sem nome",
          });
          continue;
        }

        if (existingNameKeys.has(nameKey) || batchNameKeys.has(nameKey)) {
          duplicates += 1;
          send({
            type: "progress",
            index,
            total,
            name: nome,
            ok: false,
            detail: "Nome já existe no cadastro ou repetido no arquivo",
          });
          continue;
        }

        const grupoRaw = cell(row, "grupo", "group", "grupo_nome", "nome_grupo");
        let group_id: string | null = null;
        if (!isSemGrupoCell(grupoRaw)) {
          const gid = resolveGroupIdByExactName(grupoRaw, groupList);
          if (!gid) {
            skipped += 1;
            const msg = `Linha ${index} (“${nome}”): grupo não encontrado (nome deve ser idêntico ao cadastro): “${grupoRaw}”`;
            errors.push(msg);
            send({ type: "progress", index, total, name: nome, ok: false, detail: "Grupo inexistente" });
            continue;
          }
          group_id = gid;
        }

        const freqRaw = cell(row, "frequencia", "freq", "frequência");
        const frequencia = parseFrequenciaCell(freqRaw);
        if (!frequencia) {
          skipped += 1;
          const msg = `Linha ${index} (“${nome}”): frequência inválida ou vazia (“${freqRaw || "—"}”)`;
          errors.push(msg);
          send({
            type: "progress",
            index,
            total,
            name: nome,
            ok: false,
            detail: "Frequência inválida",
          });
          continue;
        }

        const weekendRaw = cell(row, "ajuste_fim_semana", "weekend_adjust", "fim_de_semana", "ajuste");
        const weekend_adjust = parseWeekendCell(weekendRaw || undefined);
        if (weekend_adjust == null) {
          skipped += 1;
          const msg = `Linha ${index} (“${nome}”): ajuste de fim de semana inválido (“${weekendRaw}”)`;
          errors.push(msg);
          send({ type: "progress", index, total, name: nome, ok: false, detail: "Ajuste fim de semana inválido" });
          continue;
        }

        const legal = buildLegalFromImportRow(frequencia, row);
        const legalErr = validateImportRowLegal(frequencia, legal);
        if (legalErr) {
          skipped += 1;
          const msg = `Linha ${index} (“${nome}”): ${legalErr}`;
          errors.push(msg);
          send({ type: "progress", index, total, name: nome, ok: false, detail: legalErr });
          continue;
        }

        const description = cell(row, "descricao", "description", "descrição") || null;
        const orgao_emissor = cell(row, "orgao_emissor", "orgao", "órgão", "orgão") || null;
        const is_active = parseAtivoCell(row.ativo ?? row.active ?? row["ativo?"]);

        const { error: insErr } = await supabase.from("alvaras").insert({
          group_id,
          name: nome,
          description,
          orgao_emissor,
          frequencia,
          weekend_adjust,
          legal_dia: legal.legal_dia,
          legal_mes: legal.legal_mes,
          legal_dia_semana: legal.legal_dia_semana,
          legal_dias_uteis: legal.legal_dias_uteis,
          is_active,
        });

        if (insErr) {
          skipped += 1;
          const msg = `Linha ${index} (“${nome}”): ${insErr.message}`;
          errors.push(msg);
          send({ type: "progress", index, total, name: nome, ok: false, detail: insErr.message });
          continue;
        }

        batchNameKeys.add(nameKey);
        existingNameKeys.add(nameKey);
        imported += 1;
        send({ type: "progress", index, total, name: nome, ok: true, detail: null });
      }

      send({
        type: "done",
        imported,
        skipped,
        duplicates,
        errors: errors.slice(0, 50),
        errorsTruncated: errors.length > 50,
      });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
