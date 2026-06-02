import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const envContent = fs.readFileSync(".env.local", "utf8");
const url = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim();
const serviceRoleKey = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1]?.trim();

if (!url || !serviceRoleKey) {
  console.error("Credentials not found");
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey);

async function run() {
  // 1. Achar a empresa Neuzete
  const { data: companies, error: compErr } = await supabase
    .from("companies")
    .select("id, razao_social, nome_fantasia")
    .ilike("razao_social", "%NEUZETE%")
    .limit(1);

  if (compErr || !companies || companies.length === 0) {
    console.error("Empresa não encontrada:", compErr?.message);
    process.exit(1);
  }

  const company = companies[0];
  console.log(`Empresa: ${company.razao_social} (ID: ${company.id})`);

  // 2. Achar os vínculos dessa empresa
  const { data: vinculos, error: vinErr } = await supabase
    .from("company_alvaras")
    .select(`
      id,
      alvara_id,
      monitoring_status,
      is_exempt,
      alvaras ( id, name, frequencia )
    `)
    .eq("company_id", company.id);

  if (vinErr || !vinculos) {
    console.error("Erro ao buscar vínculos:", vinErr?.message);
    process.exit(1);
  }

  console.log(`\nVínculos da empresa (${vinculos.length}):`);
  for (const v of vinculos) {
    console.log(`- Vínculo ID: ${v.id} | Alvará: ${v.alvaras?.name} | Status Monitoramento: ${v.monitoring_status} | Isento: ${v.is_exempt} | Frequência: ${v.alvaras?.frequencia}`);
    
    // Buscar tarefas desse vínculo
    const { data: tasks, error: taskErr } = await supabase
      .from("alvara_tasks")
      .select("id, task_type, status, due_date, start_after, created_at, completed_at")
      .eq("company_alvara_id", v.id)
      .order("created_at", { ascending: false });

    if (taskErr) {
      console.error(`  Erro ao buscar tarefas do vínculo ${v.id}:`, taskErr.message);
    } else {
      console.log(`  Tarefas (${tasks?.length ?? 0}):`);
      for (const t of tasks ?? []) {
        console.log(`    * Task ID: ${t.id} | Type: ${t.task_type} | Status: ${t.status} | Due: ${t.due_date} | StartAfter: ${t.start_after} | CreatedAt: ${t.created_at} | CompletedAt: ${t.completed_at}`);
      }
    }
  }
}

run();
