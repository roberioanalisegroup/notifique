import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const envContent = fs.readFileSync(".env.local", "utf8");
const url = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim();
const serviceRoleKey = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1]?.trim();

if (!url || !serviceRoleKey) {
  console.error("Credentials not found");
  process.exit(1);
}

const supabaseAdmin = createClient(url, serviceRoleKey);

async function run() {
  // 1. Achar o perfil Beatriz Silva
  const { data: profiles, error: profErr } = await supabaseAdmin
    .from("profiles")
    .select("id, display_name, role")
    .ilike("display_name", "%Beatriz%")
    .limit(1);

  if (profErr || !profiles || profiles.length === 0) {
    console.error("Perfil não encontrado:", profErr?.message);
    process.exit(1);
  }

  const user = profiles[0];
  console.log(`Usuário simulado: ${user.display_name} (ID: ${user.id}, Role: ${user.role})`);

  // 2. Fazer a consulta usando a RLS do usuário
  // No Supabase, para testar a RLS de um usuário específico, podemos usar supabaseAdmin.rpc
  // ou setar a role da transação se tivéssemos acesso direto ao PG, mas com a biblioteca de cliente,
  // podemos criar um token JWT mockado para o usuário ou usar o cliente admin e emular as regras
  // de filtro da política:
  // "public.user_can_access_company_alvara(company_alvara_id)"
  
  // Vamos rodar a consulta SQL de RLS simulando o auth.uid() = user.id
  // Podemos ver quais tarefas o usuário consegue ler avaliando a função user_can_access_company_alvara
  const { data: canAccessTasks, error: checkErr } = await supabaseAdmin
    .rpc("user_can_access_company", { company_uuid: "fb05040a-46f3-4bf9-b04d-87cf335be0ff" }); // ID da Neuzete

  console.log(`\nBeatriz Silva tem acesso à empresa Neuzete? ${canAccessTasks} | Erro se houver: ${checkErr?.message}`);

  // Vamos carregar todas as tarefas associadas à empresa Neuzete
  const { data: tasks, error: taskErr } = await supabaseAdmin
    .from("alvara_tasks")
    .select(`
      id,
      status,
      due_date,
      task_type,
      company_alvara_id,
      company_alvaras!inner (
        id,
        company_id,
        alvara_id,
        alvaras ( name )
      )
    `)
    .eq("company_alvaras.company_id", "fb05040a-46f3-4bf9-b04d-87cf335be0ff");

  if (taskErr) {
    console.error("Erro ao carregar tarefas da Neuzete:", taskErr.message);
  } else {
    console.log(`\nTarefas da Neuzete no Banco (${tasks.length}):`);
    for (const t of tasks) {
      console.log(`- Task ID: ${t.id} | Alvará: ${t.company_alvaras?.alvaras?.name} | Status: ${t.status} | Due: ${t.due_date}`);
    }
  }
}

run();
