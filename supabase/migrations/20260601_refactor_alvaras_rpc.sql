-- ==========================================
-- MIGRATION: 20260601_refactor_alvaras_rpc.sql
-- DESCRIÇÃO: Procedure transacional complete_alvara_task em PL/pgSQL
-- ==========================================

create or replace function public.complete_alvara_task(
  p_task_id uuid,
  p_issue_date date,
  p_expiration_date date,
  p_is_indefinite boolean,
  p_file_path text,
  p_file_name text,
  p_file_size bigint,
  p_file_mime text,
  p_notes text,
  p_user_id uuid
) returns jsonb as $$
declare
  v_link_id uuid;
  v_doc_id uuid;
  v_next_due date;
  v_alvara_id uuid;
  v_prazo_inicio integer;
  v_frequencia text;
  v_weekend_adjust text;
  v_next_start_after date;
  v_exige_anexo boolean;
  v_link_archived timestamptz;
  v_monitoring_status text; -- Variável isolada declarada para evitar corromper v_frequencia
  
  -- Auxiliares de concorrência e histórico
  v_old_status text;
  v_calc_date date;
  v_day_of_week integer;
begin
  -- 1. Validar e travar a tarefa atual
  select company_alvara_id, status into v_link_id, v_old_status 
  from public.alvara_tasks 
  where id = p_task_id and status not in ('concluida', 'cancelada') for update;
  if not found then
    raise exception 'Tarefa indisponível, inexistente ou já encerrada.';
  end if;

  -- 2. Validar o Vínculo Associado (Garantir existência, não arquivamento e não suspensão)
  -- SELECT INTO corrigido para usar v_monitoring_status
  select ca.alvara_id,
         ca.archived_at,
         ca.monitoring_status,
         a.anexo_obrigatorio,
         coalesce(ca.frequencia_override, a.frequencia),
         a.prazo_inicio_dias,
         a.weekend_adjust
  into v_alvara_id,
       v_link_archived,
       v_monitoring_status,
       v_exige_anexo,
       v_frequencia,
       v_prazo_inicio,
       v_weekend_adjust
  from public.company_alvaras ca
  join public.alvaras a on a.id = ca.alvara_id
  where ca.id = v_link_id;

  if not found then
    raise exception 'Vínculo empresa-alvará não encontrado no sistema.';
  end if;

  -- Validação estrita do estado do vínculo
  if v_link_archived is not null or v_monitoring_status = 'suspenso' then
    raise exception 'Não é possível concluir tarefas de alvarás arquivados ou suspensos.';
  end if;

  -- 3. Validações Rígidas de Parâmetros e Datas para Novos Documentos
  if p_issue_date is null then
    raise exception 'A data de emissão é obrigatória.';
  end if;

  if not p_is_indefinite and p_expiration_date is null then
    raise exception 'A data de vencimento é obrigatória para validade determinada.';
  end if;

  if not p_is_indefinite and p_expiration_date < p_issue_date then
    raise exception 'A data de vencimento não pode ser anterior à data de emissão.';
  end if;

  if v_exige_anexo and (p_file_path is null or trim(p_file_path) = '') then
    raise exception 'Este tipo de alvará exige anexo de arquivo para conclusão.';
  end if;

  -- 4. Marcar documentos anteriores como não vigentes
  update public.company_alvara_documents 
  set is_current = false, replaced_at = now(), replaced_by = p_user_id 
  where company_alvara_id = v_link_id and is_current = true;

  -- 5. Inserir o novo documento emitido
  insert into public.company_alvara_documents (
    company_alvara_id, issue_date, expiration_date, is_indefinite, file_path, file_name, file_size, file_mime_type, is_current, source_task_id, notes, created_by
  ) values (
    v_link_id, p_issue_date, 
    case when p_is_indefinite then null else p_expiration_date end, 
    p_is_indefinite, p_file_path, p_file_name, p_file_size, p_file_mime, true, p_task_id, p_notes, p_user_id
  ) returning id into v_doc_id;

  -- 6. Concluir a tarefa atual
  update public.alvara_tasks set
    status = 'concluida', result_document_id = v_doc_id, completed_at = now(), completed_by = p_user_id, updated_at = now()
  where id = p_task_id;

  -- 7. Gravar Histórico Operacional da Tarefa (Dinâmico com v_old_status)
  insert into public.alvara_task_history (task_id, event_type, from_status, to_status, description, metadata, created_by)
  values (
    p_task_id, 'completed', v_old_status, 'concluida', 
    'Tarefa concluída. Emissão de novo documento registrada com sucesso.', 
    jsonb_build_object('document_id', v_doc_id), 
    p_user_id
  );

  -- 8. Gravar Histórico Documental (Auditoria de Ponta a Ponta)
  insert into public.company_alvara_document_history (company_alvara_id, document_id, task_id, event_type, description, metadata, created_by)
  values (
    v_link_id, v_doc_id, p_task_id, 'document_created', 
    'Novo documento emitido e definido como atual/vigente do alvará.', 
    jsonb_build_object('issue_date', p_issue_date, 'expiration_date', p_expiration_date, 'is_indefinite', p_is_indefinite), 
    p_user_id
  );

  -- 9. FLUXO OPERACIONAL DE TAREFAS FUTURAS
  -- Regra 9.1: Validade indeterminada não gera próxima tarefa
  if p_is_indefinite then
    return jsonb_build_object('success', true, 'document_id', v_doc_id, 'next_due', null, 'message', 'Validade indeterminada ativa. Próxima tarefa de renovação não é requerida.');
  end if;

  -- Regra 9.2: Frequência personalizada não gera tarefa automática sem entrada manual
  if v_frequencia = 'personalizada' then
    return jsonb_build_object('success', true, 'document_id', v_doc_id, 'next_due', null, 'message', 'Frequência personalizada ativa. Renovação futura exige planejamento manual.');
  end if;

  -- Regra 9.3: Calcular ciclo futuro
  if p_expiration_date is not null then
    v_next_due := p_expiration_date;

    -- Regra 9.4: start_after calculado e ajustado conforme weekend_adjust
    -- Nomenclatura Padronizada na Base de dados e Código: 'none', 'postpone', 'anticipate'
    v_calc_date := v_next_due - coalesce(v_prazo_inicio, 30);
    v_day_of_week := extract(isodow from v_calc_date); -- 1: Segunda ... 7: Domingo

    if v_weekend_adjust = 'postpone' then
      if v_day_of_week = 6 then v_calc_date := v_calc_date + 2; -- Sábado -> Segunda
      elsif v_day_of_week = 7 then v_calc_date := v_calc_date + 1; -- Domingo -> Segunda
      end if;
    elsif v_weekend_adjust = 'anticipate' then
      if v_day_of_week = 6 then v_calc_date := v_calc_date - 1; -- Sábado -> Sexta
      elsif v_day_of_week = 7 then v_calc_date := v_calc_date - 2; -- Domingo -> Sexta
      end if;
    end if;

    v_next_start_after := v_calc_date;

    -- Regra 9.5: Prevenir duplicidade concorrente de tarefas abertas do ciclo
    if not exists (
      select 1 from public.alvara_tasks 
      where company_alvara_id = v_link_id 
        and task_type = 'renovacao' 
        and status in ('pendente', 'em_andamento', 'com_impedimento')
        and due_date = v_next_due
    ) then
      insert into public.alvara_tasks (
        company_alvara_id, task_type, status, due_date, start_after, created_by
      ) values (
        v_link_id, 'renovacao', 'pendente', v_next_due, v_next_start_after, p_user_id
      );
    end if;
  end if;

  return jsonb_build_object('success', true, 'document_id', v_doc_id, 'next_due', v_next_due);
exception when others then
  raise;
end;
$$ language plpgsql;
