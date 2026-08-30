-- ============================================================================
-- B5 — guarda estrutural contra fluxo duplicado (idx_flow_executions_one_live)
--
-- O código já tem o compare-and-set: quem retoma um fluxo fecha a execução
-- anterior com UPDATE ... WHERE status = 'waiting_input' e só segue se voltou
-- linha, então duas mensagens do mesmo contato em 200 ms não geram mais duas
-- execuções. Este índice é o cinto de segurança no banco, para o caminho que
-- ninguém previu.
--
-- ATENÇÃO — a definição mudou em relação ao que está no REVISAO_ESCALA_LANCAMENTO.md.
-- Lá o índice era UMA EXECUÇÃO VIVA POR CONVERSA. Isso quebraria duas coisas que
-- funcionam de propósito hoje:
--
--   1. Sub-fluxo com "aguardar resposta": o pai fica parado em waiting_input na
--      MESMA conversa enquanto o filho roda (flow-execute/index.ts, action-flow).
--   2. Campanha interruptora: o fluxo interrompido NÃO é cancelado, fica parado
--      no nó em que estava enquanto o fluxo da campanha roda na mesma conversa
--      (zapi-webhook/index.ts, [CAMPAIGN INTERRUPT]).
--
-- Em ambos os casos são fluxos DIFERENTES. A duplicata que o B5 descreve é o
-- MESMO fluxo duas vezes na mesma conversa. Por isso o índice aqui é
-- (conversation_id, flow_id) — pega a gêmea e não atrapalha sub-fluxo nem
-- campanha interruptora.
--
-- A retomada continua funcionando porque ela fecha a execução anterior como
-- 'completed' ANTES de o flow-execute inserir a nova.
--
-- Rodar bloco por bloco no SQL Editor. CONCURRENTLY não roda dentro de
-- transação — o SQL Editor executa cada statement isolado.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. DIAGNÓSTICO — quantas duplicatas existem hoje
--
-- Cada linha aqui é uma conversa com o MESMO fluxo vivo mais de uma vez: é
-- exatamente o que impediria a criação do índice, e é o contato que está
-- recebendo tudo em dobro.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  fe.conversation_id,
  fe.flow_id,
  f.name                       AS fluxo,
  c.phone                      AS contato,
  count(*)                     AS execucoes_vivas,
  min(fe.started_at)           AS mais_antiga,
  max(fe.started_at)           AS mais_recente,
  array_agg(fe.status)         AS status,
  array_agg(fe.id)             AS ids
FROM public.flow_executions fe
LEFT JOIN public.flows f          ON f.id  = fe.flow_id
LEFT JOIN public.conversations cv ON cv.id = fe.conversation_id
LEFT JOIN public.contacts c       ON c.id  = cv.contact_id
WHERE fe.status IN ('running', 'waiting_input', 'waiting_delay')
GROUP BY fe.conversation_id, fe.flow_id, f.name, c.phone
HAVING count(*) > 1
ORDER BY count(*) DESC, max(fe.started_at) DESC;
-- Vazio = pode pular direto para o passo 3.


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. FECHAR AS DUPLICATAS — fica a mais recente de cada (conversa, fluxo)
--
-- A mais recente é a que o webhook enxerga (ele ordena por started_at DESC),
-- então é ela que continua a conversa. As anteriores viram 'failed' com o
-- motivo escrito, para dar para achar depois.
-- ─────────────────────────────────────────────────────────────────────────────
WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY conversation_id, flow_id ORDER BY started_at DESC, id DESC) AS rn
  FROM public.flow_executions
  WHERE status IN ('running', 'waiting_input', 'waiting_delay')
)
UPDATE public.flow_executions fe
SET status = 'failed',
    completed_at = now(),
    timeout_at = NULL,
    error_message = COALESCE(fe.error_message, 'duplicata fechada para criar idx_flow_executions_one_live (B5)')
FROM ranked
WHERE ranked.id = fe.id
  AND ranked.rn > 1
RETURNING fe.id, fe.conversation_id, fe.flow_id;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. CONFERIR QUE ZEROU (rodar como statement separado — o passo 2 já commitou)
-- ─────────────────────────────────────────────────────────────────────────────
SELECT count(*) AS ainda_duplicadas
FROM (
  SELECT conversation_id, flow_id
  FROM public.flow_executions
  WHERE status IN ('running', 'waiting_input', 'waiting_delay')
  GROUP BY conversation_id, flow_id
  HAVING count(*) > 1
) d;
-- Esperado: 0. Se não for, alguém criou duplicata entre o passo 2 e agora —
-- rodar o passo 2 de novo (é idempotente).


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. CRIAR O ÍNDICE
--
-- CONCURRENTLY: não trava a tabela, mas se falhar deixa um índice inválido —
-- por isso a conferência do passo 5.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_flow_executions_one_live
  ON public.flow_executions (conversation_id, flow_id)
  WHERE status IN ('running', 'waiting_input', 'waiting_delay');


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. CONFERÊNCIA
-- ─────────────────────────────────────────────────────────────────────────────
SELECT indexrelid::regclass AS indice, indisvalid AS valid, indisunique AS unico
FROM pg_index
WHERE indexrelid::regclass::text = 'idx_flow_executions_one_live';
-- valid = false: DROP INDEX idx_flow_executions_one_live; e rodar o passo 4 de novo.

-- A partir daqui, uma inserção duplicada volta 23505 e o flow-execute desiste
-- dela sozinho (o tratamento já está no código, com log
-- "[FLOW EXECUTE] Conversa ... já tem execução viva").
