WITH module_sets AS (
  SELECT
    ARRAY[
      'crm',
      'dashboard',
      'conversations',
      'contacts',
      'groups',
      'calendar',
      'pipeline',
      'flows',
      'campaigns',
      'scheduled',
      'agents',
      'reports',
      'integrations',
      'settings',
      'team',
      'orchestrator',
      'ai'
    ] AS crm_modules,
    ARRAY[
      'documents',
      'widgets',
      'quiz',
      'wizzy_flow',
      'carousel',
      'cnis'
    ] AS tool_modules
),
expanded_modules AS (
  SELECT
    p.id,
    ARRAY(
      SELECT DISTINCT module
      FROM (
        SELECT jsonb_array_elements_text(coalesce(p.allowed_modules, '[]'::jsonb)) AS module
        UNION ALL
        SELECT unnest(ms.crm_modules) AS module
        UNION ALL
        SELECT 'tools' AS module
        WHERE EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(coalesce(p.allowed_modules, '[]'::jsonb)) allowed(module)
          WHERE allowed.module = ANY(ms.tool_modules)
        )
      ) modules
      ORDER BY module
    ) AS modules
  FROM public.platform_plans p
  CROSS JOIN module_sets ms
)
UPDATE public.platform_plans p
SET
  allowed_modules = to_jsonb(expanded_modules.modules),
  updated_at = now()
FROM expanded_modules
WHERE p.id = expanded_modules.id;
