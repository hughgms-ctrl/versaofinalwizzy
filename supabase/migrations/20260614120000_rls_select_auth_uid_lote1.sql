-- =============================================================================
-- FASE 1B — RLS: envolver auth.uid() em subquery escalar (InitPlan)
-- =============================================================================
-- Contexto: auth.uid() "nu" no predicado é reavaliado UMA VEZ POR LINHA varrida
-- (a função é STABLE, mas o planner não a iça para fora do loop). Envolvendo em
-- (select auth.uid()) o Postgres avalia UMA VEZ por query (InitPlan) e reusa o
-- resultado em todas as linhas. Mudança puramente mecânica e SEMANTICAMENTE
-- IDÊNTICA — recriamos cada política trocando auth.uid() -> (select auth.uid()).
--
-- LOTE 1 (tabelas quentes): messages, conversations, contacts, contact_tags,
-- conversation_pipeline_positions.
--
-- Os helpers SECURITY DEFINER (get_user_org_id, etc.) NÃO mudam — apenas a forma
-- como recebem o uid. Estrutura preservada: políticas FOR ALL que não tinham
-- WITH CHECK continuam sem WITH CHECK (o Postgres usa USING como check implícito).
--
-- DEPLOY: aplicar via fluxo Lovable / SQL Editor do Supabase. NÃO rodar
-- `supabase db push` (ver docs/PLANO_OTIMIZACAO.md, aviso de mecanismo de deploy).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- messages
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view messages from their org conversations" ON public.messages;
CREATE POLICY "Users can view messages from their org conversations"
ON public.messages FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE c.id = conversation_id
        AND c.organization_id = public.get_user_org_id((select auth.uid()))
    )
);

DROP POLICY IF EXISTS "Users can insert messages in their org conversations" ON public.messages;
CREATE POLICY "Users can insert messages in their org conversations"
ON public.messages FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE c.id = conversation_id
        AND c.organization_id = public.get_user_org_id((select auth.uid()))
    )
);

DROP POLICY IF EXISTS "Users can delete messages from their org conversations" ON public.messages;
CREATE POLICY "Users can delete messages from their org conversations"
ON public.messages FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE c.id = messages.conversation_id
        AND c.organization_id = public.get_user_org_id((select auth.uid()))
    )
);

-- -----------------------------------------------------------------------------
-- conversations
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view conversations in their organization" ON public.conversations;
CREATE POLICY "Users can view conversations in their organization"
ON public.conversations FOR SELECT
USING (organization_id = public.get_user_org_id((select auth.uid())));

DROP POLICY IF EXISTS "Users can manage conversations in their organization" ON public.conversations;
CREATE POLICY "Users can manage conversations in their organization"
ON public.conversations FOR ALL
USING (organization_id = public.get_user_org_id((select auth.uid())))
WITH CHECK (organization_id = public.get_user_org_id((select auth.uid())));

DROP POLICY IF EXISTS "Users can delete conversations in their organization" ON public.conversations;
CREATE POLICY "Users can delete conversations in their organization"
ON public.conversations FOR DELETE
USING (organization_id = public.get_user_org_id((select auth.uid())));

-- -----------------------------------------------------------------------------
-- contacts
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view contacts in their organization" ON public.contacts;
CREATE POLICY "Users can view contacts in their organization"
ON public.contacts FOR SELECT
USING (organization_id = public.get_user_org_id((select auth.uid())));

DROP POLICY IF EXISTS "Users can manage contacts in their organization" ON public.contacts;
CREATE POLICY "Users can manage contacts in their organization"
ON public.contacts FOR ALL
USING (organization_id = public.get_user_org_id((select auth.uid())));

-- -----------------------------------------------------------------------------
-- contact_tags
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view contact tags in their organization" ON public.contact_tags;
CREATE POLICY "Users can view contact tags in their organization"
ON public.contact_tags FOR SELECT
USING (EXISTS (
    SELECT 1 FROM public.contacts c
    WHERE c.id = contact_tags.contact_id
    AND c.organization_id = public.get_user_org_id((select auth.uid()))
));

DROP POLICY IF EXISTS "Users can manage contact tags in their organization" ON public.contact_tags;
CREATE POLICY "Users can manage contact tags in their organization"
ON public.contact_tags FOR ALL
USING (EXISTS (
    SELECT 1 FROM public.contacts c
    WHERE c.id = contact_tags.contact_id
    AND c.organization_id = public.get_user_org_id((select auth.uid()))
));

-- -----------------------------------------------------------------------------
-- conversation_pipeline_positions
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view positions in their org" ON public.conversation_pipeline_positions;
CREATE POLICY "Users can view positions in their org"
ON public.conversation_pipeline_positions FOR SELECT
USING (EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_pipeline_positions.conversation_id
    AND c.organization_id = public.get_user_org_id((select auth.uid()))
));

DROP POLICY IF EXISTS "Users can manage positions in their org" ON public.conversation_pipeline_positions;
CREATE POLICY "Users can manage positions in their org"
ON public.conversation_pipeline_positions FOR ALL
USING (EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_pipeline_positions.conversation_id
    AND c.organization_id = public.get_user_org_id((select auth.uid()))
));
