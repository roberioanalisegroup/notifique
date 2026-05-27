-- 1. Tornar os nomes de alvarás únicos
-- Nota: se houver duplicados, o Supabase impedirá a execução. Limpe duplicados antes, se houver.
ALTER TABLE public.alvaras ADD CONSTRAINT alvaras_name_key UNIQUE (name);

-- 2. Criar a tabela de associação Muitos-para-Muitos entre Alvarás e Grupos
CREATE TABLE IF NOT EXISTS public.alvara_group_links (
  alvara_id uuid not null references public.alvaras(id) on delete cascade,
  group_id uuid not null references public.alvara_groups(id) on delete cascade,
  primary key (alvara_id, group_id)
);

-- 3. Migrar os dados de grupo existentes para a nova tabela associativa
INSERT INTO public.alvara_group_links (alvara_id, group_id)
SELECT id, group_id FROM public.alvaras
WHERE group_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 4. Habilitar RLS (Row Level Security) na nova tabela
ALTER TABLE public.alvara_group_links ENABLE ROW LEVEL SECURITY;

-- 5. Criar a política de segurança de acesso total para usuários autenticados
CREATE POLICY "auth_full" on public.alvara_group_links for all using (auth.role() = 'authenticated');
