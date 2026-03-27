
-- Security Fingerprinting Tables
CREATE TABLE IF NOT EXISTS public.user_fingerprints (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    ip_address text,
    user_agent text,
    browser_data jsonb DEFAULT '{}'::jsonb,
    location_data jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.blocked_fingerprints (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ip_address text,
    user_agent_hash text,
    reason text,
    blocked_at timestamptz DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_fingerprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_fingerprints ENABLE ROW LEVEL SECURITY;

-- Only platform admins can view/manage these
CREATE POLICY "Platform admins full access on user_fingerprints" 
ON public.user_fingerprints FOR ALL 
USING (public.is_platform_admin(auth.uid()));

CREATE POLICY "Platform admins full access on blocked_fingerprints" 
ON public.blocked_fingerprints FOR ALL 
USING (public.is_platform_admin(auth.uid()));

-- Index for faster matching
CREATE INDEX IF NOT EXISTS idx_user_fingerprints_ip ON public.user_fingerprints(ip_address);
CREATE INDEX IF NOT EXISTS idx_blocked_fingerprints_ip ON public.blocked_fingerprints(ip_address);

-- Function to check for suspicious sign-ups
CREATE OR REPLACE FUNCTION public.check_suspicious_activity()
RETURNS TABLE (
    fingerprint_id uuid,
    organization_id uuid,
    organization_name text,
    ip_address text,
    reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        uf.id,
        uf.organization_id,
        o.name as organization_name,
        uf.ip_address,
        bf.reason
    FROM public.user_fingerprints uf
    JOIN public.organizations o ON o.id = uf.organization_id
    JOIN public.blocked_fingerprints bf ON bf.ip_address = uf.ip_address
    WHERE o.created_at > (now() - interval '7 days'); -- Focused on new accounts
END;
$$;
