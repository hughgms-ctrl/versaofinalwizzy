-- ============================================================================
-- Um card por FUNIL, e nao um card no mundo inteiro
--
-- PEDIDO (2026-08-19): "quero poder ter pipeline por evento, ai uma pessoa pode
-- ter 1 card em varios pipelines, mas somente 1 em cada".
--
-- ESTADO ANTERIOR: a tabela nasceu com UNIQUE(conversation_id, pipeline_id) —
-- exatamente a regra pedida — mas a migration 20260309020135 trocou isso por
-- UNIQUE(conversation_id), fechando a conversa em UM funil no mundo. Dai em
-- diante o codigo passou a apagar as outras posicoes para caber na constraint
-- (ver _shared/pipelineMove.ts e removeStaleConversationPositions), o que fazia
-- o card sumir do funil de origem em silencio.
--
-- O QUE MUDA AQUI: volta o UNIQUE composto. A conversa pode aparecer em varios
-- funis (um por evento, por exemplo) e continua limitada a um unico card dentro
-- de cada funil.
--
-- O QUE NAO MUDA: "mover" continua movendo — quem move e o codigo, que apaga a
-- posicao de origem de proposito e nao mais por obrigacao da constraint. Ganhar
-- um card extra passa a exigir uma acao explicita ("Adicionar a outro funil" no
-- menu da conversa, ou o modo "Adicionar" do no de funil nos fluxos).
--
-- NAO cria nem remove dados de negocio: a limpeza abaixo so remove duplicata
-- exata dentro do MESMO funil (sobra de bases antigas), mantendo a mais recente.
-- ============================================================================

-- 1) Duplicatas dentro do mesmo funil impedem criar o UNIQUE composto.
--    Mantem a linha mais recente de cada (conversa, funil).
DELETE FROM public.conversation_pipeline_positions
WHERE id NOT IN (
  SELECT DISTINCT ON (conversation_id, pipeline_id) id
  FROM public.conversation_pipeline_positions
  ORDER BY conversation_id, pipeline_id, updated_at DESC, id DESC
);

-- 2) Derruba a regra global. Pode existir como constraint (foi assim que
--    20260309020135 criou) ou, em bases mexidas na mao, como indice unico.
ALTER TABLE public.conversation_pipeline_positions
  DROP CONSTRAINT IF EXISTS unique_conversation_pipeline_position;

DROP INDEX IF EXISTS public.unique_conversation_pipeline_position;

-- 3) Garante o UNIQUE composto. Idempotente: a tabela original ja podia ter esse
--    par (com nome gerado pelo Postgres), e recriar daria erro.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_index i
    WHERE i.indrelid = 'public.conversation_pipeline_positions'::regclass
      AND i.indisunique
      AND i.indnkeyatts = 2
      AND (
        SELECT array_agg(a.attname::text ORDER BY a.attname)
        FROM unnest(i.indkey::smallint[]) WITH ORDINALITY AS k(attnum, pos)
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
        WHERE k.pos <= 2
      ) = ARRAY['conversation_id', 'pipeline_id']
  ) THEN
    ALTER TABLE public.conversation_pipeline_positions
      ADD CONSTRAINT conversation_pipeline_positions_conversation_pipeline_key
      UNIQUE (conversation_id, pipeline_id);
  END IF;
END $$;

COMMENT ON TABLE public.conversation_pipeline_positions IS
  'Posicao de uma conversa dentro de um funil. Uma conversa pode ter card em varios funis (um por evento, por exemplo), mas apenas um card em cada funil — UNIQUE(conversation_id, pipeline_id).';
