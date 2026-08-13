-- =============================================================================
-- Sincronização de etiquetas (labels) do WhatsApp Business ↔ tags do Wizzy
-- =============================================================================
-- Contexto: a Evolution API emite os eventos LABELS_EDIT (catálogo de etiquetas)
-- e LABELS_ASSOCIATION (etiqueta adicionada/removida de um chat), mas NÃO tem
-- endpoint GET que devolva as etiquetas de um contato. A arquitetura é:
--   1) zapi-webhook escuta LABELS_EDIT/LABELS_ASSOCIATION em tempo real;
--   2) sync-whatsapp-labels reconcilia periodicamente (webhook perde evento =
--      drift silencioso; e o bootstrap de etiquetas pré-existentes vem daqui).
-- Esta tabela guarda o mapeamento etiqueta-do-WhatsApp -> tag-do-Wizzy por
-- instância (o labelId do WhatsApp só tem significado dentro de uma instância).
--
-- DEPLOY (regra do projeto: NUNCA `supabase db push`):
--   1) Lovable sync para subir as edge functions (zapi-webhook,
--      zapi-configure-webhook, zapi-contact-tags, sync-whatsapp-labels).
--   2) No painel Supabase, marcar `sync-whatsapp-labels` como verify_jwt=false
--      (como os outros crons — senão o net.http_post abaixo toma 401).
--   3) Rodar ESTE arquivo no SQL Editor.
--   4) (Opcional, recomendado) Criar o secret EVOLUTION_DB_URL nas edge
--      functions apontando pro Postgres da Evolution na VPS — habilita a
--      reconciliação completa de associações via coluna "Chat"."labels".
--      Sem ele, a reconciliação cobre apenas o catálogo de etiquetas.
-- Re-rodar é seguro: IF NOT EXISTS / DROP IF EXISTS / upsert por jobname.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.whatsapp_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  whatsapp_instance_id uuid NOT NULL REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
  -- labelId nativo do WhatsApp (numérico em string, ex.: '5'); único por instância
  label_id text NOT NULL,
  name text NOT NULL,
  -- índice de cor do WhatsApp (0-19), guardado cru para reaplicar se preciso
  color text,
  tag_id uuid REFERENCES public.tags(id) ON DELETE SET NULL,
  -- etiqueta apagada no WhatsApp: marcamos em vez de deletar, preservando histórico
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (whatsapp_instance_id, label_id)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_labels_org ON public.whatsapp_labels(organization_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_labels_tag ON public.whatsapp_labels(tag_id);

ALTER TABLE public.whatsapp_labels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view whatsapp labels in their organization" ON public.whatsapp_labels;
CREATE POLICY "Users can view whatsapp labels in their organization"
ON public.whatsapp_labels FOR SELECT
USING (organization_id = public.get_user_org_id((select auth.uid())));
-- Sem policy de escrita de propósito: só as edge functions (service role) escrevem.

-- contact_tags.added_by_type ganha a origem 'whatsapp' (tag vinda do aparelho).
ALTER TABLE public.contact_tags DROP CONSTRAINT IF EXISTS contact_tags_added_by_type_check;
ALTER TABLE public.contact_tags ADD CONSTRAINT contact_tags_added_by_type_check
  CHECK (added_by_type IN ('manual', 'flow', 'ai', 'whatsapp'));

-- Reconciliação diária às 03:30 UTC (webhook cobre o tempo real; isto cura drift).
-- A function se auto-limita via platform_job_runs (mín. 30min entre execuções sem auth).
SELECT cron.schedule(
  'sync-whatsapp-labels',
  '30 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://zaobtetbjpuzibjymhzw.supabase.co/functions/v1/sync-whatsapp-labels',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
