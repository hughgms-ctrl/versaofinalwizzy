-- Histórico de execução de fluxos: costura da jornada + parada manual + resultado por nó.
--
-- CONTEXTO: flow_executions e flow_node_logs sempre existiram, mas nenhuma tela lia
-- esses dados. Ao expor "quem passou pelo fluxo e quem está nele agora", três
-- lacunas do modelo atual apareceram — e são estas colunas que as fecham.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. COSTURA DA JORNADA
--
-- PROBLEMA: um Atraso Inteligente não pausa a execução — o cron a FECHA como
-- 'completed' e manda o flow-execute criar uma execução NOVA no nó de retomada
-- (process-flow-timeouts, fase 1.8). Um contato que passa por 3 esperas vira 4
-- linhas soltas em flow_executions, sem nada que diga que são a mesma passagem.
-- Para a UI isso apareceria como 4 contatos diferentes, e a "duração no fluxo"
-- de cada trecho seria só o tempo depois da última espera.
--
-- SOLUÇÃO: cada retomada aponta para a execução que a originou
-- (resumed_from_execution_id) e carrega o id da PRIMEIRA execução da passagem
-- (root_execution_id). Assim a jornada inteira é um GROUP BY root_execution_id —
-- sem recursão na leitura, que é o que a tela faz o tempo todo.
--
-- Uma entrada nova no fluxo semanas depois nasce com root_execution_id = próprio
-- id, então continua sendo uma passagem separada no histórico (decisão de produto).
ALTER TABLE public.flow_executions
  ADD COLUMN IF NOT EXISTS resumed_from_execution_id uuid
    REFERENCES public.flow_executions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS root_execution_id uuid;

COMMENT ON COLUMN public.flow_executions.resumed_from_execution_id IS
  'Execução imediatamente anterior desta mesma passagem (preenchido ao retomar um atraso). NULL = início de passagem.';
COMMENT ON COLUMN public.flow_executions.root_execution_id IS
  'Primeira execução da passagem. Agrupa os trechos fatiados pelos atrasos numa jornada só. Para uma execução inicial, é o próprio id.';

-- Execuções que já existem são passagens de trecho único: cada uma é sua própria raiz.
-- Sem isso o histórico antigo apareceria com jornada vazia (root NULL não agrupa).
UPDATE public.flow_executions
  SET root_execution_id = id
  WHERE root_execution_id IS NULL;

-- Rede de segurança: qualquer INSERT que não informe a raiz (todo caminho de
-- entrada que não seja retomada) vira automaticamente raiz de si mesmo. Deixa a
-- garantia no banco em vez de depender de cada chamador do motor lembrar.
CREATE OR REPLACE FUNCTION public.set_flow_execution_root()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.root_execution_id IS NULL THEN
    NEW.root_execution_id := NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_flow_executions_root ON public.flow_executions;
CREATE TRIGGER trg_flow_executions_root
  BEFORE INSERT ON public.flow_executions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_flow_execution_root();

-- ───────────────────────────────────────────────────────────────────────────
-- 2. PARADA MANUAL
--
-- PROBLEMA: hoje não existe "tirar o contato do fluxo". O único cancelamento do
-- produto (follow-up de chat) grava status 'completed' e enfia o motivo em
-- error_message — a mesma coluna usada para erro real do motor. Com isso não dá
-- para distinguir, no histórico, quem terminou o fluxo de quem foi retirado dele,
-- nem quem retirou.
--
-- SOLUÇÃO: status 'cancelled' com autoria e motivo próprios. error_message volta
-- a significar só falha técnica.
ALTER TABLE public.flow_executions
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancel_reason text;

COMMENT ON COLUMN public.flow_executions.cancelled_at IS
  'Quando o contato foi retirado do fluxo manualmente. NULL = não foi parada manual.';
COMMENT ON COLUMN public.flow_executions.cancelled_by IS
  'Quem retirou o contato do fluxo (auth.users). NULL quando a parada foi automática/sistema.';
COMMENT ON COLUMN public.flow_executions.cancel_reason IS
  'Motivo da parada manual. Separado de error_message, que continua sendo só falha técnica do motor.';

-- ───────────────────────────────────────────────────────────────────────────
-- 3. RESULTADO POR NÓ
--
-- PROBLEMA: logNodeExecution grava a linha ANTES de o nó rodar, e output_data
-- nunca foi preenchido. Dava para ver por onde o contato passou, mas não se cada
-- passo deu certo — justamente o que se procura quando um fluxo "não funcionou".
--
-- SOLUÇÃO: o motor atualiza a linha ao terminar o nó. Vale só para execuções
-- novas; o histórico anterior fica com status NULL e a UI mostra esses passos
-- como "sem registro de resultado" em vez de inventar sucesso.
ALTER TABLE public.flow_node_logs
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS duration_ms integer;

COMMENT ON COLUMN public.flow_node_logs.status IS
  'Resultado do nó: success | failed | error. NULL em logs anteriores a esta migration (gravados antes da execução).';
COMMENT ON COLUMN public.flow_node_logs.duration_ms IS
  'Tempo de execução do nó em ms. Não inclui o tempo parado num atraso — atraso encerra o trecho.';

-- ───────────────────────────────────────────────────────────────────────────
-- 4. ÍNDICES
--
-- A tela lista execuções de UM fluxo por período, mais recentes primeiro: é este
-- índice que evita varrer a tabela inteira conforme o volume cresce.
CREATE INDEX IF NOT EXISTS idx_flow_executions_flow_started
  ON public.flow_executions(flow_id, started_at DESC);

-- Agrupamento da jornada (todos os trechos de uma passagem).
CREATE INDEX IF NOT EXISTS idx_flow_executions_root
  ON public.flow_executions(root_execution_id);

-- A linha do tempo lê os nós de vários trechos de uma vez (IN (...) + ordem
-- cronológica), então o índice precisa cobrir as duas colunas.
CREATE INDEX IF NOT EXISTS idx_flow_node_logs_execution_created
  ON public.flow_node_logs(flow_execution_id, created_at);

-- ───────────────────────────────────────────────────────────────────────────
-- 5. RETIRAR CONTATOS DO FLUXO
--
-- Parar um fluxo é DUAS escritas que precisam andar juntas: encerrar a execução
-- e devolver a conversa para atendimento humano. Feitas soltas pelo front, uma
-- falha no meio deixaria a conversa presa em modo IA sem fluxo nenhum vivo —
-- exatamente o estado que o cleanupFlowEnd do motor existe para evitar. Aqui é
-- uma transação só.
--
-- Recebe as RAÍZES das jornadas (é o que a tela lista) e cancela todos os
-- trechos vivos de cada uma.
--
-- SECURITY INVOKER de propósito: as policies de flow_executions/conversations
-- continuam valendo, então ninguém para fluxo de outra org. A checagem explícita
-- de org abaixo é defesa em profundidade e serve para dar erro claro em vez de
-- um silencioso "0 linhas".
CREATE OR REPLACE FUNCTION public.cancel_flow_executions(
  p_root_execution_ids uuid[],
  p_reason text DEFAULT NULL
)
RETURNS TABLE (execution_id uuid, conversation_id uuid)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_org uuid := get_user_org_id(auth.uid());
BEGIN
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Usuário sem organização';
  END IF;

  RETURN QUERY
  WITH cancelled AS (
    UPDATE public.flow_executions fe
      SET status = 'cancelled',
          cancelled_at = now(),
          cancelled_by = auth.uid(),
          cancel_reason = p_reason,
          completed_at = COALESCE(fe.completed_at, now()),
          -- Zera o despertador: com timeout_at preenchido, o cron continuaria
          -- varrendo esta linha para mandar follow-up de um fluxo já encerrado.
          timeout_at = NULL
      WHERE fe.root_execution_id = ANY(p_root_execution_ids)
        AND fe.organization_id = v_org
        -- Só o que ainda está vivo. Sem isto, reparar uma jornada já concluída
        -- reescreveria o histórico dela como "cancelada".
        AND fe.status IN ('running', 'waiting_input', 'waiting_delay')
      RETURNING fe.id, fe.conversation_id
  ),
  -- Devolve para atendimento humano só as conversas que ficaram SEM nenhum
  -- fluxo vivo. Uma conversa pode ter um fluxo pai ainda rodando (sub-fluxos),
  -- e nesse caso derrubar o service_mode mataria o pai — o mesmo cuidado que o
  -- cleanupFlowEnd do motor toma.
  --
  -- O `live.id NOT IN (cancelled)` é essencial: as CTEs enxergam o snapshot do
  -- INÍCIO do comando, então sem ele as execuções que acabamos de cancelar
  -- ainda apareceriam como vivas aqui e nenhuma conversa seria liberada.
  freed AS (
    SELECT DISTINCT c.conversation_id
      FROM cancelled c
     WHERE NOT EXISTS (
       SELECT 1 FROM public.flow_executions live
        WHERE live.conversation_id = c.conversation_id
          AND live.status IN ('running', 'waiting_input', 'waiting_delay')
          AND live.id NOT IN (SELECT id FROM cancelled)
     )
  ),
  released AS (
    UPDATE public.conversations conv
       SET service_mode = 'humano',
           ai_agent_id = NULL
      FROM freed
     WHERE conv.id = freed.conversation_id
       AND conv.organization_id = v_org
     RETURNING conv.id
  )
  SELECT c.id, c.conversation_id FROM cancelled c;
END;
$$;

COMMENT ON FUNCTION public.cancel_flow_executions(uuid[], text) IS
  'Retira contatos de um fluxo: cancela os trechos vivos das jornadas informadas e devolve para atendimento humano as conversas que ficaram sem fluxo ativo. Recebe root_execution_id.';

GRANT EXECUTE ON FUNCTION public.cancel_flow_executions(uuid[], text) TO authenticated;
