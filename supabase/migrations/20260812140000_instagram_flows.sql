-- Fluxos visuais do Instagram — fundação (Fase C do plano de produto).
--
-- DECISÃO DE ARQUITETURA (opção C2, registrada em docs/WIZZY_ENGAGE_PLANO_PRODUTO.md):
-- a interface do construtor é compartilhada com a do WhatsApp, mas o
-- armazenamento e o motor são próprios do Instagram.
--
-- Por que não reusar `flows`/`flow_executions`: aquelas tabelas amarram
-- `conversation_id` a `conversations`, que é a tabela do WhatsApp — o Instagram
-- tem `instagram_conversations`. Fazer as duas caberem na mesma coluna exigiria
-- refatorar o motor que hoje roda a operação de WhatsApp em produção. Tabelas
-- separadas custam alguma duplicação e, em troca, o Instagram não consegue
-- quebrar o WhatsApp. Quando o módulo amadurecer, a unificação continua
-- possível — e aí com o benefício de já saber o que o Instagram precisa.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. FLUXOS
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.instagram_flows (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  instagram_account_id UUID NOT NULL REFERENCES public.instagram_accounts(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT false,

  -- Mesmos gatilhos das regras simples (migration 20260812120000). Um fluxo e
  -- uma regra disputam o mesmo evento: quem quiser algo simples usa a regra,
  -- quem precisa de ramificação usa o fluxo.
  trigger_type TEXT NOT NULL DEFAULT 'comment_keyword'
    CHECK (trigger_type IN (
      'comment_keyword', 'dm_keyword', 'story_reply', 'story_mention', 'first_message'
    )),
  trigger_config JSONB NOT NULL DEFAULT '{}',

  -- Grafo do React Flow, no mesmo formato da tabela `flows`: assim os
  -- componentes de canvas são reaproveitados sem tradução.
  nodes JSONB NOT NULL DEFAULT '[]',
  edges JSONB NOT NULL DEFAULT '[]',
  variables JSONB NOT NULL DEFAULT '{}',

  triggers_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_instagram_flows_account
  ON public.instagram_flows(instagram_account_id, trigger_type)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_instagram_flows_org
  ON public.instagram_flows(organization_id);

COMMENT ON TABLE public.instagram_flows IS
  'Fluxos visuais do Instagram. Grafo no formato do React Flow, igual à tabela flows do WhatsApp, mas com motor próprio (instagram-flow-execute).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. EXECUÇÕES
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.instagram_flow_executions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  flow_id UUID NOT NULL REFERENCES public.instagram_flows(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.instagram_conversations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.instagram_contacts(id) ON DELETE CASCADE,

  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'waiting_input', 'waiting_delay', 'completed', 'failed', 'cancelled')),
  current_node_id TEXT,
  variables JSONB NOT NULL DEFAULT '{}',
  execution_log JSONB NOT NULL DEFAULT '[]',

  -- Quando o cron deve retomar: fim de uma espera longa, ou desistência de
  -- esperar resposta. Uma edge function não sobrevive a um "espere 2 dias",
  -- então a execução é estacionada no banco e retomada de fora.
  timeout_at TIMESTAMP WITH TIME ZONE,

  -- Origem do disparo, para o log responder "por que este contato entrou".
  trigger_source JSONB NOT NULL DEFAULT '{}',

  -- De qual estado a retomada partiu. A reserva do cron troca o status para
  -- 'running', então sem isto o valor anterior se perde — e uma retomada que
  -- falhasse seria devolvida como 'waiting_delay' mesmo tendo sido
  -- 'waiting_input', fazendo o fluxo seguir pelo caminho errado depois.
  parked_status TEXT,

  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Consulta do cron: o que está estacionado e já venceu.
CREATE INDEX IF NOT EXISTS idx_instagram_flow_executions_due
  ON public.instagram_flow_executions(timeout_at)
  WHERE status IN ('waiting_input', 'waiting_delay');

-- Consulta do webhook: esta conversa tem execução esperando resposta?
CREATE INDEX IF NOT EXISTS idx_instagram_flow_executions_conversation
  ON public.instagram_flow_executions(conversation_id, status);

CREATE INDEX IF NOT EXISTS idx_instagram_flow_executions_flow
  ON public.instagram_flow_executions(flow_id, started_at DESC);

COMMENT ON COLUMN public.instagram_flow_executions.timeout_at IS
  'Quando retomar esta execução estacionada. Preenchido em espera longa (waiting_delay) e em espera por resposta com desistência configurada (waiting_input).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. UMA EXECUÇÃO VIVA POR CONVERSA
--
-- Sem isto, um contato que comenta três vezes em dois minutos entra três vezes
-- no mesmo fluxo e recebe tudo em triplicata. O índice parcial deixa o banco
-- recusar a segunda entrada enquanto a primeira não terminar — a checagem no
-- código não bastaria, porque dois webhooks concorrentes leriam "não tem
-- nenhuma" ao mesmo tempo.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE UNIQUE INDEX IF NOT EXISTS idx_instagram_flow_executions_one_live
  ON public.instagram_flow_executions(conversation_id)
  WHERE status IN ('running', 'waiting_input', 'waiting_delay');

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. RLS
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.instagram_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_flow_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view instagram flows from their organization"
  ON public.instagram_flows FOR SELECT
  USING (organization_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Users can manage instagram flows from their organization"
  ON public.instagram_flows FOR ALL
  USING (organization_id = public.get_user_org_id(auth.uid()))
  WITH CHECK (organization_id = public.get_user_org_id(auth.uid()));

-- Execuções são escritas só pelo motor (service role); a organização lê para
-- acompanhar quem passou pelo fluxo.
CREATE POLICY "Users can view instagram flow executions from their organization"
  ON public.instagram_flow_executions FOR SELECT
  USING (organization_id = public.get_user_org_id(auth.uid()));

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. updated_at
-- ═══════════════════════════════════════════════════════════════════════════
DROP TRIGGER IF EXISTS set_updated_at_instagram_flows ON public.instagram_flows;
CREATE TRIGGER set_updated_at_instagram_flows
  BEFORE UPDATE ON public.instagram_flows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. RESERVA ATÔMICA PARA A RETOMADA
--
-- Mesmo padrão de claim_instagram_followups: o cron pode se sobrepor a si
-- mesmo, e retomar a mesma execução duas vezes reenviaria as mensagens do nó
-- seguinte. O UPDATE ... RETURNING numa instrução só impede isso.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.claim_instagram_flow_resumes(p_limit INTEGER DEFAULT 25)
RETURNS SETOF public.instagram_flow_executions
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.instagram_flow_executions
     SET status = 'running',
         -- No UPDATE o lado direito ainda enxerga o valor ANTIGO, então isto
         -- preserva de onde a execução estava parada.
         parked_status = status
   WHERE id IN (
     SELECT id
       FROM public.instagram_flow_executions
      WHERE timeout_at IS NOT NULL
        AND timeout_at <= now()
        AND status IN ('waiting_input', 'waiting_delay')
      ORDER BY timeout_at
      FOR UPDATE SKIP LOCKED
      LIMIT p_limit
   )
  RETURNING *;
$$;

COMMENT ON FUNCTION public.claim_instagram_flow_resumes(INTEGER) IS
  'Reserva atomicamente execuções de fluxo do Instagram vencidas, para o cron retomá-las sem risco de execução dupla.';

REVOKE ALL ON FUNCTION public.claim_instagram_flow_resumes(INTEGER) FROM PUBLIC, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. CRON DE RETOMADA
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'instagram-flow-timeouts',
      '* * * * *',
      $cron$
        SELECT net.http_post(
          url := 'https://zaobtetbjpuzibjymhzw.supabase.co/functions/v1/instagram-flow-timeouts',
          headers := '{"Content-Type": "application/json"}'::jsonb,
          body := '{}'::jsonb
        );
      $cron$
    );
  END IF;
END $$;
