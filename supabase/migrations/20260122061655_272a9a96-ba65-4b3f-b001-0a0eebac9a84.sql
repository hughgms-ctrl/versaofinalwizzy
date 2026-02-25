-- Drop the overly permissive policy
DROP POLICY "System can manage presence" ON public.contact_presence;

-- The service role bypasses RLS anyway, so we don't need a permissive policy
-- Edge functions use service role key which ignores RLS