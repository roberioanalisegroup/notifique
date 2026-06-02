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
  const { data: link, error } = await supabaseAdmin
    .from("company_alvaras")
    .select("id, data_emissao, data_vencimento")
    .eq("id", "f420c1e3-022d-440b-9f30-8f545004cb04")
    .single();

  if (error) {
    console.error("Erro:", error.message);
  } else {
    console.log("Vínculo ID: f420c1e3-022d-440b-9f30-8f545004cb04");
    console.log("data_emissao:", link.data_emissao);
    console.log("data_vencimento:", link.data_vencimento);
  }
}

run();
