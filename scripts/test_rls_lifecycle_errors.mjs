import { createClient } from "@supabase/supabase-js";
import fs from "fs";

// Carregar chaves do arquivo .env.local
const envContent = fs.readFileSync(".env.local", "utf8");
const url = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim();
const anonKey = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)?.[1]?.trim();
const serviceRoleKey = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1]?.trim();

if (!url || !anonKey || !serviceRoleKey) {
  console.error("Credenciais do Supabase incompletas em .env.local");
  process.exit(1);
}

console.log("===============================================================");
console.log("🔬 INICIANDO TESTE DE RLS E LOCKDOWN DE public.lifecycle_errors");
console.log("===============================================================");
console.log(`URL do Supabase: ${url}`);

// 1. Instanciar os clientes
const anonClient = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const adminClient = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function runTests() {
  // Vamos buscar um vínculo de alvará ativo para associar ao teste de insert
  const { data: links, error: linkErr } = await adminClient.from("company_alvaras").select("id").limit(1);
  if (linkErr || !links || links.length === 0) {
    console.error("Não foi possível recuperar vínculos do banco para associar ao erro:", linkErr?.message);
    process.exit(1);
  }
  const companyAlvaraId = links[0].id;

  console.log(`\nVínculo (company_alvara_id) associado ao teste: ${companyAlvaraId}`);

  // -------------------------------------------------------------
  // CASO 1: Usuário Anônimo/Autenticado (Publishable Key) - SELECT
  // -------------------------------------------------------------
  console.log("\n---------------------------------------------------------------");
  console.log("TESTE 1: Usuário Anon/Authenticated tentando SELECT...");
  const { data: selectAnonData, error: selectAnonError } = await anonClient
    .from("lifecycle_errors")
    .select("*")
    .limit(1);

  if (selectAnonError) {
    console.log(`✅ RESULTADO ESPERADO: Erro retornado ou bloqueado pelo RLS: ${selectAnonError.message}`);
  } else if (selectAnonData && selectAnonData.length > 0) {
    console.log("❌ ERRO GRAVE DE SEGURANÇA: Usuário Anon conseguiu ler registros!");
  } else {
    console.log("✅ RESULTADO ESPERADO: Retornou 0 registros (bloqueado silenciosamente por RLS USING false).");
  }

  // -------------------------------------------------------------
  // CASO 2: Usuário Anônimo/Autenticado (Publishable Key) - INSERT
  // -------------------------------------------------------------
  console.log("\n---------------------------------------------------------------");
  console.log("TESTE 2: Usuário Anon/Authenticated tentando INSERT...");
  const { error: insertAnonError } = await anonClient
    .from("lifecycle_errors")
    .insert({
      company_alvara_id: companyAlvaraId,
      operation: "teste_seguranca_anon",
      error_message: "Este insert deve ser totalmente negado",
      payload: { test: true }
    });

  if (insertAnonError) {
    console.log(`✅ RESULTADO ESPERADO: Inserção negada pela RLS/Grant: ${insertAnonError.message}`);
  } else {
    console.log("❌ ERRO GRAVE DE SEGURANÇA: Usuário Anon conseguiu inserir registros!");
  }

  // -------------------------------------------------------------
  // CASO 3: Backend (Service Role Client) - INSERT
  // -------------------------------------------------------------
  console.log("\n---------------------------------------------------------------");
  console.log("TESTE 3: Backend (Service Role Client) tentando INSERT...");
  const { data: insertAdminData, error: insertAdminError } = await adminClient
    .from("lifecycle_errors")
    .insert({
      company_alvara_id: companyAlvaraId,
      operation: "teste_seguranca_service_role",
      error_message: "Insert legítimo via backend",
      payload: { test_success: true }
    })
    .select();

  if (insertAdminError) {
    console.log(`❌ ERRO: Service role falhou ao inserir: ${insertAdminError.message}`);
  } else {
    console.log("✅ SUCESSO: Service role conseguiu inserir perfeitamente bypassing RLS!");
    console.log("Registro inserido:", JSON.stringify(insertAdminData, null, 2));

    // Limpar o registro de teste
    if (insertAdminData && insertAdminData[0]?.id) {
      await adminClient.from("lifecycle_errors").delete().eq("id", insertAdminData[0].id);
      console.log("🧹 Registro de teste removido com sucesso.");
    }
  }
  console.log("===============================================================\n");
}

runTests();
