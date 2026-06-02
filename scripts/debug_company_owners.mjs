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
  const { data: company, error } = await supabaseAdmin
    .from("companies")
    .select("id, razao_social, user_id, responsible_user_id")
    .eq("id", "fb05040a-46f3-4bf9-b04d-87cf335be0ff")
    .single();

  if (error) {
    console.error("Erro:", error.message);
  } else {
    console.log("Empresa:", company.razao_social);
    console.log("user_id (Criador):", company.user_id);
    console.log("responsible_user_id (Responsável):", company.responsible_user_id);
  }
}

run();
