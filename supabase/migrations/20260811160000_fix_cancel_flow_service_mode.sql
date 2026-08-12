-- Corrige cancel_flow_executions: o enum service_mode não tem 'humano'.
--
-- A "Retirar do fluxo" em massa estourava
--   invalid input value for enum service_mode: "humano"
-- e a ação inteira era abortada (a transação toda cai, então nem os
-- flow_executions eram cancelados).
--
-- Os valores válidos são ('ia','ativo','pendente','arquivado'), definidos na
-- migration 20260130071949. 'ativo' é o que o app usa para "humano no comando"
-- — é o valor que a tela de conversa grava ao assumir o atendimento.
--
-- O corpo abaixo é idêntico ao da 20260811130000, trocando só esse literal.
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
       -- 'ativo' = humano no comando. Ver comentário no topo.
       SET service_mode = 'ativo',
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

-- Repara o estrago silencioso das edge functions, que gravavam 'humano' há
-- meses sem checar o erro: o UPDATE falhava e a conversa ficava presa em
-- service_mode='ia' depois do fluxo terminar, com a IA seguindo no comando.
--
-- Escopo deliberadamente estreito. Só entra a conversa que:
--   1. está em 'ia' E
--   2. já passou por um fluxo que TERMINOU (é o caso que a edge function
--      tentou e não conseguiu limpar) E
--   3. não tem nenhum fluxo vivo agora.
--
-- O item 2 é o que evita pegar conversa que está em IA pela configuração de
-- agente da organização, sem fluxo nenhum envolvido — essas devem continuar
-- em 'ia'.
UPDATE public.conversations conv
   SET service_mode = 'ativo',
       ai_agent_id = NULL
 WHERE conv.service_mode = 'ia'
   AND EXISTS (
     SELECT 1 FROM public.flow_executions fe
      WHERE fe.conversation_id = conv.id
        AND fe.status IN ('completed', 'cancelled', 'failed')
   )
   AND NOT EXISTS (
     SELECT 1 FROM public.flow_executions fe
      WHERE fe.conversation_id = conv.id
        AND fe.status IN ('running', 'waiting_input', 'waiting_delay')
   );
