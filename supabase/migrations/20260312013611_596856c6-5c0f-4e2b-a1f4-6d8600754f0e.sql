-- Fix remaining RLS always-true: whatsapp_connection_logs
DROP POLICY IF EXISTS "Service role can manage connection logs" ON public.whatsapp_connection_logs;
CREATE POLICY "Service role can manage connection logs" ON public.whatsapp_connection_logs
  FOR ALL
  USING (auth.role() = 'service_role');