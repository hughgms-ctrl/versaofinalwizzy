-- src/fluzz/pages/workspace/WhatsAppConfig.tsx queries whatsapp_config
-- (one row per workspace), which was never created by a migration.

CREATE TABLE IF NOT EXISTS public.whatsapp_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL UNIQUE REFERENCES public.workspaces(id) ON DELETE CASCADE,
  instance_subdomain text NOT NULL DEFAULT '',
  instance_token text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Wizzy Flow workspace whatsapp config access" ON public.whatsapp_config;
CREATE POLICY "Wizzy Flow workspace whatsapp config access"
  ON public.whatsapp_config
  FOR ALL
  USING (public.user_has_workspace_access(auth.uid(), workspace_id))
  WITH CHECK (public.user_has_workspace_access(auth.uid(), workspace_id));

DROP TRIGGER IF EXISTS update_whatsapp_config_updated_at ON public.whatsapp_config;
CREATE TRIGGER update_whatsapp_config_updated_at
  BEFORE UPDATE ON public.whatsapp_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

NOTIFY pgrst, 'reload schema';
