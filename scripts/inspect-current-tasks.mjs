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
      title,
      company_alvaras (
        id,
        company_id,
        companies ( id, razao_social, nome_fantasia ),
        alvara_id,
        alvaras ( id, name, group_id, alvara_groups!group_id ( name ) )
      )
    `);
  
  if (error) {
    console.error(error);
    return;
  }
  
  console.log(`TOTAL TASKS: ${tasks.length}`);
  
  // Group by current alvara name and see how many tasks exist
  const counts = {};
  for (const t of tasks) {
    const ca = t.company_alvaras;
    const a = ca?.alvaras;
    const aName = a?.name || "Unknown";
    const gName = a?.alvara_groups?.name || "Unknown";
    const key = `${aName} (Group: ${gName}) [ID: ${a?.id}]`;
    counts[key] = (counts[key] || 0) + 1;
  }
  
  console.log("\nTASK COUNTS BY ALVARA TYPE:");
  console.log(JSON.stringify(counts, null, 2));
}

run();
