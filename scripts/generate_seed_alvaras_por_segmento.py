"""Gera supabase/migrations/seed_alvaras_por_segmento.sql a partir do Excel."""

from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[1]
XLSX = ROOT / "alvaras_exemplos" / "alvaras_por_segmento.xlsx"
OUT = ROOT / "supabase" / "migrations" / "seed_alvaras_por_segmento.sql"

# Descrição do grupo alinhada ao tipo de segmento (chave = coluna Segmento da planilha).
SEGMENT_DESCRIPTIONS: dict[str, str] = {
    "Todos os tipos de empresa": (
        "Alvarás e cadastros comuns a qualquer CNPJ com atividade econômica: "
        "funcionamento municipal, Habite-se, ISS, estadual, CNPJ na Receita Federal."
    ),
    "Alimentação & Bebidas": (
        "Estabelecimentos que produzem, manipulam ou vendem alimentos e bebidas: "
        "VISA, MAPA, inspeção de carnes e licenças sanitárias e de bombeiros."
    ),
    "Saúde & Farmácias": (
        "Clínicas, consultórios, laboratórios, hospitais e farmácias: ANVISA, conselhos, "
        "radiação, resíduos de saúde e segurança."
    ),
    "Construção Civil & Imóveis": (
        "Incorporação, construção, reformas e obras: CREA/CAU, licenças ambientais, "
        "ART e registro em cartório."
    ),
    "Indústria & Manufatura": (
        "Fábricas e transformação de produtos: licenças ambientais, MAPA, "
        "ANVISA onde aplicável e cadastros estaduais/federais."
    ),
    "Educação & Cursos": (
        "Escolas, cursos livres, EAD e treinamentos: autorização ou reconhecimento "
        "do órgão de ensino, conselhos e MEC/estadual/municipal."
    ),
    "Transporte & Logística": (
        "Fretes, armazenagem, passageiros e veículos: ANTT, DER, DETRAN, "
        "rastreamento e responsabilidade civil."
    ),
    "Financeiro & Contábil": (
        "Serviços financeiros, contábeis e correlatos: Banco Central, SUSEP, CVM, "
        "registro em conselhos e compliance setorial."
    ),
    "Comércio & Varejo": (
        "Lojas físicas e varejo em geral: funcionamento, vigilância sanitária quando "
        "houver produtos sujeitos a regulamentação e licenças municipais/estaduais."
    ),
    "Tecnologia & Software": (
        "Empresas de TI, software e serviços digitais: cadastros gerais, LGPD onde "
        "couber e exigências específicas de certificação ou fornecimento ao setor público."
    ),
    "Hotelaria & Turismo": (
        "Hotéis, pousadas, agências e parques: cadastur/ministério do Turismo, "
        "bombeiros, meio ambiente e outorgas."
    ),
    "Beleza & Estética": (
        "Salões, barbearias e clínicas de estética: funcionamento municipal, VISA, "
        "bombeiros e registros em conselhos quando há atos médicos ou cosméticos."
    ),
}


def segment_description(name: str) -> str:
    return SEGMENT_DESCRIPTIONS.get(name.strip(), f"Grupo de alvarás do segmento «{name.strip()}».")


def esc(s: object | None) -> str:
    if s is None:
        return ""
    return str(s).replace("'", "''").strip()


def main() -> None:
    wb = openpyxl.load_workbook(XLSX, read_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))[1:]

    seen: list[str] = []
    order: list[str] = []
    for r in rows:
        if not r or not r[0]:
            continue
        seg = str(r[0]).strip()
        if seg not in seen:
            seen.append(seg)
            order.append(seg)

    palette = [
        "#64748b",
        "#22c55e",
        "#ec4899",
        "#f97316",
        "#6366f1",
        "#0ea5e9",
        "#a855f7",
        "#eab308",
        "#14b8a6",
        "#ef4444",
        "#8b5cf6",
        "#f43f5e",
    ]

    lines: list[str] = []
    lines.append(
        "-- Seed: grupos e alvarás a partir de alvaras_exemplos/alvaras_por_segmento.xlsx"
    )
    lines.append("-- Frequência: anual. Reexecutável (ignora duplicados por nome).")
    lines.append("")

    lines.append("-- Grupos")
    vg = []
    for i, name in enumerate(order):
        col = palette[i % len(palette)]
        desc = esc(segment_description(name))
        vg.append(f"  ('{esc(name)}', '{desc}', '{col}')")
    lines.append("INSERT INTO public.alvara_groups (name, description, color)")
    lines.append("SELECT v.name, v.description, v.color")
    lines.append("FROM (VALUES")
    lines.append(",\n".join(vg))
    lines.append(") AS v(name, description, color)")
    lines.append(
        "WHERE NOT EXISTS (SELECT 1 FROM public.alvara_groups g WHERE g.name = v.name);"
    )
    lines.append("")
    lines.append("-- Atualiza descrições se o grupo já existia (reexecução / alinhar texto)")
    lines.append("UPDATE public.alvara_groups g SET description = v.description")
    lines.append("FROM (VALUES")
    lines.append(",\n".join(vg))
    lines.append(") AS v(name, description, color_unused)")
    lines.append("WHERE g.name = v.name AND g.description IS DISTINCT FROM v.description;")
    lines.append("")

    va_rows: list[tuple[str, str, str, str]] = []
    for r in rows:
        if not r or not r[0]:
            continue
        seg, nome, descr, orgao, esfera = r[0], r[1], r[2], r[3], r[4]
        n = esc(nome)
        if not n:
            continue
        d = esc(descr) if descr else ""
        o = esc(orgao) if orgao else ""
        e = esc(esfera) if esfera else ""
        if e:
            d = f"{d}\n\nEsfera: {e}" if d else f"Esfera: {e}"
        sg = esc(str(seg).strip())
        va_rows.append((sg, n, d, o))

    parts = [f"  ('{sg}', '{nome}', '{d}', '{o}')" for sg, nome, d, o in va_rows]
    lines.append("-- Alvarás (anual, weekend_adjust none)")
    lines.append(
        "INSERT INTO public.alvaras (group_id, name, description, orgao_emissor, frequencia, weekend_adjust)"
    )
    lines.append(
        "SELECT g.id, v.nome, NULLIF(v.description, ''), NULLIF(v.orgao, ''), 'anual', 'none'"
    )
    lines.append("FROM (VALUES")
    lines.append(",\n".join(parts))
    lines.append(") AS v(segmento, nome, description, orgao)")
    lines.append("JOIN public.alvara_groups g ON g.name = v.segmento")
    lines.append("WHERE NOT EXISTS (")
    lines.append("  SELECT 1 FROM public.alvaras a WHERE a.group_id = g.id AND a.name = v.nome")
    lines.append(");")
    lines.append("")

    OUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {OUT} — {len(order)} grupos, {len(va_rows)} alvarás")


if __name__ == "__main__":
    main()
