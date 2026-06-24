-- Permitir vincular regras de qualificação a um fluxo + nó específico
-- (regras específicas do contexto do fluxo, não do agente base)

ALTER TABLE public.agent_qualification_rules
  ALTER COLUMN agent_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS flow_id uuid REFERENCES public.flows(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS node_id text;

CREATE INDEX IF NOT EXISTS idx_agent_qualification_rules_flow_node
  ON public.agent_qualification_rules (flow_id, node_id)
  WHERE flow_id IS NOT NULL;

-- Garantir que pelo menos um escopo (agente OU fluxo+nó) esteja preenchido
ALTER TABLE public.agent_qualification_rules
  DROP CONSTRAINT IF EXISTS agent_qualification_rules_scope_check;

ALTER TABLE public.agent_qualification_rules
  ADD CONSTRAINT agent_qualification_rules_scope_check
  CHECK (agent_id IS NOT NULL OR (flow_id IS NOT NULL AND node_id IS NOT NULL));;
