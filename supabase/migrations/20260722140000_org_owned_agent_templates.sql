-- Duas camadas de template, na MESMA tabela (ver conversa com o usuário:
-- "quero criar a galeria curada, mas também quero que o cliente crie seus
-- próprios templates para reutilizar"):
--   organization_id IS NULL  -> galeria global curada (como já era: só admin
--                               de plataforma escreve, leitura pública se published)
--   organization_id = X      -> template privado da organização X, qualquer
--                               membro dessa org gerencia o seu (sem exigir
--                               publicação nem admin -- é só o "meu catálogo").
ALTER TABLE public.agent_templates
  ADD COLUMN organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

-- As duas policies antigas passam a valer SÓ pra linhas globais (organization_id
-- IS NULL) -- sem isso, uma org poderia marcar seu próprio template como
-- 'published' e vazar ele pra todo mundo via a policy de leitura global.
DROP POLICY IF EXISTS "Read published or admin" ON public.agent_templates;
CREATE POLICY "Read published or admin" ON public.agent_templates
  FOR SELECT TO public
  USING (organization_id IS NULL AND (status = 'published' OR is_platform_admin((select auth.uid()))));

DROP POLICY IF EXISTS "Admin write agent_templates" ON public.agent_templates;
CREATE POLICY "Admin write agent_templates" ON public.agent_templates
  FOR ALL TO public
  USING (organization_id IS NULL AND is_platform_admin((select auth.uid())))
  WITH CHECK (organization_id IS NULL AND is_platform_admin((select auth.uid())));

CREATE POLICY "Org manage own templates" ON public.agent_templates
  FOR ALL TO public
  USING (organization_id = get_user_org_id((select auth.uid())))
  WITH CHECK (organization_id = get_user_org_id((select auth.uid())));

CREATE INDEX idx_agent_templates_organization_id ON public.agent_templates(organization_id);
