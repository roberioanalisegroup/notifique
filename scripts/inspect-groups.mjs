import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const envContent = fs.readFileSync(".env.local", "utf8");
const url = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim();
const key = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1]?.trim() || envContent.match(/SUPABASE_ROLE_KEY=(.*)/)?.[1]?.trim();

if (!url || !key) {
  console.error("Credentials not found");
  process.exit(1);
}

const supabase = createClient(url, key);

async function run() {
  // 1. Fetch all alvara groups
  const { data: groups, error: gErr } = await supabase.from("alvara_groups").select("*");
  if (gErr) {
    console.error("Groups error:", gErr.message);
    return;
  }
  console.log("ALVARA GROUPS:");
  console.log(JSON.stringify(groups, null, 2));

  // 2. Fetch all alvaras with group details
  const { data: alvaras, error: aErr } = await supabase.from("alvaras").select(`
    id,
    name,
    is_active,
    frequencia,
    group_id,
    alvara_groups!group_id ( name )
  `);
  if (aErr) {
    console.error("Alvaras error:", aErr.message);
    return;
  }
  console.log("\nALL ALVARAS:");
  console.log(JSON.stringify(alvaras, null, 2));
}

run();
