import { getSupabaseForRequest } from "@/lib/api-auth";
import { endOfMonth, startOfMonth } from "date-fns";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await getSupabaseForRequest(request);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  
  // Date intervals for alerts
  const monthStart = startOfMonth(now).toISOString().slice(0, 10);
  const monthEnd = endOfMonth(now).toISOString().slice(0, 10);
  
  const in30 = new Date(now);
  in30.setDate(in30.getDate() + 30);
  const until30 = in30.toISOString().slice(0, 10);

  const in60 = new Date(now);
  in60.setDate(in60.getDate() + 60);
  const until60 = in60.toISOString().slice(0, 10);

  const in90 = new Date(now);
  in90.setDate(in90.getDate() + 90);
  const until90 = in90.toISOString().slice(0, 10);

  // 6 months ago for time series
  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);
  const sixMonthsAgoStr = sixMonthsAgo.toISOString().slice(0, 10);

  const [
    rCompaniesSummary,
    rExpiringAlvaras,
    rMonthTasks,
    rActiveTasks,
    rProfiles,
    rSixMonthTasks,
    rFileCounts,
    rIndeterminados,
    rTotalAlvarasTipos,
    rSyncPending,
    rVencendoList
  ] = await Promise.all([
    // 1. Companies summary for compliance, top critical, state concentration, and responsible workload
    supabase

      .from("companies_alvara_summary")
      .select("id, alvaras_vencidos, uf, razao_social, nome_fantasia, total_alvaras, alvaras_emitidos, responsible_user_id")
      .is("archived_at", null),
    
    // 2. Future expirations for 30, 60, 90 days projection
    supabase
      .from("company_alvaras")
      .select("id, data_vencimento")
      .gte("data_vencimento", today)
      .lte("data_vencimento", until90),
      
    // 3. Current month tasks for throughput
    supabase
      .from("alvara_tasks")
      .select("id, status")
      .gte("created_at", monthStart)
      .lte("created_at", monthEnd + "T23:59:59Z"),
      
    // 4. All active tasks for status distribution & frontend lane mapping
    supabase
      .from("alvara_tasks")
      .select(`
        id,
        title,
        status,
        company_alvaras (
          id,
          companies ( id, cnpj, razao_social, nome_fantasia ),
          alvaras ( id, name )
        )
      `)
      .neq("status", "cancelada"),
      
    // 5. User profiles for workload responsible names
    supabase
      .from("profiles")
      .select("id, display_name"),

    // 6. Tasks in past 6 months for history series
    supabase
      .from("alvara_tasks")
      .select("id, created_at, completed_at, status")
      .gte("created_at", sixMonthsAgoStr),

    // 7. Company alvaras with file attachments + group details for category distribution
    supabase
      .from("company_alvaras")
      .select(`
        id,
        arquivo_url,
        status,
        alvaras (
          id,
          name,
          group_id,
          alvara_groups!group_id (
            id,
            name,
            color
          )
        )
      `),

    // 8. Count of indefinite validity alvaras
    supabase
      .from("company_alvaras")
      .select("id", { count: "exact", head: true })
      .is("data_vencimento", null)
      .eq("status", "emitido"),

    // Baseline stats
    supabase.from("alvaras").select("id", { count: "exact", head: true }),
    
    supabase
      .from("companies")
      .select("id", { count: "exact", head: true })
      .is("archived_at", null)
      .eq("sync_status", "pending"),
      
    // Vencendo list for bottom section
    supabase
      .from("company_alvaras")
      .select(`
        id,
        numero,
        data_vencimento,
        status,
        companies!inner ( id, cnpj, razao_social, nome_fantasia ),
        alvaras ( id, name, group_id )
      `)
      .is("companies.archived_at", null)
      .not("data_vencimento", "is", null)
      .gte("data_vencimento", today)
      .lte("data_vencimento", until30)
      .order("data_vencimento", { ascending: true })
      .limit(5)
  ]);

  const summaryData = rCompaniesSummary.data || [];
  const totalEmpresas = summaryData.length;
  const ativas = summaryData.filter(c => c.alvaras_vencidos === 0).length; // "regular" or "active compliance"
  
  // 1. General Compliance Rate
  const complianceRate = totalEmpresas > 0 ? (ativas / totalEmpresas) * 100 : 0;

  // 2. Top 5 most critical companies (by alvaras vencidos)
  const topCriticalCompanies = summaryData
    .map(c => ({
      id: c.id,
      name: c.nome_fantasia || c.razao_social || "Empresa sem nome",
      vencidos: c.alvaras_vencidos || 0
    }))
    .filter(c => c.vencidos > 0)
    .sort((a, b) => b.vencidos - a.vencidos)
    .slice(0, 5);

  // 3. Expirations projection in 30, 60, 90 days
  let count30 = 0;
  let count60 = 0;
  let count90 = 0;
  
  rExpiringAlvaras.data?.forEach(item => {
    if (!item.data_vencimento) return;
    const vDate = item.data_vencimento;
    if (vDate <= until30) {
      count30++;
    } else if (vDate <= until60) {
      count60++;
    } else if (vDate <= until90) {
      count90++;
    }
  });

  // 4. Tasks completion throughput
  const totalMonthTasks = rMonthTasks.data?.length || 0;
  const completedMonthTasks = rMonthTasks.data?.filter(t => t.status === "concluida").length || 0;
  const taskCompletionRate = totalMonthTasks > 0 ? (completedMonthTasks / totalMonthTasks) * 100 : 0;

  // 5. Backlog distribution by status
  const taskStatusCounts: Record<string, number> = {
    pendente: 0,
    concluida: 0,
    cancelada: 0,
  };
  
  const activeTasksList = rActiveTasks.data || [];
  activeTasksList.forEach(t => {
    if (t.status === "pendente" || t.status === "concluida" || t.status === "cancelada") {
      taskStatusCounts[t.status]++;
    }
  });

  // 6. Workload by responsible user
  const profiles = rProfiles.data || [];
  const responsibleCounts: Record<string, number> = {};
  summaryData.forEach(c => {
    const uid = c.responsible_user_id || "unassigned";
    responsibleCounts[uid] = (responsibleCounts[uid] || 0) + 1;
  });

  const workloadByResponsible = profiles
    .map(p => ({
      id: p.id,
      name: p.display_name || "Sem nome",
      count: responsibleCounts[p.id] || 0
    }))
    .filter(r => r.count > 0)
    .sort((a, b) => b.count - a.count);

  if (responsibleCounts["unassigned"]) {
    workloadByResponsible.push({
      id: "unassigned",
      name: "Sem Responsável",
      count: responsibleCounts["unassigned"]
    });
  }

  // 7. Geographic concentration by state (UF)
  const ufCounts: Record<string, number> = {};
  summaryData.forEach(c => {
    const uf = c.uf || "Outros";
    ufCounts[uf] = (ufCounts[uf] || 0) + (c.total_alvaras || 0);
  });
  const ufDistribution = Object.entries(ufCounts)
    .map(([uf, count]) => ({ uf, count }))
    .sort((a, b) => b.count - a.count);

  // 8. Sazonal history (6 months timeline)
  // We want to group created and completed tasks by month name
  const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const timelineData: Array<{ monthIndex: number; monthName: string; created: number; completed: number }> = [];
  
  // Initialize last 6 months
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now);
    d.setMonth(d.getMonth() - i);
    timelineData.push({
      monthIndex: d.getMonth(),
      monthName: `${monthNames[d.getMonth()]}/${d.getFullYear().toString().slice(2)}`,
      created: 0,
      completed: 0
    });
  }

  rSixMonthTasks.data?.forEach(t => {
    const cDate = new Date(t.created_at);
    const compDate = t.completed_at ? new Date(t.completed_at) : null;
    
    // Increment created counts
    timelineData.forEach(month => {
      // created in month
      const matchCreated = cDate.getMonth() === month.monthIndex && cDate.getFullYear() === (2000 + parseInt(month.monthName.split("/")[1], 10));
      if (matchCreated) {
        month.created++;
      }
      
      // completed in month
      if (compDate) {
        const matchCompleted = compDate.getMonth() === month.monthIndex && compDate.getFullYear() === (2000 + parseInt(month.monthName.split("/")[1], 10));
        if (matchCompleted) {
          month.completed++;
        }
      }
    });
  });

  // Remove helper index from response
  const sazonalHistory = timelineData.map(({ monthName, created, completed }) => ({
    label: monthName,
    created,
    completed
  }));

  // 9. Document upload coverage rate & Categorization
  const alvarasWithGroups = rFileCounts.data || [];
  const totalAlvarasCount = alvarasWithGroups.length;
  const alvarasWithFileCount = alvarasWithGroups.filter(f => f.arquivo_url != null && f.arquivo_url !== "").length;
  const documentCoverageRate = totalAlvarasCount > 0 ? (alvarasWithFileCount / totalAlvarasCount) * 100 : 0;
  const alvarasVencidos = alvarasWithGroups.filter(f => f.status === "vencido").length;

  const categoryCounts: Record<string, { count: number; color: string }> = {};
  alvarasWithGroups.forEach(ca => {
    // Safely unpack ca.alvaras which can be parsed as an array or a single object by TS
    const alv: any = Array.isArray(ca.alvaras) ? ca.alvaras[0] : ca.alvaras;
    if (!alv) return;

    // Safely unpack alv.alvara_groups which can be parsed as an array or a single object by TS
    const group: any = Array.isArray(alv.alvara_groups) ? alv.alvara_groups[0] : alv.alvara_groups;

    const groupName = group?.name || "Sem Categoria";
    const groupColor = group?.color || "#94a3b8";
    if (!categoryCounts[groupName]) {
      categoryCounts[groupName] = { count: 0, color: groupColor };
    }
    categoryCounts[groupName].count++;
  });

  const alvarasPorCategoria = Object.entries(categoryCounts)
    .map(([name, data]) => ({
      name,
      color: data.color,
      count: data.count
    }))
    .sort((a, b) => b.count - a.count);

  // 10. Indefinite validity count
  const indefiniteValidityCount = rIndeterminados.count || 0;

  return NextResponse.json({
    kpis: {
      totalEmpresas,
      regularCompaniesCount: ativas,
      complianceRate,
      syncPendentes: rSyncPending.count || 0,
      totalAlvaras: rTotalAlvarasTipos.count || 0,
      alvarasVencidos,
      indefiniteValidityCount,
      documentCoverageRate,
      throughput: {
        total: totalMonthTasks,
        completed: completedMonthTasks,
        rate: taskCompletionRate
      },
      taskStatusCounts,
      expirations: {
        30: count30,
        60: count60,
        90: count90
      }
    },
    topCriticalCompanies,
    workloadByResponsible,
    ufDistribution,
    sazonalHistory,
    alvarasPorCategoria,
    activeTasks: activeTasksList,
    vencendoProx30Dias: rVencendoList.data || [],
  });
}
