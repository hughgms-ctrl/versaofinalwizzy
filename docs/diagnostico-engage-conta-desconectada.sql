-- Wizzy Engage: por que a conta do Instagram aparece desconectada
--
-- Rode no SQL Editor do Supabase (bloco por bloco) e me mande o resultado.
-- Cada bloco responde uma pergunta diferente; o BLOCO 1 quase sempre já
-- resolve.

-- ── BLOCO 1 · Estado da conta ───────────────────────────────────────────────
-- A coluna `veredito` diz o que aconteceu. Repare em `is_active`: uma conta
-- pode dizer 'connected' e mesmo assim estar fora do ar se is_active = false,
-- porque o webhook e os fluxos filtram por essa coluna.
SELECT
  ig_username,
  status,
  is_active,
  token_expires_at,
  (token_expires_at - now())            AS falta_para_expirar,
  connected_at,
  disconnected_at,
  updated_at,
  CASE
    WHEN status = 'expired'                       THEN 'Token venceu. So reconectando (OAuth).'
    WHEN status = 'error'                         THEN 'A Meta recusou o acesso em alguma verificacao. Ver BLOCO 2.'
    WHEN status = 'disconnected'                  THEN 'Desligada de proposito, ou a Meta mandou deauthorize. Ver BLOCO 3.'
    WHEN status = 'pending'                       THEN 'OAuth comecou e nao terminou.'
    WHEN token_expires_at <= now()                THEN 'Diz conectada mas o token ja venceu.'
    WHEN NOT is_active                            THEN 'Diz conectada mas esta inativa: nada dispara.'
    ELSE 'Conta saudavel no banco - o problema esta fora daqui.'
  END AS veredito
FROM public.instagram_accounts
ORDER BY created_at DESC;

-- ── BLOCO 2 · O cron de renovacao esta rodando? ─────────────────────────────
-- Se `instagram-refresh-tokens` nao aparece, ou a ultima execucao falhou / e
-- antiga, o token morreu por falta de renovacao e vai morrer de novo.
SELECT
  j.jobname,
  j.schedule,
  j.active,
  r.status       AS ultima_execucao,
  r.start_time   AS quando,
  r.return_message
FROM cron.job j
LEFT JOIN LATERAL (
  SELECT status, start_time, return_message
  FROM cron.job_run_details d
  WHERE d.jobid = j.jobid
  ORDER BY start_time DESC
  LIMIT 1
) r ON TRUE
WHERE j.jobname LIKE 'instagram%'
ORDER BY j.jobname;

-- ── BLOCO 3 · A Meta desautorizou o app? ────────────────────────────────────
-- O callback de deauthorize marca a conta como desconectada. Se houver linha
-- aqui perto da data em que parou, foi a Meta (ou alguem removeu o app em
-- Instagram > Apps e sites).
SELECT * FROM public.instagram_data_deletion_requests ORDER BY created_at DESC LIMIT 10;

-- ── BLOCO 4 · Ultimo sinal de vida do modulo ────────────────────────────────
-- Quando foi a ultima vez que uma regra rodou de verdade.
SELECT status, count(*), max(created_at) AS mais_recente
FROM public.instagram_rule_executions
GROUP BY status
ORDER BY mais_recente DESC NULLS LAST;

-- ═══════════════════════════════════════════════════════════════════════════
-- CONSERTO · so rode depois de olhar o BLOCO 1
-- ═══════════════════════════════════════════════════════════════════════════

-- Caso A · a conta caiu em 'error' mas o token AINDA e valido (falta_para_expirar
-- positivo no BLOCO 1). Era um tropeco passageiro da Meta: religa sem OAuth.
-- Depois clique em "Verificar status" na tela - se o token estiver mesmo morto,
-- ela volta para 'error' na hora, sem enganar ninguem.
--
-- UPDATE public.instagram_accounts
--    SET status = 'connected', is_active = true, disconnected_at = NULL
--  WHERE status = 'error'
--    AND token_expires_at > now();

-- Caso B · token vencido ('expired', ou falta_para_expirar negativo).
-- Nao ha SQL que resolva: e preciso reconectar pela tela
-- (Configuracoes > Integracoes > Instagram > Reconectar), porque so um OAuth
-- novo gera token novo.
