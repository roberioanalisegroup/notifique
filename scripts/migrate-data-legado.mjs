import { createClient } from "@supabase/supabase-js";
import fs from "fs";

// 1. Carregar variáveis de ambiente
if (!fs.existsSync(".env.local")) {
  console.error("Erro: Arquivo .env.local não encontrado na raiz do projeto.");
  process.exit(1);
}

const envContent = fs.readFileSync(".env.local", "utf8");
const url = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim();
const key = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1]?.trim() || envContent.match(/SUPABASE_ROLE_KEY=(.*)/)?.[1]?.trim();

if (!url || !key) {
  console.error("Erro: Credenciais do Supabase não encontradas no arquivo .env.local");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function runDataMigration() {
  console.log("==================================================");
  console.log("🚀 INICIANDO FASE 2: MIGRAÇÃO IDEMPOTENTE DE DADOS");
  console.log("==================================================");

  // 1. Buscar todos os vínculos com dados legados
  console.log("Buscando vínculos com emissão ou vencimento no legado...");
  const { data: caLinks, error: fetchErr } = await supabase
    .from("company_alvaras")
    .select("id, data_emissao, data_vencimento, arquivo_url, companies(razao_social, nome_fantasia)")
    .or("data_emissao.not.is.null,data_vencimento.not.is.null");

  if (fetchErr) {
    console.error("Erro ao buscar vínculos antigos:", fetchErr.message);
    console.error("Dica: Certifique-se de que a migration estrutural (Fase 1) foi aplicada primeiro!");
    process.exit(1);
  }

  console.log(`Encontrados ${caLinks.length} vínculos antigos qualificados.`);

  if (caLinks.length === 0) {
    console.log("Nenhum dado legado pendente de migração.");
    return;
  }

  let migratedCount = 0;
  let skippedCount = 0;

  for (const ca of caLinks) {
    const companyName = ca.companies?.nome_fantasia || ca.companies?.razao_social || "Empresa Desconhecida";

    // 2. Verificar se já existe documento vigente migrado para este vínculo (Idempotência)
    const { data: existingDoc, error: docCheckErr } = await supabase
      .from("company_alvara_documents")
      .select("id")
      .eq("company_alvara_id", ca.id)
      .eq("is_current", true)
      .maybeSingle();

    if (docCheckErr) {
      console.error(`Erro ao verificar documento existente para vínculo ${ca.id}:`, docCheckErr.message);
      continue;
    }

    if (existingDoc) {
      skippedCount++;
      continue;
    }

    // 3. Criar registro estruturado em company_alvara_documents
    const { error: insertErr } = await supabase
      .from("company_alvara_documents")
      .insert({
        company_alvara_id: ca.id,
        issue_date: ca.data_emissao || null,
        expiration_date: ca.data_vencimento || null,
        file_path: ca.arquivo_url || null,
        is_current: true,
        notes: "Documento migrado automaticamente do legado durante a refatoração."
      });

    if (insertErr) {
      console.error(`❌ Erro ao migrar vínculo ${ca.id} da empresa "${companyName}":`, insertErr.message);
    } else {
      migratedCount++;
      console.log(`✅ Vínculo ${ca.id} (${companyName}) migrado com sucesso!`);
    }
  }

  console.log("\n==================================================");
  console.log("RESUMO DA MIGRAÇÃO DE DADOS:");
  console.log(`- Total processados: ${caLinks.length}`);
  console.log(`- Documentos migrados/criados: ${migratedCount}`);
  console.log(`- Vínculos pulados (já migrados): ${skippedCount}`);
  console.log("==================================================");
}

runDataMigration().catch((err) => {
  console.error("Erro crítico na execução da migração de dados:", err);
});
