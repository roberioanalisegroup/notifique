import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import { format } from "date-fns";

const envContent = fs.readFileSync(".env.local", "utf8");
const url = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim();
const serviceRoleKey = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1]?.trim();

if (!url || !serviceRoleKey) {
  console.error("Credentials not found");
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey);

function isTaskOculta(t, hojeStr) {
  if (t.status !== "pendente") return false;
  if (!t.due_date || String(t.due_date).trim() === "") return false;
  const diffTime = new Date(t.due_date).getTime() - new Date(hojeStr).getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 90;
}

function yearFromIso(d) {
  if (!d) return null;
  const y = new Date(d).getFullYear();
  return Number.isFinite(y) ? y : null;
}

function getTaskYear(t) {
  const cy = new Date().getFullYear();
  const y = yearFromIso(t.due_date);
  if (y != null) return y;
  const yi = yearFromIso(t.inicio_obrigatorio_ate);
  if (yi != null) return yi;
  return cy;
}

async function run() {
  // Simular busca de tarefas como o endpoint /api/alvara-tasks faz
  const { data: tasks, error } = await supabase
    .from("alvara_tasks")
    .select(`
      *,
      company_alvaras (
        *,
        companies ( id, razao_social, nome_fantasia, municipio, uf, codigo_empresa, cnpj, numero_documento ),
        alvaras ( *, alvara_groups!group_id ( id, name, color ) )
      )
    `)
    .order("due_date", { ascending: true, nullsFirst: true });

  if (error) {
    console.error("Erro na busca de tarefas:", error.message);
    process.exit(1);
  }

  // Filtrar pela tarefa c063f589-1416-4616-a430-2be3bddc1d35
  const targetTask = tasks.find(t => t.id === "c063f589-1416-4616-a430-2be3bddc1d35");
  if (!targetTask) {
    console.log("Tarefa alvo não foi retornada na consulta!");
    process.exit(1);
  }

  console.log("=== TAREFA ENCONTRADA NA CONSULTA DA API ===");
  console.log("Task ID:", targetTask.id);
  console.log("Status:", targetTask.status);
  console.log("Due Date:", targetTask.due_date);
  console.log("Start After:", targetTask.start_after);
  console.log("Inicio Obrigatorio Ate:", targetTask.inicio_obrigatorio_ate);
  console.log("Vínculo ID:", targetTask.company_alvara_id);
  
  const hojeStr = "2026-06-02"; // data de hoje simulada conforme o print do usuário
  console.log("\n=== SIMULAÇÃO DOS FILTROS OPERACIONAIS ===");
  console.log("Hoje:", hojeStr);
  console.log("isTaskOculta(t, hoje):", isTaskOculta(targetTask, hojeStr));
  console.log("getTaskYear(t):", getTaskYear(targetTask));

  // Vamos simular a filtragem
  const selectedCompanies = ["fb05040a-46f3-4bf9-b04d-87cf335be0ff"]; // ID da Neuzete
  const selectedAlvaraNames = [];
  const selectedYears = [2026, 2027, 2028, 2029, "ocultos"];
  const showFutureTasks = false;

  const showOcultos = selectedYears.includes("ocultos");
  const numericYears = selectedYears.filter((y) => typeof y === "number");

  let passesFilters = true;

  if (selectedCompanies.length > 0) {
    const companyId = targetTask.company_alvaras?.companies?.id;
    if (!companyId || !selectedCompanies.includes(companyId)) {
      console.log("- Falhou: selectedCompanies filter");
      passesFilters = false;
    }
  }

  if (selectedAlvaraNames.length > 0) {
    const an = targetTask.company_alvaras?.alvaras?.name?.trim() ?? "";
    if (!selectedAlvaraNames.includes(an)) {
      console.log("- Falhou: selectedAlvaraNames filter");
      passesFilters = false;
    }
  }

  const isOculta = isTaskOculta(targetTask, hojeStr);
  if (isOculta && !showOcultos) {
    console.log("- Falhou: isOculta && !showOcultos filter");
    passesFilters = false;
  }

  const isActive = !["concluida", "cancelada"].includes(targetTask.status);
  if (isActive && targetTask.start_after && targetTask.start_after > hojeStr && !showFutureTasks) {
    console.log("- Falhou: start_after > hoje filter");
    passesFilters = false;
  }

  if (numericYears.length > 0) {
    const tYear = getTaskYear(targetTask);
    if (!numericYears.includes(tYear)) {
      console.log("- Falhou: numericYears filter. tYear:", tYear, "numericYears:", numericYears);
      passesFilters = false;
    }
  }

  console.log("Passa nos filtros locais?", passesFilters);
}

run();
