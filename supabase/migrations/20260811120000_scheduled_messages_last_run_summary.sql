-- Resumo imutável da última execução de um disparo.
--
-- PROBLEMA: o painel do disparo lê scheduled_message_contacts, mas essa tabela
-- é REUTILIZADA entre ocorrências de uma recorrência — resetProgressForRecurrence()
-- apaga as linhas (alvo por tag) ou zera para 'pending' (manual/single) assim que
-- uma ocorrência fecha. Resultado: o histórico da execução de hoje desaparece
-- quando a de amanhã começa, e durante a próxima execução o painel mostraria os
-- números da execução NOVA no lugar dos da antiga.
--
-- SOLUÇÃO: ao fechar cada execução, o motor grava aqui um retrato congelado
-- (total/enviados/não entregues + quem não recebeu). O painel passa a preferir
-- este resumo quando o disparo não está rodando, então o dado fica acessível
-- para sempre e nunca é contaminado por outra execução.
--
-- Formato de last_run_summary:
--   {
--     "finished_at": "2026-08-11T12:00:00Z",
--     "total": 500, "sent": 480, "failed": 20,
--     "undelivered": [{ "name": "Fulano", "phone": "5511..." }, ...]  -- teto de 200
--   }
-- Sem mensagens de erro técnicas: o produto mostra QUEM não recebeu, não o motivo cru.
ALTER TABLE public.scheduled_messages
  ADD COLUMN IF NOT EXISTS last_run_summary jsonb;

COMMENT ON COLUMN public.scheduled_messages.last_run_summary IS
  'Retrato congelado da última execução (total/sent/failed/undelivered). Preenchido por process-scheduled-messages ao finalizar, antes do reset de recorrência.';
