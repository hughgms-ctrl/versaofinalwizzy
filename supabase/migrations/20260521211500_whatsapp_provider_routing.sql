ALTER TABLE public.whatsapp_instances
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'uazapi',
  ADD COLUMN IF NOT EXISTS evolution_instance_name text,
  ADD COLUMN IF NOT EXISTS evolution_instance_id text,
  ADD COLUMN IF NOT EXISTS evolution_api_key text,
  ADD COLUMN IF NOT EXISTS provider_settings jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.whatsapp_instances
  DROP CONSTRAINT IF EXISTS whatsapp_instances_organization_id_key;

CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_provider
  ON public.whatsapp_instances(provider);

CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_evolution_name
  ON public.whatsapp_instances(evolution_instance_name);
