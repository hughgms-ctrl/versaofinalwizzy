-- Backfill de messages.organization_id (B11 — docs/REVISAO_ESCALA_LANCAMENTO.md)
--
-- Roda DEPOIS da migration 20260830160000_messages_organization_id.sql (coluna +
-- trigger). O trigger ja preenche tudo que entra a partir dali; este roteiro so
-- cobre o historico.
--
-- Sem pressa: o filtro do Realtime olha a linha que acabou de ser inserida, ou
-- seja, notificacao ja funciona com o backfill pela metade. O motivo de rodar
-- e nao deixar a coluna pela metade para os relatorios futuros.
--
-- Rodar UM PASSO POR VEZ no SQL Editor. Nao rodar o arquivo inteiro de uma vez.

-- =============================================================================
-- PASSO 1 — quanto falta
-- =============================================================================
SELECT count(*) AS mensagens_sem_org
  FROM public.messages
 WHERE organization_id IS NULL;

-- =============================================================================
-- PASSO 2 — indice temporario para achar as linhas pendentes
--
-- Sem ele cada lote vira um seq scan da tabela inteira. CONCURRENTLY nao pode
-- rodar dentro de transacao: execute esta linha SOZINHA.
-- =============================================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_backfill_org_null
  ON public.messages (id)
  WHERE organization_id IS NULL;

-- =============================================================================
-- PASSO 3 — o lote
--
-- Repita ate a saida ser 0. Cada execucao mexe em ate 20 mil linhas (alguns
-- segundos). Se a instancia estiver em pico de mensagens, espace as execucoes:
-- o UPDATE escreve WAL e concorre com a entrada de mensagens.
-- =============================================================================
WITH lote AS (
  SELECT m.id, c.organization_id
    FROM public.messages m
    JOIN public.conversations c ON c.id = m.conversation_id
   WHERE m.organization_id IS NULL
   LIMIT 20000
)
UPDATE public.messages m
   SET organization_id = lote.organization_id
  FROM lote
 WHERE m.id = lote.id;

-- =============================================================================
-- PASSO 4 — limpeza
--
-- Quando o PASSO 1 voltar 0 (ou so orfas, ver PASSO 5), o indice temporario nao
-- serve mais. Executar SOZINHA.
-- =============================================================================
DROP INDEX CONCURRENTLY IF EXISTS public.idx_messages_backfill_org_null;

-- =============================================================================
-- PASSO 5 — sobras
--
-- Mensagem sem conversa correspondente nao existe (ha FK), entao isto deve
-- voltar 0. Se voltar algo, e sinal de conversa apagada com mensagem viva —
-- investigar antes de qualquer limpeza.
-- =============================================================================
SELECT count(*) AS mensagens_orfas
  FROM public.messages m
  LEFT JOIN public.conversations c ON c.id = m.conversation_id
 WHERE m.organization_id IS NULL
   AND c.id IS NULL;
