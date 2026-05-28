import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const envContent = fs.readFileSync(".env.local", "utf8");
const url = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim();
const key = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1]?.trim() || envContent.match(/SUPABASE_ROLE_KEY=(.*)/)?.[1]?.trim();

const supabase = createClient(url, key);

async function run() {
  const { data: tasks, error } = await supabase
    .from("alvara_tasks")
    .select(`
      id,
      status,
      due_date,
      notes,
      completed_at,
      company_alvaras (
        id,
        company_id,
        companies ( nome_fantasia, razao_social ),
        data_emissao,
        data_vencimento,
        arquivo_url,
        alvaras ( name )
      )
    `)
    .eq("company_alvaras.alvaras.id", "609bc9d1-1c5a-455a-9a07-13b9ba250b73"); // Inscrição Estadual (ICMS)
  
  if (error) {
    console.error(error);
    return;
  }
  
  const icmsTasks = tasks.filter(t => t.company_alvaras !== null);
  console.log(`FOUND ICMS TASKS: ${icmsTasks.length}`);
  console.log(JSON.stringify(icmsTasks, null, 2));
}

run();
