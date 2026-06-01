import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const envContent = fs.readFileSync(".env.local", "utf8");
const url = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim();
const key = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1]?.trim() || envContent.match(/SUPABASE_ROLE_KEY=(.*)/)?.[1]?.trim();

if (!url || !key) {
  console.error("❌ Erro: Não foi possível obter as credenciais do Supabase no arquivo .env.local.");
  process.exit(1);
}

const supabase = createClient(url, key);
const companyId = "5619cb7f-f2fc-45f9-b547-1848b80ee792";

async function resetCompany() {
  console.log(`🔍 Buscando informações para a empresa ID: ${companyId}...`);

  // 1. Validar existência da empresa
  const { data: company, error: compErr } = await supabase
    .from("companies")
    .select("razao_social, nome_fantasia")
    .eq("id", companyId)
    .maybeSingle();

  if (compErr) {
    console.error("❌ Erro ao buscar empresa:", compErr);
    process.exit(1);
  }

  if (!company) {
    console.error("❌ Empresa não encontrada no banco de dados.");
    process.exit(1);
  }

  const companyName = company.nome_fantasia || company.razao_social || "Sem Nome";
  console.log(`🏢 Empresa Encontrada: "${companyName}"\n`);
  console.log(`⚡ Iniciando limpeza completa de histórico e alvarás...`);

  // 2. Buscar todos os vínculos (company_alvaras)
  const { data: links, error: linksErr } = await supabase
    .from("company_alvaras")
    .select("id")
    .eq("company_id", companyId);

  if (linksErr) {
    console.error("❌ Erro ao buscar vínculos:", linksErr);
    process.exit(1);
  }

  const linkIds = (links || []).map((l) => l.id);
  console.log(`🔗 Vínculos de alvarás encontrados: ${linkIds.length}`);

  let taskIds = [];
  if (linkIds.length > 0) {
    // 3. Buscar todas as tarefas associadas a esses vínculos
    const { data: tasks, error: tasksErr } = await supabase
      .from("alvara_tasks")
      .select("id")
      .in("company_alvara_id", linkIds);

    if (tasksErr) {
      console.error("❌ Erro ao buscar tarefas:", tasksErr);
      process.exit(1);
    }

    taskIds = (tasks || []).map((t) => t.id);
    console.log(`📋 Tarefas associadas encontradas: ${taskIds.length}`);
  }

  // --- LIMPEZA DE TAREFAS ---
  if (taskIds.length > 0) {
    // 4. Limpar Checklist Progress
    console.log("🧹 Apagando progresso de checklists...");
    const { error: checkErr } = await supabase
      .from("alvara_task_checklist_progress")
      .delete()
      .in("task_id", taskIds);
    if (checkErr) console.warn("⚠️ Aviso ao apagar checklists:", checkErr.message);

    // 5. Limpar Histórico de Tarefas (alvara_task_history)
    console.log("🧹 Apagando logs de histórico de tarefas...");
    const { error: taskHistErr } = await supabase
      .from("alvara_task_history")
      .delete()
      .in("task_id", taskIds);
    if (taskHistErr) console.warn("⚠️ Aviso ao apagar histórico de tarefas:", taskHistErr.message);

    // 6. Limpar Erros de Ciclo de Vida (lifecycle_errors) vinculados a tarefas
    const { error: cycleErrTask } = await supabase
      .from("lifecycle_errors")
      .delete()
      .in("task_id", taskIds);
    if (cycleErrTask) console.warn("⚠️ Aviso ao apagar erros de ciclo de tarefas:", cycleErrTask.message);
  }

  // --- LIMPEZA DE VÍNCULOS ---
  if (linkIds.length > 0) {
    // 7. Limpar Histórico de Documentos (company_alvara_document_history)
    console.log("🧹 Apagando histórico de auditoria de documentos...");
    const { error: docHistErr } = await supabase
      .from("company_alvara_document_history")
      .delete()
      .in("company_alvara_id", linkIds);
    if (docHistErr) console.warn("⚠️ Aviso ao apagar histórico de documentos:", docHistErr.message);

    // 8. Limpar Documentos (company_alvara_documents)
    console.log("🧹 Apagando documentos reais (vias de alvarás)...");
    const { error: docsErr } = await supabase
      .from("company_alvara_documents")
      .delete()
      .in("company_alvara_id", linkIds);
    if (docsErr) console.warn("⚠️ Aviso ao apagar documentos:", docsErr.message);

    // 9. Limpar Erros de Ciclo de Vida (lifecycle_errors) vinculados a vínculos
    const { error: cycleErrLink } = await supabase
      .from("lifecycle_errors")
      .delete()
      .in("company_alvara_id", linkIds);
    if (cycleErrLink) console.warn("⚠️ Aviso ao apagar erros de ciclo de vínculos:", cycleErrLink.message);

    // 10. Apagar tarefas operacionais fisicamente
    console.log("🧹 Apagando tarefas operacionais (alvara_tasks)...");
    const { error: delTasksErr } = await supabase
      .from("alvara_tasks")
      .delete()
      .in("company_alvara_id", linkIds);
    if (delTasksErr) {
      console.error("❌ Erro ao apagar tarefas operacionais:", delTasksErr);
      process.exit(1);
    }

    // 11. Apagar os vínculos em si (company_alvaras)
    console.log("🧹 Removendo os vínculos de alvarás (company_alvaras)...");
    const { error: delLinksErr } = await supabase
      .from("company_alvaras")
      .delete()
      .eq("company_id", companyId);
    if (delLinksErr) {
      console.error("❌ Erro ao apagar vínculos de alvarás:", delLinksErr);
      process.exit(1);
    }
  }

  // --- LIMPEZA DE HISTÓRICO GERAL ---
  // 12. Apagar histórico geral da empresa (company_history)
  console.log("🧹 Apagando histórico geral da linha do tempo da empresa (company_history)...");
  const { error: delCompHistErr } = await supabase
    .from("company_history")
    .delete()
    .eq("company_id", companyId);

  if (delCompHistErr) {
    console.error("❌ Erro ao apagar histórico geral da empresa:", delCompHistErr);
    process.exit(1);
  }

  console.log("\n✨==================================================");
  console.log("✅ LIMPEZA DE TESTE E RESET CONCLUÍDOS COM SUCESSO!");
  console.log("==================================================");
  console.log(`🏢 Empresa: "${companyName}"`);
  console.log(`🗑️ Histórico Geral (company_history): Excluído`);
  console.log(`🗑️ Vínculos removidos (company_alvaras): ${linkIds.length}`);
  console.log(`🗑️ Documentos apagados (company_alvara_documents): ${linkIds.length > 0 ? "Sim" : "Nenhum"}`);
  console.log(`🗑️ Tarefas limpas (alvara_tasks): ${taskIds.length}`);
  console.log(`\n💡 A empresa "${companyName}" está agora 100% limpa e sem nenhum alvará associado. Ela é o seu ambiente perfeito e isolado para testar o novo fluxo desde o início!`);
}

resetCompany();
