import { createClient } from "@supabase/supabase-js";
import fs from "fs";

// Load environment variables
const envContent = fs.readFileSync(".env.local", "utf8");
const url = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim();
const key = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1]?.trim() || envContent.match(/SUPABASE_ROLE_KEY=(.*)/)?.[1]?.trim();

if (!url || !key) {
  console.error("Credentials not found in .env.local");
  process.exit(1);
}

const supabase = createClient(url, key);

// Target Group ID for "Analise Group"
const ANALISE_GROUP_ID = "949f366d-46d1-4897-a372-835975e13335";

// Alvará ID mapping
const MAPPING = {
  // AVCB – Corpo de Bombeiros (Group: Comércio & Varejo) -> Alvará do Corpo de Bombeiros (AVCB) (Group: Analise Group)
  "b4a43c24-80f5-4b28-9d2d-c19ed79174d5": "63fdc22c-b97e-4baf-a149-99f84536fae9",
  // AV – Corpo de Bombeiros (Group: Beleza & Estética) -> Alvará do Corpo de Bombeiros (AVCB) (Group: Analise Group)
  "2ef9bc4f-4536-424a-80bf-fae3d1c98263": "63fdc22c-b97e-4baf-a149-99f84536fae9",
  
  // Alvará de Funcionamento (Localização) (Group: Comércio & Varejo) -> Alvará de Funcionamento (Group: Analise Group)
  "dc0c9aed-8690-4b1b-8465-2c90c3ea6af1": "db9ca0c4-36fa-4cf7-9be5-ea9afde4a21f",
  // Alvará de Funcionamento Municipal (Group: Beleza & Estética) -> Alvará de Funcionamento (Group: Analise Group)
  "4e254bba-32df-4feb-be94-7ae656a0d575": "db9ca0c4-36fa-4cf7-9be5-ea9afde4a21f",
  
  // Alvará Sanitário (alimentos/cosméticos) (Group: Comércio & Varejo) -> Alvará da Vigilância Sanitária (Group: Analise Group)
  "1b79a8ed-2d37-4fd2-9016-43e9affaf43a": "9b87b97c-abb6-42ae-a4fc-bbfc4b5feedc",
  // Alvará Sanitário (Group: Beleza & Estética) -> Alvará da Vigilância Sanitária (Group: Analise Group)
  "2791ec24-fa23-45da-aa9d-7fcb239c084b": "9b87b97c-abb6-42ae-a4fc-bbfc4b5feedc",
  
  // Inscrição Estadual (ICMS) (Group: Comércio & Varejo) -> Alvará de Funcionamento (Group: Analise Group)
  "609bc9d1-1c5a-455a-9a07-13b9ba250b73": "db9ca0c4-36fa-4cf7-9be5-ea9afde4a21f"
};

async function run() {
  const dryRun = process.argv.includes("--execute") ? false : true;
  console.log("==================================================");
  console.log(`INICIANDO MIGRAÇÃO EM MASSA (DRY RUN: ${dryRun})`);
  console.log("==================================================");

  // 1. Fetch all alvaras to resolve names easily
  const { data: alvarasList, error: alvarasErr } = await supabase.from("alvaras").select("id, name, group_id");
  if (alvarasErr) {
    console.error("Erro ao buscar alvarás:", alvarasErr.message);
    return;
  }
  const alvaraMap = {};
  for (const a of alvarasList) {
    alvaraMap[a.id] = a;
  }

  // 2. Fetch all tasks with company_alvaras details
  const { data: tasks, error: tasksErr } = await supabase
    .from("alvara_tasks")
    .select(`
      id,
      status,
      due_date,
      completed_at,
      notes,
      protocolo,
      inicio_obrigatorio_ate,
      company_alvaras (
        id,
        company_id,
        companies ( id, razao_social, nome_fantasia, codigo_empresa ),
        alvara_id,
        data_emissao,
        data_vencimento,
        arquivo_url,
        numero,
        observacoes,
        status
      )
    `);

  if (tasksErr) {
    console.error("Erro ao buscar tarefas:", tasksErr.message);
    return;
  }

  console.log(`Total de tarefas encontradas no banco: ${tasks.length}`);

  // Filter tasks that need to be migrated (belong to links whose alvara group is NOT Analise Group)
  const tasksToMigrate = tasks.filter(t => {
    const ca = t.company_alvaras;
    if (!ca) return false;
    const alv = alvaraMap[ca.alvara_id];
    return alv && alv.group_id !== ANALISE_GROUP_ID;
  });

  console.log(`Tarefas elegíveis para migração (fora do Analise Group): ${tasksToMigrate.length}`);

  if (tasksToMigrate.length === 0) {
    console.log("Nenhuma tarefa para migrar.");
    return;
  }

  // Group affected companies
  const companyIds = [...new Set(tasksToMigrate.map(t => t.company_alvaras.company_id))];
  console.log(`Empresas afetadas: ${companyIds.length}`);

  // Fetch all existing company_alvaras for these companies in Analise Group
  const { data: existingTargetLinks, error: linksErr } = await supabase
    .from("company_alvaras")
    .select("*")
    .in("company_id", companyIds)
    .in("alvara_id", [
      "63fdc22c-b97e-4baf-a149-99f84536fae9", // AVCB
      "db9ca0c4-36fa-4cf7-9be5-ea9afde4a21f", // Funcionamento
      "9b87b97c-abb6-42ae-a4fc-bbfc4b5feedc"  // Vigilância Sanitária
    ]);

  if (linksErr) {
    console.error("Erro ao buscar vínculos existentes no Analise Group:", linksErr.message);
    return;
  }

  console.log(`Vínculos existentes no Analise Group para estas empresas: ${existingTargetLinks.length}`);

  // Create a fast lookup map for existing target links: "company_id:alvara_id" -> link
  const targetLinkLookup = {};
  for (const link of existingTargetLinks) {
    targetLinkLookup[`${link.company_id}:${link.alvara_id}`] = link;
  }

  // We will prepare links to create/update and tasks to update
  const linksToCreate = [];
  const linksToUpdate = {};
  const tasksToUpdate = [];
  const historyToInsert = [];
  
  // Track potential duplicate key conflicts: "company_alvara_id:due_date" (for pending tasks)
  // And "company_alvara_id:null" for pending tasks with no due date
  const pendingTasksOnTarget = {};

  // Initialize pendingTasksOnTarget with existing pending tasks in Analise Group
  const analiseGroupTasks = tasks.filter(t => {
    const ca = t.company_alvaras;
    if (!ca) return false;
    const alv = alvaraMap[ca.alvara_id];
    return alv && alv.group_id === ANALISE_GROUP_ID && t.status === "pendente";
  });

  for (const t of analiseGroupTasks) {
    const key = `${t.company_alvaras.id}:${t.due_date || "null"}`;
    if (!pendingTasksOnTarget[key]) pendingTasksOnTarget[key] = [];
    pendingTasksOnTarget[key].push(t);
  }

  const beforeAfterReport = [];

  // Phase 1: Calculate migrations and resolve target links
  for (const task of tasksToMigrate) {
    const oldLink = task.company_alvaras;
    const company = oldLink.companies;
    const oldAlvara = alvaraMap[oldLink.alvara_id];
    const targetAlvaraId = MAPPING[oldLink.alvara_id];

    if (!targetAlvaraId) {
      console.error(`[Erro] Sem mapeamento de destino para o alvará: ${oldAlvara.name} (ID: ${oldLink.alvara_id})`);
      continue;
    }

    const targetAlvara = alvaraMap[targetAlvaraId];
    const lookupKey = `${oldLink.company_id}:${targetAlvaraId}`;
    let targetLink = targetLinkLookup[lookupKey];

    // If target link doesn't exist, we must plan to create it
    if (!targetLink) {
      // Check if we already scheduled creation of this link in this execution
      const scheduled = linksToCreate.find(l => l.company_id === oldLink.company_id && l.alvara_id === targetAlvaraId);
      if (scheduled) {
        targetLink = scheduled;
      } else {
        const newLinkDraft = {
          id: crypto.randomUUID(), // assign a temporary UUID to reference in task updates
          company_id: oldLink.company_id,
          alvara_id: targetAlvaraId,
          numero: oldLink.numero,
          data_emissao: oldLink.data_emissao,
          data_vencimento: oldLink.data_vencimento,
          arquivo_url: oldLink.arquivo_url,
          status: oldLink.status || "pendente",
          observacoes: oldLink.observacoes,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        linksToCreate.push(newLinkDraft);
        targetLink = newLinkDraft;
      }
    } else {
      // Merge values if the target link already exists
      const mergedFields = {};
      let changed = false;

      if (!targetLink.data_emissao && oldLink.data_emissao) {
        mergedFields.data_emissao = oldLink.data_emissao;
        changed = true;
      }
      if (!targetLink.data_vencimento && oldLink.data_vencimento) {
        mergedFields.data_vencimento = oldLink.data_vencimento;
        changed = true;
      }
      if (!targetLink.arquivo_url && oldLink.arquivo_url) {
        mergedFields.arquivo_url = oldLink.arquivo_url;
        changed = true;
      }
      if (!targetLink.numero && oldLink.numero) {
        mergedFields.numero = oldLink.numero;
        changed = true;
      }
      if (!targetLink.observacoes && oldLink.observacoes) {
        mergedFields.observacoes = oldLink.observacoes;
        changed = true;
      } else if (targetLink.observacoes && oldLink.observacoes && targetLink.observacoes !== oldLink.observacoes) {
        mergedFields.observacoes = `${targetLink.observacoes}\n[Original: ${oldAlvara.name}] ${oldLink.observacoes}`;
        changed = true;
      }

      if (changed) {
        linksToUpdate[targetLink.id] = {
          ...targetLink,
          ...mergedFields,
          updated_at: new Date().toISOString()
        };
        // Update local object representation
        Object.assign(targetLink, mergedFields);
      }
    }

    // Determine notes update (for Inscrição Estadual fallback or safety)
    let finalNotes = task.notes || "";
    if (oldLink.alvara_id === "609bc9d1-1c5a-455a-9a07-13b9ba250b73") {
      // Inscrição Estadual
      finalNotes = `[Original: Inscrição Estadual (ICMS)]\n${finalNotes}`;
    }

    // Schedule task update
    const taskUpdateDraft = {
      task: task,
      target_company_alvara_id: targetLink.id,
      final_notes: finalNotes,
      old_alvara_name: oldAlvara.name,
      new_alvara_name: targetAlvara.name,
      company_name: company?.nome_fantasia || company?.razao_social || "Empresa Desconhecida",
      company_code: company?.codigo_empresa || "—"
    };

    tasksToUpdate.push(taskUpdateDraft);
  }

  // Phase 2: Check for unique key conflicts on target links
  console.log("\nVerificando potenciais conflitos de chaves únicas (restrições do Supabase)...");
  
  const tasksToUpdateFinal = [];
  const tasksToCancelOrMerge = [];

  for (const item of tasksToUpdate) {
    const targetLinkId = item.target_company_alvara_id;
    const task = item.task;

    if (task.status === "pendente") {
      const key = `${targetLinkId}:${task.due_date || "null"}`;
      const conflicts = pendingTasksOnTarget[key] || [];

      if (conflicts.length > 0) {
        // We have a conflict! There's already a pending task on the target link with the same due date.
        console.log(`[AVISO CONFLITO] Empresa "${item.company_name}" já possui tarefa pendente com vencimento "${task.due_date || "Sem Vencimento"}" no destino. Resolvendo mesclando dados...`);
        
        // Find the "master" task to merge into (prefer existing task on Analise Group or the first conflict)
        const masterTask = conflicts[0];
        
        tasksToCancelOrMerge.push({
          sourceTask: task,
          masterTaskId: masterTask.id,
          companyName: item.company_name,
          oldAlvara: item.old_alvara_name,
          newAlvara: item.new_alvara_name,
          dueDate: task.due_date || "Sem Vencimento"
        });

        // Add history entry to the master task about the merge
        historyToInsert.push({
          task_id: masterTask.id,
          event_type: "system",
          summary: `Tarefa do alvará "${item.old_alvara_name}" mesclada a esta devido à unificação de grupos.`,
          metadata: {
            merged_task_id: task.id,
            original_alvara: item.old_alvara_name,
            original_notes: task.notes,
            original_protocolo: task.protocolo
          }
        });

      } else {
        // No conflict, register it as pending
        if (!pendingTasksOnTarget[key]) pendingTasksOnTarget[key] = [];
        pendingTasksOnTarget[key].push(task);
        tasksToUpdateFinal.push(item);
      }
    } else {
      // Completed or cancelled tasks never conflict on unique indices, so they can be repointed freely
      tasksToUpdateFinal.push(item);
    }
  }

  console.log(`\nPlanejamento de Operações:`);
  console.log(`- Vínculos a criar: ${linksToCreate.length}`);
  console.log(`- Vínculos a atualizar/mesclar: ${Object.keys(linksToUpdate).length}`);
  console.log(`- Tarefas a repontar com sucesso: ${tasksToUpdateFinal.length}`);
  console.log(`- Tarefas em conflito a mesclar/cancelar: ${tasksToCancelOrMerge.length}`);

  // 3. Execution Phase
  if (!dryRun) {
    console.log("\nExecutando gravação no banco de dados...");

    // Create target links
    if (linksToCreate.length > 0) {
      console.log(`Inserindo ${linksToCreate.length} novos vínculos...`);
      // Supabase insert in batches or individually
      for (const link of linksToCreate) {
        const { error } = await supabase.from("company_alvaras").insert({
          id: link.id,
          company_id: link.company_id,
          alvara_id: link.alvara_id,
          numero: link.numero,
          data_emissao: link.data_emissao,
          data_vencimento: link.data_vencimento,
          arquivo_url: link.arquivo_url,
          status: link.status,
          observacoes: link.observacoes
        });
        if (error) {
          console.error(`Erro ao criar vínculo para empresa ${link.company_id}:`, error.message);
          throw error;
        }
      }
    }

    // Update target links (merges)
    const linksToUpdateList = Object.values(linksToUpdate);
    if (linksToUpdateList.length > 0) {
      console.log(`Atualizando ${linksToUpdateList.length} vínculos mesclados...`);
      for (const link of linksToUpdateList) {
        const { error } = await supabase.from("company_alvaras").update({
          data_emissao: link.data_emissao,
          data_vencimento: link.data_vencimento,
          arquivo_url: link.arquivo_url,
          numero: link.numero,
          observacoes: link.observacoes,
          status: link.status,
          updated_at: link.updated_at
        }).eq("id", link.id);
        if (error) {
          console.error(`Erro ao atualizar vínculo ${link.id}:`, error.message);
          throw error;
        }
      }
    }

    // Repoint tasks
    if (tasksToUpdateFinal.length > 0) {
      console.log(`Repontando ${tasksToUpdateFinal.length} tarefas para o Analise Group...`);
      for (const item of tasksToUpdateFinal) {
        const { error } = await supabase.from("alvara_tasks").update({
          company_alvara_id: item.target_company_alvara_id,
          notes: item.final_notes,
          updated_at: new Date().toISOString()
        }).eq("id", item.task.id);
        
        if (error) {
          console.error(`Erro ao repontar tarefa ${item.task.id}:`, error.message);
          throw error;
        }

        // Insert history record
        const { error: histErr } = await supabase.from("alvara_task_history").insert({
          task_id: item.task.id,
          event_type: "system",
          summary: `Migração automática para o Analise Group (De: "${item.old_alvara_name}" Para: "${item.new_alvara_name}")`,
          metadata: {
            de_alvara: item.old_alvara_name,
            para_alvara: item.new_alvara_name,
            migrado_em: new Date().toISOString()
          }
        });
        if (histErr) {
          console.warn(`[Aviso] Falha ao inserir histórico para tarefa ${item.task.id}:`, histErr.message);
        }

        // Add to audit report array
        beforeAfterReport.push({
          empresa: item.company_name,
          codigo: item.company_code,
          alvara_anterior: item.old_alvara_name,
          alvara_novo: item.new_alvara_name,
          status_tarefa: item.task.status,
          resultado: "Migrado com sucesso"
        });
      }
    }

    // Handle tasks in conflict (cancel/merge them)
    if (tasksToCancelOrMerge.length > 0) {
      console.log(`Mesclando e cancelando ${tasksToCancelOrMerge.length} tarefas em conflito...`);
      for (const item of tasksToCancelOrMerge) {
        const source = item.sourceTask;
        
        // Concat notes of the source task to the master task
        const { data: masterRow } = await supabase.from("alvara_tasks").select("notes").eq("id", item.masterTaskId).single();
        const newMasterNotes = `${masterRow?.notes || ""}\n\n[Nota de Migração - Unificação de Card]:\nComentários originais do card "${item.oldAlvara}":\n${source.notes || "Sem comentários"}`;

        await supabase.from("alvara_tasks").update({
          notes: newMasterNotes,
          updated_at: new Date().toISOString()
        }).eq("id", item.masterTaskId);

        // Cancel the source task so it doesn't violate unique constraints, but KEEP it in cancelled state to avoid data loss
        const { error } = await supabase.from("alvara_tasks").update({
          status: "cancelada",
          completed_at: new Date().toISOString(),
          notes: `[CARD MESCLADO E CANCELADO]\nEsta tarefa foi mesclada com a tarefa correspondente no Analise Group (ID da master: ${item.masterTaskId}) para evitar duplicidade de cartões no Kanban.\n\nComentários originais:\n${source.notes || ""}`,
          updated_at: new Date().toISOString()
        }).eq("id", source.id);

        if (error) {
          console.error(`Erro ao cancelar/mesclar tarefa fonte ${source.id}:`, error.message);
          throw error;
        }

        // Insert history record for source task
        await supabase.from("alvara_task_history").insert({
          task_id: source.id,
          event_type: "system",
          summary: `Tarefa mesclada e cancelada devido à unificação de grupos de alvarás.`,
          metadata: {
            master_task_id: item.masterTaskId,
            migrado_em: new Date().toISOString()
          }
        });

        // Add to audit report
        beforeAfterReport.push({
          empresa: item.companyName,
          codigo: "—",
          alvara_anterior: item.oldAlvara,
          alvara_novo: `${item.newAlvara} (Mesclado)`,
          status_tarefa: source.status,
          resultado: `Mesclado com sucesso na tarefa Master (ID: ${item.masterTaskId.slice(0, 8)})`
        });
      }
    }

    // Insert planned bulk history records
    if (historyToInsert.length > 0) {
      console.log(`Registrando históricos adicionais (${historyToInsert.length})...`);
      for (const h of historyToInsert) {
        await supabase.from("alvara_task_history").insert(h);
      }
    }

    // 4. CLEANUP OLD LINKS
    console.log("\nLimpando vínculos antigos de outras categorias para as empresas afetadas...");
    // Fetch all old company_alvaras for these companies that are not in Analise Group
    const { data: linksToDelete, error: deleteQueryErr } = await supabase
      .from("company_alvaras")
      .select(`
        id,
        company_id,
        alvara_id,
        alvaras ( name, group_id )
      `)
      .in("company_id", companyIds);

    if (deleteQueryErr) {
      console.error("Erro ao buscar vínculos para exclusão:", deleteQueryErr.message);
    } else {
      const actualToDelete = linksToDelete.filter(l => l.alvaras && l.alvaras.group_id !== ANALISE_GROUP_ID);
      console.log(`Total de vínculos antigos identificados para remoção: ${actualToDelete.length}`);

      let deletedCount = 0;
      for (const link of actualToDelete) {
        // Safety check: verify no active or completed task points to this link anymore
        const { data: countCheck } = await supabase
          .from("alvara_tasks")
          .select("id")
          .eq("company_alvara_id", link.id);

        if (countCheck && countCheck.length > 0) {
          console.warn(`[Segurança] Ignorando exclusão do vínculo antigo ${link.id} pois ele ainda tem ${countCheck.length} tarefas apontando para ele!`);
          continue;
        }

        const { error: delErr } = await supabase.from("company_alvaras").delete().eq("id", link.id);
        if (delErr) {
          console.error(`Erro ao excluir vínculo antigo ${link.id}:`, delErr.message);
        } else {
          deletedCount++;
        }
      }
      console.log(`Remoção concluída. Vínculos excluídos com segurança: ${deletedCount}/${actualToDelete.length}`);
    }

    console.log("\n==================================================");
    console.log("MIGRAÇÃO EXECUTADA COM SUCESSO!");
    console.log("==================================================");

  } else {
    // DRY RUN LOGGING
    console.log("\n[DRY RUN] Simulação de Relatório de Migração:");
    for (const item of tasksToUpdateFinal) {
      beforeAfterReport.push({
        empresa: item.company_name,
        codigo: item.company_code,
        alvara_anterior: item.old_alvara_name,
        alvara_novo: item.new_alvara_name,
        status_tarefa: item.task.status,
        resultado: "Migração planejada"
      });
    }
    for (const item of tasksToCancelOrMerge) {
      beforeAfterReport.push({
        empresa: item.companyName,
        codigo: "—",
        alvara_anterior: item.oldAlvara,
        alvara_novo: `${item.newAlvara} (Conflito/Mesclar)`,
        status_tarefa: item.sourceTask.status,
        resultado: `Planejado mesclar na tarefa Master (${item.masterTaskId.slice(0, 8)})`
      });
    }
  }

  // 5. Generate JSON report for auditing
  const reportPath = `./migration-report-${dryRun ? "dryrun" : "final"}.json`;
  fs.writeFileSync(reportPath, JSON.stringify(beforeAfterReport, null, 2), "utf8");
  console.log(`Relatório salvo em ${reportPath}`);
}

run().catch(err => {
  console.error("Erro crítico na execução da migração:", err);
});
