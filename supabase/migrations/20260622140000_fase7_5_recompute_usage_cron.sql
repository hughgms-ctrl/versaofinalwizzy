-- =============================================================================
-- Fase 7.5 — Cron diario de recalculo de uso (storage) por org
-- =============================================================================
-- Contexto: a edge function organization-usage (tela de billing) deixou de recalcular
-- o storage a cada view (varredura O(plataforma), TTFB ~15s) e passou a LER o valor
-- persistido em organizations.storage_used_bytes. Este cron mantem esse valor fresco,
-- recalculando todas as orgs 1x/dia FORA do caminho do usuario, via a edge function
-- recompute-org-usage (que reusa calculateOrganizationUsage — mesmos numeros do
-- admin-dashboard, sem divergencia).
--
-- DEPLOY (regra do projeto: NUNCA `supabase db push`):
--   1) Lovable sync para subir as edge functions (organization-usage + recompute-org-usage).
--   2) No painel Supabase, marcar a function `recompute-org-usage` como verify_jwt=false
--      (publica, como os outros crons — senao o net.http_post abaixo toma 401).
--   3) Rodar ESTE arquivo no SQL Editor.
-- Re-rodar e seguro: CREATE TABLE IF NOT EXISTS + cron.schedule faz upsert por jobname.
-- =============================================================================

-- Estado de jobs de plataforma — usado como throttle anti-abuso do endpoint publico
-- (a function so roda o scan se last_run_at > 12h). Apenas service role acessa.
CREATE TABLE IF NOT EXISTS public.platform_job_runs (
  job_key text PRIMARY KEY,
  last_run_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_job_runs ENABLE ROW LEVEL SECURITY;
-- Sem policies de propósito: nenhum cliente precisa ler/escrever; edge functions usam
-- a service role (que ignora RLS). RLS habilitada mantem a tabela fechada por padrao.

-- Cron diario as 04:00 UTC.
SELECT cron.schedule(
  'recompute-org-usage',
  '0 4 * * *',
  $$
  SELECT net.http_post(
    url := 'https://zaobtetbjpuzibjymhzw.supabase.co/functions/v1/recompute-org-usage',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
