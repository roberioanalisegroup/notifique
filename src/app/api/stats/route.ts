import { getSupabaseForRequest } from "@/lib/api-auth";
import { endOfMonth, startOfMonth } from "date-fns";
import { NextRequest, NextResponse } from "next/server";
import { computeDocumentStatus } from "@/lib/alvara-status";

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
    rIndefiniteValidityCount,
    rTotalAlvarasTipos,
    rSyncPending,
    rVencendoList,
    rCompanyAlvarasLinks
  ] = await Promise.all([
    // 1. Fetch active companies directly from the table
    supabase
      .from("companies")
      .select("id, cnpj, uf, razao_social, nome_fantasia, responsible_user_id")
      .is("archived_at", null),
    
    // 2. Future expirations for 30, 60, 90 days projection
    supabase
      .from("company_alvara_documents")
      .select("id, expiration_date")
      .eq("is_current", true)
      .gte("expiration_date", today)
      .lte("expiration_date", until90),
      
    // 3. Current month tasks for throughput
    supabase
      .from("alvara_tasks")
      .select("id, status")
      .gte("created_at", monthStart)
      .lte("created_at", monthEnd + "T23:59:59Z"),
      
    // 4. All active tasks for status distribution
    supabase
      .from("alvara_tasks")
      .select(`
        id,
        created_at,
        title,
        status,
        notes,
        completed_at,
        due_date,
        inicio_obrigatorio_ate,
        company_alvaras (
          id,
          companies (
            id,
            cnpj,
            razao_social,
            nome_fantasia,
            responsible:profiles ( id, display_name )
          ),
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

    // 7. Company alvara current documents with file path + group details
    supabase
      .from("company_alvara_documents")
      .select(`
        id,
        file_path,
        expiration_date,
        company_alvaras!company_alvara_id (
          id,
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
        )
      `)
      .eq("is_current", true),

    // 8. Count of indefinite validity alvaras
    supabase
      .from("company_alvara_documents")
      .select("id", { count: "exact", head: true })
      .eq("is_current", true)
      .eq("is_indefinite", true),

    // Baseline stats
    supabase.from("alvaras").select("id", { count: "exact", head: true }),
    
    supabase
      .from("companies")
      .select("id", { count: "exact", head: true })
      .is("archived_at", null)
      .eq("sync_status", "pending"),
      
    // Vencendo list for bottom section
    supabase
      .from("company_alvara_documents")
      .select(`
        id,
        expiration_date,
        company_alvaras!company_alvara_id (
          id,
          numero,
          companies!inner ( id, cnpj, razao_social, nome_fantasia ),
          alvaras ( id, name, group_id )
        )
      `)
      .is("company_alvaras.companies.archived_at", null)
      .eq("is_current", true)
      .not("expiration_date", "is", null)
      .gte("expiration_date", today)
      .lte("expiration_date", until30)
      .order("expiration_date", { ascending: true })
      .limit(5),

    // 12. Active company_alvaras links for summary calculations joined with their documents
    supabase
      .from("company_alvaras")
      .select(`
        id,
        company_id,
        status,
        company_alvara_documents (
          id,
          issue_date,
          expiration_date,
          is_indefinite,
          is_current
        )
      `)
      .is("archived_at", null)
  ]);

  const companiesList = rCompaniesSummary.data || [];
  const alvarasLinks = rCompanyAlvarasLinks.data || [];

  // Compute alvara status counts for each company in-memory
  const alvarasByCompany: Record<string, {
    total_alvaras: number;
    alvaras_emitidos: number;
    alvaras_pendentes: number;
    alvaras_vencidos: number;
    alvaras_notificados: number;
  }> = {};

  alvarasLinks.forEach(link => {
    if (!link.company_id) return;
    if (!alvarasByCompany[link.company_id]) {
      alvarasByCompany[link.company_id] = {
        total_alvaras: 0,
        alvaras_emitidos: 0,
        alvaras_pendentes: 0,
        alvaras_vencidos: 0,
        alvaras_notificados: 0
      };
    }
    const counts = alvarasByCompany[link.company_id];
    counts.total_alvaras++;

    // Find the active document
    const currentDoc = (link.company_alvara_documents as any[])?.find(d => d.is_current);

    const docStatus = computeDocumentStatus(currentDoc, today);

    if (docStatus === "vigente" || docStatus === "indeterminado") {
      counts.alvaras_emitidos++;
    } else {
      counts.alvaras_pendentes++;
    }

    if (docStatus === "vencido") {
      counts.alvaras_vencidos++;
    }
  });

  // Emulate companies_alvara_summary view signature
  const summaryData = companiesList.map(c => {
    const counts = alvarasByCompany[c.id] || {
      total_alvaras: 0,
      alvaras_emitidos: 0,
      alvaras_pendentes: 0,
      alvaras_vencidos: 0,
      alvaras_notificados: 0
    };
    return {
      id: c.id,
      cnpj: c.cnpj,
      uf: c.uf,
      razao_social: c.razao_social,
      nome_fantasia: c.nome_fantasia,
      responsible_user_id: c.responsible_user_id,
      alvaras_vencidos: counts.alvaras_vencidos,
      alvaras_emitidos: counts.alvaras_emitidos,
      alvaras_pendentes: counts.alvaras_pendentes,
      total_alvaras: counts.total_alvaras,
      alvaras_notificados: counts.alvaras_notificados
    };
  });
  const totalEmpresas = summaryData.length;
  const ativas = summaryData.filter(c => c.total_alvaras > 0 && c.alvaras_vencidos === 0).length;
  
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
    if (!item.expiration_date) return;
    const vDate = item.expiration_date;
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
    em_andamento: 0,
    com_impedimento: 0,
    concluida: 0,
  };
  
  const activeTasksList = rActiveTasks.data || [];
  activeTasksList.forEach(t => {
    if (t.status in taskStatusCounts) {
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
  const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const timelineData: Array<{ monthIndex: number; monthName: string; created: number; completed: number }> = [];
  
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
    
    timelineData.forEach(month => {
      const matchCreated = cDate.getMonth() === month.monthIndex && cDate.getFullYear() === (2000 + parseInt(month.monthName.split("/")[1], 10));
      if (matchCreated) {
        month.created++;
      }
      
      if (compDate) {
        const matchCompleted = compDate.getMonth() === month.monthIndex && compDate.getFullYear() === (2000 + parseInt(month.monthName.split("/")[1], 10));
        if (matchCompleted) {
          month.completed++;
        }
      }
    });
  });

  const sazonalHistory = timelineData.map(({ monthName, created, completed }) => ({
    label: monthName,
    created,
    completed
  }));

  // 9. Document upload coverage rate & Categorization
  const alvarasWithGroups = rFileCounts.data || [];
  const totalAlvarasCount = alvarasLinks.length;
  const alvarasWithFileCount = alvarasWithGroups.filter(f => f.file_path != null && f.file_path !== "").length;
  const documentCoverageRate = totalAlvarasCount > 0 ? (alvarasWithFileCount / totalAlvarasCount) * 100 : 0;
  
  let alvarasVencidos = 0;
  Object.values(alvarasByCompany).forEach(c => {
    alvarasVencidos += c.alvaras_vencidos;
  });

  const categoryCounts: Record<string, { count: number; color: string }> = {};
  alvarasWithGroups.forEach((ca: any) => {
    const caLink = Array.isArray(ca.company_alvaras) ? ca.company_alvaras[0] : ca.company_alvaras;
    const alv: any = Array.isArray(caLink?.alvaras) ? caLink?.alvaras[0] : caLink?.alvaras;
    if (!alv) return;

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
  const indefiniteValidityCount = rIndefiniteValidityCount.count || 0;

  const scoreRegularidade = totalAlvarasCount > 0
    ? ((totalAlvarasCount - alvarasVencidos) / totalAlvarasCount) * 100
    : 100;

  // Adapt the bottom list output
  const vencendoProx30Dias = (rVencendoList.data || []).map((item: any) => {
    const caLink = Array.isArray(item.company_alvaras) ? item.company_alvaras[0] : item.company_alvaras;
    const alv: any = Array.isArray(caLink?.alvaras) ? caLink?.alvaras[0] : caLink?.alvaras;
    return {
      id: item.id,
      numero: caLink?.numero,
      data_vencimento: item.expiration_date,
      status: caLink?.status,
      companies: caLink?.companies,
      alvaras: alv
    };
  });

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
      scoreRegularidade,
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
    vencendoProx30Dias,
    companiesSummary: summaryData,
  });
}
