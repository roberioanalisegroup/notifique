-- Permite criar tipo de alvará sem grupo (atribuir depois em editar)

alter table public.alvaras alter column group_id drop not null;
