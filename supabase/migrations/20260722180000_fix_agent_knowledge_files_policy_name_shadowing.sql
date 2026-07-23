-- Corrige name-shadowing nas policies de agent-knowledge-files (mesma classe
-- de bug já vista em 20260718120000, dessa vez introduzida por mim mesmo):
-- dentro do EXISTS (SELECT 1 FROM ai_agents a ...), `storage.foldername(name)`
-- estava SEM qualificar. Como ai_agents tem coluna `name` (o nome do agente),
-- o Postgres ligava `name` a `a.name` em vez de `storage.objects.name` -- o
-- EXISTS nunca batia, e todo upload falhava com "row violates row-level
-- security policy" mesmo pra um agente da própria organização.

DROP POLICY IF EXISTS "Org access agent-knowledge-files select" ON storage.objects;
DROP POLICY IF EXISTS "Org access agent-knowledge-files insert" ON storage.objects;
DROP POLICY IF EXISTS "Org access agent-knowledge-files delete" ON storage.objects;

CREATE POLICY "Org access agent-knowledge-files select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'agent-knowledge-files'
    AND EXISTS (
      SELECT 1 FROM public.ai_agents a
      WHERE a.id::text = (storage.foldername(storage.objects.name))[1]
        AND a.organization_id = public.get_user_org_id((select auth.uid()))
    )
  );

CREATE POLICY "Org access agent-knowledge-files insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'agent-knowledge-files'
    AND EXISTS (
      SELECT 1 FROM public.ai_agents a
      WHERE a.id::text = (storage.foldername(storage.objects.name))[1]
        AND a.organization_id = public.get_user_org_id((select auth.uid()))
    )
  );

CREATE POLICY "Org access agent-knowledge-files delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'agent-knowledge-files'
    AND EXISTS (
      SELECT 1 FROM public.ai_agents a
      WHERE a.id::text = (storage.foldername(storage.objects.name))[1]
        AND a.organization_id = public.get_user_org_id((select auth.uid()))
    )
  );
