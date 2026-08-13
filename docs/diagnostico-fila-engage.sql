-- Diagnóstico da fila de follow-ups do Instagram, para rodar logo depois de
-- aplicar as migrations do Engage.
--
-- MOTIVO: até a migration 20260811150000, o cron `instagram-process-followups`
-- só existia como comentário na edge function, para aplicação manual. Se
-- ninguém rodou aquele SQL à mão, a fila nunca foi drenada — e agora que o cron
-- está de pé, ele vai encontrar tudo que se acumulou e tentar enviar.
--
-- O que fazer com o resultado está no fim do arquivo.

-- ── 1. O que existe na fila, por situação ───────────────────────────────────
SELECT
  status,
  count(*) AS linhas,
  min(resume_at) AS mais_antigo,
  max(resume_at) AS mais_recente,
  count(*) FILTER (WHERE resume_at <= now()) AS ja_vencidos
FROM public.instagram_pending_followups
GROUP BY status
ORDER BY linhas DESC;

-- ── 2. Quantos sairiam AGORA se o cron rodasse ──────────────────────────────
--
-- Repete os filtros de claim_instagram_followups. Se este número for alto, o
-- cron vai drenar em lotes de 50 por minuto — o rate limit da conta segura o
-- ritmo do envio, mas vale saber o tamanho antes.
SELECT count(*) AS sairiam_agora
  FROM public.instagram_pending_followups
 WHERE resume_at <= now()
   AND attempts < 3
   AND status = 'pending';

-- ── 3. Desses, quantos a janela de 24h vai barrar ───────────────────────────
--
-- O follow-up só sai se o contato respondeu nas últimas 24h. Follow-up antigo
-- quase certamente vira 'skipped' — o que é o comportamento correto, e não
-- falha. Este número diz quanto da fila é histórico morto.
SELECT
  count(*) AS vencidos_total,
  count(*) FILTER (
    WHERE conv.last_inbound_at IS NOT NULL
      AND conv.last_inbound_at > now() - INTERVAL '24 hours'
  ) AS janela_aberta_vai_enviar,
  count(*) FILTER (
    WHERE conv.last_inbound_at IS NULL
       OR conv.last_inbound_at <= now() - INTERVAL '24 hours'
  ) AS janela_fechada_vai_pular
FROM public.instagram_pending_followups f
LEFT JOIN public.instagram_conversations conv ON conv.id = f.conversation_id
WHERE f.resume_at <= now()
  AND f.attempts < 3
  AND f.status = 'pending';

-- ── 4. Quão antiga é a fila represada ───────────────────────────────────────
SELECT
  date_trunc('day', resume_at) AS dia,
  count(*) AS linhas
FROM public.instagram_pending_followups
WHERE status = 'pending'
  AND resume_at <= now()
GROUP BY 1
ORDER BY 1 DESC
LIMIT 30;

-- ════════════════════════════════════════════════════════════════════════════
-- COMO LER
--
-- Cenário A — consultas 1 e 2 voltam vazias ou perto de zero:
--   nada represado. Pode seguir sem fazer nada.
--
-- Cenário B — há fila, mas a consulta 3 mostra quase tudo em
-- `janela_fechada_vai_pular`:
--   é histórico morto. O cron vai marcá-los 'skipped' sem enviar nada, o que é
--   correto e inofensivo. Nenhuma ação necessária — só não se assuste ao ver
--   centenas de 'skipped' aparecerem de uma vez.
--
-- Cenário C — `janela_aberta_vai_enviar` é um número relevante (dezenas ou
-- mais):
--   ATENÇÃO. São mensagens antigas que vão chegar agora, fora de contexto, para
--   pessoas que conversaram recentemente. Antes de deixar o cron rodar, avalie
--   descartar as mais antigas:
--
--     UPDATE public.instagram_pending_followups
--        SET status = 'skipped',
--            error = 'descartado: fila represada antes do cron existir',
--            processed_at = now()
--      WHERE status = 'pending'
--        AND resume_at < now() - INTERVAL '7 days';   -- ajuste o corte
--
--   Rode primeiro como SELECT count(*) com o mesmo WHERE para ver o tamanho.
-- ════════════════════════════════════════════════════════════════════════════
