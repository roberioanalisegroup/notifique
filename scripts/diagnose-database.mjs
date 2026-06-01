import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const envContent = fs.readFileSync(".env.local", "utf8");
const url = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim();
const key = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1]?.trim() || envContent.match(/SUPABASE_ROLE_KEY=(.*)/)?.[1]?.trim();

const supabase = createClient(url, key);

async function runDiagnostics() {
  console.log("🔍 Iniciando Diagnóstico de Integridade de Status de Alvarás...\n");

  // 1. Buscar todos os vínculos e suas tarefas associadas
  const { data: records, error } = await supabase
    .from("alvara_tasks")
    .select(`
      id,
      status,
      company_alvaras (
        id,
        status,
        company_id,
        companies ( id, razao_social, nome_fantasia )
      )
    `);

  if (error) {
    console.error("Erro ao buscar tarefas e vínculos:", error);
    return;
  }

  // Filtrar combinações inválidas (Fase 2)
  const invalidCombos = [];
  // Filtrar combinações de atenção (Fase 1)
  const attentionCombos = [];

  records.forEach(t => {
    const ca = t.company_alvaras;
    if (!ca) return;

    const tStatus = t.status;
    const caStatus = ca.status;
    const companyName = ca.companies?.nome_fantasia || ca.companies?.razao_social || "Empresa Desconhecida";

    // Combinações inválidas
    if (
      (tStatus === "concluida" && caStatus === "vencido") ||
      (tStatus === "impedimento" && caStatus === "emitido") ||
      (tStatus === "cancelada" && caStatus === "emitido")
    ) {
      invalidCombos.push({
        tarefa_id: t.id,
        tarefa_status: tStatus,
        alvara_id: ca.id,
        alvara_status: caStatus,
        empresa: companyName
      });
    }

    // Combinações de atenção
    if (
      (tStatus === "pendente" && caStatus === "emitido") ||
      (tStatus === "em_andamento" && caStatus === "emitido")
    ) {
      attentionCombos.push({
        tarefa_id: t.id,
        tarefa_status: tStatus,
        alvara_id: ca.id,
        alvara_status: caStatus,
        empresa: companyName
      });
    }
  });

  // 3. Buscar empresas ativas sem nenhum alvará monitorado (Não Monitoradas)
  const { data: companies, error: compErr } = await supabase
    .from("companies")
    .select("id, razao_social, nome_fantasia")
    .is("archived_at", null);

  if (compErr) {
    console.error("Erro ao buscar empresas:", compErr);
    return;
  }

  const { data: links } = await supabase
    .from("company_alvaras")
    .select("company_id");

  const distinctLinkedCompanyIds = new Set((links || []).map(l => l.company_id));
  const unmonitoredCompanies = companies.filter(c => !distinctLinkedCompanyIds.has(c.id));

  // --- EXIBIÇÃO DO RELATÓRIO ---
  console.log("==================================================");
  console.log("❌ 1. COMBINAÇÕES INVÁLIDAS DETECTADAS (Bloqueantes)");
  console.log("==================================================");
  if (invalidCombos.length === 0) {
    console.log("✅ Nenhuma inconsistência grave encontrada!");
  } else {
    console.log(`Encontrados ${invalidCombos.length} registros inválidos:`);
    console.table(invalidCombos);
  }

  console.log("\n==================================================");
  console.log("⚠️ 2. ESTADOS DE ATENÇÃO DETECTADOS (Descompasso de Kanban)");
  console.log("==================================================");
  if (attentionCombos.length === 0) {
    console.log("✅ Nenhuma discrepância de sincronização encontrada!");
  } else {
    console.log(`Encontrados ${attentionCombos.length} estados de atenção:`);
    console.table(attentionCombos);
  }

  console.log("\n==================================================");
  console.log("⚪ 3. EMPRESAS ATIVAS NÃO MONITORADAS (Sem Vínculos)");
  console.log("==================================================");
  if (unmonitoredCompanies.length === 0) {
    console.log("✅ Todas as empresas estão sendo monitoradas!");
  } else {
    console.log(`Encontradas ${unmonitoredCompanies.length} empresas não monitoradas:`);
    console.table(unmonitoredCompanies.map(c => ({
      id: c.id,
      empresa: c.nome_fantasia || c.razao_social || "Sem nome"
    })));
  }
}

runDiagnostics();
