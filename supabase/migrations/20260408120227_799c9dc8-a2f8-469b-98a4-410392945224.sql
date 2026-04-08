
DROP FUNCTION IF EXISTS public.check_suspicious_activity();

CREATE OR REPLACE FUNCTION public.check_suspicious_activity()
RETURNS TABLE(
    fingerprint_id uuid,
    organization_id uuid,
    organization_name text,
    ip_address text,
    reason text,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        uf.id as fingerprint_id,
        uf.organization_id,
        o.name as organization_name,
        uf.ip_address,
        bf.reason,
        uf.created_at
    FROM public.user_fingerprints uf
    JOIN public.organizations o ON o.id = uf.organization_id
    JOIN public.blocked_fingerprints bf ON bf.ip_address = uf.ip_address
    WHERE o.created_at > (now() - interval '30 days')
    ORDER BY uf.created_at DESC;

    RETURN QUERY
    SELECT 
        uf.id as fingerprint_id,
        uf.organization_id,
        o.name as organization_name,
        uf.ip_address,
        'Mesmo IP usado em ' || ip_counts.org_count || ' organizações diferentes' as reason,
        uf.created_at
    FROM public.user_fingerprints uf
    JOIN public.organizations o ON o.id = uf.organization_id
    JOIN (
        SELECT uf2.ip_address as ip_addr, COUNT(DISTINCT uf2.organization_id) as org_count
        FROM public.user_fingerprints uf2
        WHERE uf2.ip_address IS NOT NULL
        GROUP BY uf2.ip_address
        HAVING COUNT(DISTINCT uf2.organization_id) > 1
    ) ip_counts ON ip_counts.ip_addr = uf.ip_address
    WHERE NOT EXISTS (
        SELECT 1 FROM public.blocked_fingerprints bf WHERE bf.ip_address = uf.ip_address
    )
    ORDER BY uf.created_at DESC;
END;
$function$;
