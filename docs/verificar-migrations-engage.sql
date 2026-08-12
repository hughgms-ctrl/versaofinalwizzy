-- Verificação pós-aplicação das migrations do Wizzy Engage.
--
-- Rode no SQL Editor do Supabase. Cada linha do resultado é um objeto que o
-- código novo precisa encontrar no banco; a coluna `situacao` diz OK ou FALTA.
--
-- Se tudo vier OK, o banco está pronto e o que falta é só o App Review da Meta.

SELECT * FROM (

  -- ── Tabelas ──────────────────────────────────────────────────────────────
  SELECT
    1 AS ordem,
    'tabela' AS tipo,
    'instagram_send_ledger' AS objeto,
    CASE WHEN to_regclass('public.instagram_send_ledger') IS NOT NULL
         THEN 'OK' ELSE 'FALTA' END AS situacao,
    'ledger do rate limit (migration 170000)' AS observacao

  UNION ALL
  SELECT 2, 'tabela', 'instagram_data_deletion_requests',
    CASE WHEN to_regclass('public.instagram_data_deletion_requests') IS NOT NULL
         THEN 'OK' ELSE 'FALTA' END,
    'callback de exclusão de dados da Meta (migration 140000)'

  -- ── Colunas ──────────────────────────────────────────────────────────────
  UNION ALL
  SELECT 3, 'coluna', 'instagram_accounts.send_rate_limit',
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'instagram_accounts'
         AND column_name = 'send_rate_limit'
    ) THEN 'OK' ELSE 'FALTA' END,
    'tetos por conta; vazio = default 2/s e 200/h'

  UNION ALL
  SELECT 4, 'coluna', 'instagram_tracked_links.link_sent_at',
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'instagram_tracked_links'
         AND column_name = 'link_sent_at'
    ) THEN 'OK' ELSE 'FALTA' END,
    'trava do quick reply: um envio por chip'

  UNION ALL
  SELECT 5, 'coluna', 'instagram_conversations.last_inbound_at',
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'instagram_conversations'
         AND column_name = 'last_inbound_at'
    ) THEN 'OK' ELSE 'FALTA' END,
    'janela de 24h (migration 150000)'

  UNION ALL
  SELECT 6, 'coluna', 'instagram_pending_followups.claimed_at',
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'instagram_pending_followups'
         AND column_name = 'claimed_at'
    ) THEN 'OK' ELSE 'FALTA' END,
    'trava atômica da fila (migration 150000)'

  -- ── Funções ──────────────────────────────────────────────────────────────
  UNION ALL
  SELECT 7, 'funcao', 'reserve_instagram_send_slot',
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'reserve_instagram_send_slot'
    ) THEN 'OK' ELSE 'FALTA' END,
    'sem ela, TODO envio é bloqueado (a função falha fechada)'

  UNION ALL
  SELECT 8, 'funcao', 'claim_instagram_link_send',
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'claim_instagram_link_send'
    ) THEN 'OK' ELSE 'FALTA' END,
    'sem ela, o link do quick reply não é enviado'

  UNION ALL
  SELECT 9, 'funcao', 'claim_instagram_followups',
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'claim_instagram_followups'
    ) THEN 'OK' ELSE 'FALTA' END,
    'sem ela, nenhum follow-up sai (migration 150000)'

  -- ── Enum ─────────────────────────────────────────────────────────────────
  UNION ALL
  SELECT 10, 'enum', 'instagram_account_status = expired',
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'instagram_account_status' AND e.enumlabel = 'expired'
    ) THEN 'OK' ELSE 'FALTA' END,
    'token vencido vira expired (migration 145000)'

  -- ── Crons ────────────────────────────────────────────────────────────────
  -- ATENÇÃO: se o pg_cron não estiver instalado, as migrations pulam os
  -- agendamentos em silêncio (elas testam pg_extension antes). Nesse caso os
  -- três aparecem como FALTA e nenhum follow-up jamais será enviado.
  UNION ALL
  SELECT 11, 'cron', 'instagram-process-followups',
    CASE WHEN EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'instagram-process-followups')
         THEN 'OK' ELSE 'FALTA' END,
    'a cada minuto: drena a fila de follow-ups'

  UNION ALL
  SELECT 12, 'cron', 'instagram-refresh-tokens',
    CASE WHEN EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'instagram-refresh-tokens')
         THEN 'OK' ELSE 'FALTA' END,
    'semanal: sem ele toda conexão morre em 60 dias'

  UNION ALL
  SELECT 13, 'cron', 'instagram-send-ledger-cleanup',
    CASE WHEN EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'instagram-send-ledger-cleanup')
         THEN 'OK' ELSE 'FALTA' END,
    'diário: poda o ledger além de 7 dias (não crítico)'

) AS checagem
ORDER BY ordem;
