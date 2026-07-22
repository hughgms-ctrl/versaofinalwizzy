-- Galeria de templates de agentes + Testador em massa (Etapa 4 da spec
-- SPEC_TEMPLATES_TESTADOR.md v2). Tabelas novas, sem tocar em flows/ai_agents/campaigns
-- existentes -- agent_instances só referencia essas tabelas, não as altera.

-- ─────────────────────────────────────────────────────────────────────────────
-- agent_templates: curado, GLOBAL (não por organização) -- é a "prateleira" de
-- templates que qualquer org pode aplicar. Guarda dois snapshots (flow + agente)
-- em vez de um blob único, espelhando as colunas reais de flows/ai_agents.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.agent_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  category text,
  flow_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  agent_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  suggested_trigger_keyword text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  conversion_rate numeric,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read published or admin" ON public.agent_templates
  FOR SELECT TO public
  USING (status = 'published' OR is_platform_admin((select auth.uid())));

CREATE POLICY "Admin write agent_templates" ON public.agent_templates
  FOR ALL TO public
  USING (is_platform_admin((select auth.uid())))
  WITH CHECK (is_platform_admin((select auth.uid())));

-- ─────────────────────────────────────────────────────────────────────────────
-- agent_instances: por organização. "Aplicar um template" = inserir uma linha em
-- flows a partir do flow_snapshot, uma em ai_agents a partir do agent_snapshot, e
-- uma aqui amarrando os dois + o template de origem (fork total, sem sync
-- automático de volta pro template -- ver Parte 1 da spec).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.agent_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.agent_templates(id) ON DELETE SET NULL,
  flow_id uuid NOT NULL REFERENCES public.flows(id) ON DELETE CASCADE,
  ai_agent_id uuid NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_instances_organization_id ON public.agent_instances(organization_id);

ALTER TABLE public.agent_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org access agent_instances" ON public.agent_instances
  FOR ALL TO public
  USING (organization_id = get_user_org_id((select auth.uid())))
  WITH CHECK (organization_id = get_user_org_id((select auth.uid())));

-- ─────────────────────────────────────────────────────────────────────────────
-- agent_test_personas: curado, GLOBAL -- mesmo padrão de agent_templates (uma
-- biblioteca compartilhada de personas de teste, tipo "Dona Marta, 58 anos...").
-- Leitura liberada pra qualquer usuário autenticado (não é dado sensível); escrita
-- só admin de plataforma, quem cura o catálogo.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.agent_test_personas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  traits jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_test_personas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read agent_test_personas" ON public.agent_test_personas
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admin write agent_test_personas" ON public.agent_test_personas
  FOR ALL TO public
  USING (is_platform_admin((select auth.uid())))
  WITH CHECK (is_platform_admin((select auth.uid())));

-- ─────────────────────────────────────────────────────────────────────────────
-- agent_test_sessions: uma rodada de teste (manual ou em massa) contra um
-- template OU uma instância (target_type/target_id polimórfico, como na spec).
--
-- DESVIO da spec original: adicionei organization_id (a spec só listava
-- target_type/target_id/mode/created_at). Sem uma coluna própria, o RLS teria que
-- resolver a org fazendo JOIN condicional pelo target_id polimórfico (que aponta
-- pra tabelas diferentes dependendo do target_type) -- inviável numa policy só.
-- Sempre a organização de QUEM está testando (mesmo testando um template global
-- ainda não aplicado por ninguém) -- não fica nulo nunca: quem visualiza o
-- template em si já é decidido pelo RLS de agent_templates (publicado ou admin);
-- aqui só registra em nome de qual organização a sessão foi rodada.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.agent_test_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('template', 'instance')),
  target_id uuid NOT NULL,
  mode text NOT NULL DEFAULT 'manual' CHECK (mode IN ('manual', 'mass')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_test_sessions_organization_id ON public.agent_test_sessions(organization_id);
CREATE INDEX idx_agent_test_sessions_target ON public.agent_test_sessions(target_type, target_id);

ALTER TABLE public.agent_test_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org access agent_test_sessions" ON public.agent_test_sessions
  FOR ALL TO public
  USING (organization_id = get_user_org_id((select auth.uid())))
  WITH CHECK (organization_id = get_user_org_id((select auth.uid())));

-- ─────────────────────────────────────────────────────────────────────────────
-- agent_test_conversations: uma conversa simulada (persona x agente) dentro de
-- uma sessão, já avaliada pelo avaliador. Acesso via join em agent_test_sessions
-- (não tem organization_id própria, pra não duplicar a mesma decisão de escopo).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.agent_test_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.agent_test_sessions(id) ON DELETE CASCADE,
  persona_id uuid NOT NULL REFERENCES public.agent_test_personas(id) ON DELETE CASCADE,
  transcript jsonb NOT NULL DEFAULT '[]'::jsonb,
  goal_reached boolean,
  score numeric,
  evaluation_notes jsonb,
  round_number int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_test_conversations_session_id ON public.agent_test_conversations(session_id);

ALTER TABLE public.agent_test_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org access agent_test_conversations" ON public.agent_test_conversations
  FOR ALL TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.agent_test_sessions s
      WHERE s.id = agent_test_conversations.session_id
        AND s.organization_id = get_user_org_id((select auth.uid()))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.agent_test_sessions s
      WHERE s.id = agent_test_conversations.session_id
        AND s.organization_id = get_user_org_id((select auth.uid()))
    )
  );
