-- 20260615140000_rls_select_auth_uid_lote3.sql
-- Fase 1B / Lote 3 (mop-up): wrap auth.uid() -> (select auth.uid()) em TODAS as policies restantes.
-- Gerado a partir de pg_policies (banco VIVO) em 2026-06-15. Aplicar via SQL Editor (NAO supabase db push).

BEGIN;

DROP POLICY IF EXISTS "Admins/Owners can delete activated packages" ON public.activated_packages;
CREATE POLICY "Admins/Owners can delete activated packages" ON public.activated_packages
  FOR DELETE TO public
  USING ((user_belongs_to_org((select auth.uid()), organization_id) AND (has_role((select auth.uid()), 'owner'::app_role) OR has_role((select auth.uid()), 'admin'::app_role))));

DROP POLICY IF EXISTS "Admins/Owners can insert activated packages" ON public.activated_packages;
CREATE POLICY "Admins/Owners can insert activated packages" ON public.activated_packages
  FOR INSERT TO public
  WITH CHECK ((user_belongs_to_org((select auth.uid()), organization_id) AND (has_role((select auth.uid()), 'owner'::app_role) OR has_role((select auth.uid()), 'admin'::app_role))));

DROP POLICY IF EXISTS "Admins/Owners can update activated packages" ON public.activated_packages;
CREATE POLICY "Admins/Owners can update activated packages" ON public.activated_packages
  FOR UPDATE TO public
  USING ((user_belongs_to_org((select auth.uid()), organization_id) AND (has_role((select auth.uid()), 'owner'::app_role) OR has_role((select auth.uid()), 'admin'::app_role))));

DROP POLICY IF EXISTS "Members can view activated packages" ON public.activated_packages;
CREATE POLICY "Members can view activated packages" ON public.activated_packages
  FOR SELECT TO public
  USING ((user_belongs_to_org((select auth.uid()), organization_id) OR is_platform_admin((select auth.uid()))));

DROP POLICY IF EXISTS "Platform admins full access" ON public.admin_audit_logs;
CREATE POLICY "Platform admins full access" ON public.admin_audit_logs
  FOR ALL TO public
  USING (is_platform_admin((select auth.uid())));

DROP POLICY IF EXISTS "Users can view execution logs in their org" ON public.agent_execution_logs;
CREATE POLICY "Users can view execution logs in their org" ON public.agent_execution_logs
  FOR SELECT TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Users can create agent folders in their org" ON public.agent_folders;
CREATE POLICY "Users can create agent folders in their org" ON public.agent_folders
  FOR INSERT TO public
  WITH CHECK ((organization_id IN ( SELECT profiles.organization_id
   FROM profiles
  WHERE (profiles.user_id = (select auth.uid())))));

DROP POLICY IF EXISTS "Users can delete agent folders in their org" ON public.agent_folders;
CREATE POLICY "Users can delete agent folders in their org" ON public.agent_folders
  FOR DELETE TO public
  USING ((organization_id IN ( SELECT profiles.organization_id
   FROM profiles
  WHERE (profiles.user_id = (select auth.uid())))));

DROP POLICY IF EXISTS "Users can update agent folders in their org" ON public.agent_folders;
CREATE POLICY "Users can update agent folders in their org" ON public.agent_folders
  FOR UPDATE TO public
  USING ((organization_id IN ( SELECT profiles.organization_id
   FROM profiles
  WHERE (profiles.user_id = (select auth.uid())))));

DROP POLICY IF EXISTS "Users can view agent folders in their org" ON public.agent_folders;
CREATE POLICY "Users can view agent folders in their org" ON public.agent_folders
  FOR SELECT TO public
  USING ((organization_id IN ( SELECT profiles.organization_id
   FROM profiles
  WHERE (profiles.user_id = (select auth.uid())))));

DROP POLICY IF EXISTS "Users can delete roles" ON public.agent_function_roles;
CREATE POLICY "Users can delete roles" ON public.agent_function_roles
  FOR DELETE TO public
  USING ((organization_id IN ( SELECT profiles.organization_id
   FROM profiles
  WHERE (profiles.user_id = (select auth.uid())))));

DROP POLICY IF EXISTS "Users can insert roles" ON public.agent_function_roles;
CREATE POLICY "Users can insert roles" ON public.agent_function_roles
  FOR INSERT TO public
  WITH CHECK ((organization_id IN ( SELECT profiles.organization_id
   FROM profiles
  WHERE (profiles.user_id = (select auth.uid())))));

DROP POLICY IF EXISTS "Users can update roles" ON public.agent_function_roles;
CREATE POLICY "Users can update roles" ON public.agent_function_roles
  FOR UPDATE TO public
  USING ((organization_id IN ( SELECT profiles.organization_id
   FROM profiles
  WHERE (profiles.user_id = (select auth.uid())))));

DROP POLICY IF EXISTS "Users can view their org roles" ON public.agent_function_roles;
CREATE POLICY "Users can view their org roles" ON public.agent_function_roles
  FOR SELECT TO public
  USING ((organization_id IN ( SELECT profiles.organization_id
   FROM profiles
  WHERE (profiles.user_id = (select auth.uid())))));

DROP POLICY IF EXISTS "Users can manage rules in their org" ON public.agent_qualification_rules;
CREATE POLICY "Users can manage rules in their org" ON public.agent_qualification_rules
  FOR ALL TO public
  USING (((organization_id = get_user_org_id((select auth.uid()))) OR is_platform_admin((select auth.uid()))))
  WITH CHECK (((organization_id = get_user_org_id((select auth.uid()))) OR is_platform_admin((select auth.uid()))));

DROP POLICY IF EXISTS "Users can view rules in their org" ON public.agent_qualification_rules;
CREATE POLICY "Users can view rules in their org" ON public.agent_qualification_rules
  FOR SELECT TO public
  USING (((organization_id = get_user_org_id((select auth.uid()))) OR is_platform_admin((select auth.uid()))));

DROP POLICY IF EXISTS "Admins can manage training rules in their org" ON public.agent_training_rules;
CREATE POLICY "Admins can manage training rules in their org" ON public.agent_training_rules
  FOR ALL TO public
  USING (((organization_id = get_user_org_id((select auth.uid()))) AND (has_role((select auth.uid()), 'owner'::app_role) OR has_role((select auth.uid()), 'admin'::app_role))));

DROP POLICY IF EXISTS "Users can view training rules in their org" ON public.agent_training_rules;
CREATE POLICY "Users can view training rules in their org" ON public.agent_training_rules
  FOR SELECT TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Admins can manage AI agents in their org" ON public.ai_agents;
CREATE POLICY "Admins can manage AI agents in their org" ON public.ai_agents
  FOR ALL TO public
  USING (((organization_id = get_user_org_id((select auth.uid()))) AND (has_role((select auth.uid()), 'owner'::app_role) OR has_role((select auth.uid()), 'admin'::app_role))));

DROP POLICY IF EXISTS "Users can view AI agents in their org" ON public.ai_agents;
CREATE POLICY "Users can view AI agents in their org" ON public.ai_agents
  FOR SELECT TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Platform admins can read billing_events" ON public.billing_events;
CREATE POLICY "Platform admins can read billing_events" ON public.billing_events
  FOR SELECT TO authenticated
  USING (is_platform_admin((select auth.uid())));

DROP POLICY IF EXISTS "Platform admins full access on blocked_fingerprints" ON public.blocked_fingerprints;
CREATE POLICY "Platform admins full access on blocked_fingerprints" ON public.blocked_fingerprints
  FOR ALL TO public
  USING (is_platform_admin((select auth.uid())));

DROP POLICY IF EXISTS "Users can manage bookings in their org" ON public.calendar_bookings;
CREATE POLICY "Users can manage bookings in their org" ON public.calendar_bookings
  FOR ALL TO authenticated
  USING ((organization_id = get_user_org_id((select auth.uid()))))
  WITH CHECK ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Users can view bookings in their org" ON public.calendar_bookings;
CREATE POLICY "Users can view bookings in their org" ON public.calendar_bookings
  FOR SELECT TO authenticated
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Admins can manage calendar configs" ON public.calendar_configs;
CREATE POLICY "Admins can manage calendar configs" ON public.calendar_configs
  FOR ALL TO authenticated
  USING (((organization_id = get_user_org_id((select auth.uid()))) AND (has_role((select auth.uid()), 'owner'::app_role) OR has_role((select auth.uid()), 'admin'::app_role))))
  WITH CHECK (((organization_id = get_user_org_id((select auth.uid()))) AND (has_role((select auth.uid()), 'owner'::app_role) OR has_role((select auth.uid()), 'admin'::app_role))));

DROP POLICY IF EXISTS "Admins can view calendar configs" ON public.calendar_configs;
CREATE POLICY "Admins can view calendar configs" ON public.calendar_configs
  FOR SELECT TO authenticated
  USING (((organization_id = get_user_org_id((select auth.uid()))) AND (has_role_in_org((select auth.uid()), 'owner'::app_role, organization_id) OR has_role_in_org((select auth.uid()), 'admin'::app_role, organization_id))));

DROP POLICY IF EXISTS "Users can view campaign queue in their org" ON public.campaign_queue;
CREATE POLICY "Users can view campaign queue in their org" ON public.campaign_queue
  FOR SELECT TO authenticated
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Allow select for org users" ON public.campaign_webhook_logs;
CREATE POLICY "Allow select for org users" ON public.campaign_webhook_logs
  FOR SELECT TO public
  USING ((organization_id IN ( SELECT profiles.organization_id
   FROM profiles
  WHERE (profiles.user_id = (select auth.uid())))));

DROP POLICY IF EXISTS "Users can delete campaigns in their organization" ON public.campaigns;
CREATE POLICY "Users can delete campaigns in their organization" ON public.campaigns
  FOR DELETE TO public
  USING ((organization_id IN ( SELECT profiles.organization_id
   FROM profiles
  WHERE (profiles.user_id = (select auth.uid())))));

DROP POLICY IF EXISTS "Users can insert campaigns to their organization" ON public.campaigns;
CREATE POLICY "Users can insert campaigns to their organization" ON public.campaigns
  FOR INSERT TO public
  WITH CHECK ((organization_id IN ( SELECT profiles.organization_id
   FROM profiles
  WHERE (profiles.user_id = (select auth.uid())))));

DROP POLICY IF EXISTS "Users can update campaigns in their organization" ON public.campaigns;
CREATE POLICY "Users can update campaigns in their organization" ON public.campaigns
  FOR UPDATE TO public
  USING ((organization_id IN ( SELECT profiles.organization_id
   FROM profiles
  WHERE (profiles.user_id = (select auth.uid())))));

DROP POLICY IF EXISTS "Users can view campaigns from their organization" ON public.campaigns;
CREATE POLICY "Users can view campaigns from their organization" ON public.campaigns
  FOR SELECT TO public
  USING ((organization_id IN ( SELECT profiles.organization_id
   FROM profiles
  WHERE (profiles.user_id = (select auth.uid())))));

DROP POLICY IF EXISTS "Users can manage carousel models in their organization" ON public.carousel_models;
CREATE POLICY "Users can manage carousel models in their organization" ON public.carousel_models
  FOR ALL TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))))
  WITH CHECK ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Users can view carousel models in their organization" ON public.carousel_models;
CREATE POLICY "Users can view carousel models in their organization" ON public.carousel_models
  FOR SELECT TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Users can manage slides in their org carousels" ON public.carousel_slides;
CREATE POLICY "Users can manage slides in their org carousels" ON public.carousel_slides
  FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM carousels c
  WHERE ((c.id = carousel_slides.carousel_id) AND (c.organization_id = get_user_org_id((select auth.uid())))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM carousels c
  WHERE ((c.id = carousel_slides.carousel_id) AND (c.organization_id = get_user_org_id((select auth.uid())))))));

DROP POLICY IF EXISTS "Users can view slides in their org carousels" ON public.carousel_slides;
CREATE POLICY "Users can view slides in their org carousels" ON public.carousel_slides
  FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM carousels c
  WHERE ((c.id = carousel_slides.carousel_id) AND (c.organization_id = get_user_org_id((select auth.uid())))))));

DROP POLICY IF EXISTS "Users can manage carousels in their organization" ON public.carousels;
CREATE POLICY "Users can manage carousels in their organization" ON public.carousels
  FOR ALL TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))))
  WITH CHECK ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Users can view carousels in their organization" ON public.carousels;
CREATE POLICY "Users can view carousels in their organization" ON public.carousels
  FOR SELECT TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS case_activity_insert ON public.case_activity_log;
CREATE POLICY case_activity_insert ON public.case_activity_log
  FOR INSERT TO authenticated
  WITH CHECK ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS case_activity_select ON public.case_activity_log;
CREATE POLICY case_activity_select ON public.case_activity_log
  FOR SELECT TO authenticated
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS case_categories_org_access ON public.case_categories;
CREATE POLICY case_categories_org_access ON public.case_categories
  FOR ALL TO authenticated
  USING ((organization_id = get_user_org_id((select auth.uid()))))
  WITH CHECK ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS case_deadlines_org_access ON public.case_deadlines;
CREATE POLICY case_deadlines_org_access ON public.case_deadlines
  FOR ALL TO authenticated
  USING ((organization_id = get_user_org_id((select auth.uid()))))
  WITH CHECK ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS case_statuses_org_access ON public.case_statuses;
CREATE POLICY case_statuses_org_access ON public.case_statuses
  FOR ALL TO authenticated
  USING ((organization_id = get_user_org_id((select auth.uid()))))
  WITH CHECK ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Org members can delete task notifications" ON public.case_task_notifications;
CREATE POLICY "Org members can delete task notifications" ON public.case_task_notifications
  FOR DELETE TO public
  USING (user_belongs_to_org((select auth.uid()), organization_id));

DROP POLICY IF EXISTS "Org members can insert task notifications" ON public.case_task_notifications;
CREATE POLICY "Org members can insert task notifications" ON public.case_task_notifications
  FOR INSERT TO public
  WITH CHECK (user_belongs_to_org((select auth.uid()), organization_id));

DROP POLICY IF EXISTS "Org members can update task notifications" ON public.case_task_notifications;
CREATE POLICY "Org members can update task notifications" ON public.case_task_notifications
  FOR UPDATE TO public
  USING (user_belongs_to_org((select auth.uid()), organization_id));

DROP POLICY IF EXISTS "Org members can view task notifications" ON public.case_task_notifications;
CREATE POLICY "Org members can view task notifications" ON public.case_task_notifications
  FOR SELECT TO public
  USING (user_belongs_to_org((select auth.uid()), organization_id));

DROP POLICY IF EXISTS case_template_tasks_org_access ON public.case_template_tasks;
CREATE POLICY case_template_tasks_org_access ON public.case_template_tasks
  FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM case_templates t
  WHERE ((t.id = case_template_tasks.template_id) AND (t.organization_id = get_user_org_id((select auth.uid())))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM case_templates t
  WHERE ((t.id = case_template_tasks.template_id) AND (t.organization_id = get_user_org_id((select auth.uid())))))));

DROP POLICY IF EXISTS case_templates_org_access ON public.case_templates;
CREATE POLICY case_templates_org_access ON public.case_templates
  FOR ALL TO authenticated
  USING ((organization_id = get_user_org_id((select auth.uid()))))
  WITH CHECK ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS case_triggers_org_access ON public.case_triggers;
CREATE POLICY case_triggers_org_access ON public.case_triggers
  FOR ALL TO authenticated
  USING ((organization_id = get_user_org_id((select auth.uid()))))
  WITH CHECK ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Users can manage files in their organization" ON public.contact_files;
CREATE POLICY "Users can manage files in their organization" ON public.contact_files
  FOR ALL TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Users can view files in their organization" ON public.contact_files;
CREATE POLICY "Users can view files in their organization" ON public.contact_files
  FOR SELECT TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Users can manage folders in their organization" ON public.contact_folders;
CREATE POLICY "Users can manage folders in their organization" ON public.contact_folders
  FOR ALL TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Users can view folders in their organization" ON public.contact_folders;
CREATE POLICY "Users can view folders in their organization" ON public.contact_folders
  FOR SELECT TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Users can manage notes in their organization" ON public.contact_notes;
CREATE POLICY "Users can manage notes in their organization" ON public.contact_notes
  FOR ALL TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Users can view notes in their organization" ON public.contact_notes;
CREATE POLICY "Users can view notes in their organization" ON public.contact_notes
  FOR SELECT TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Users can view presence in their organization" ON public.contact_presence;
CREATE POLICY "Users can view presence in their organization" ON public.contact_presence
  FOR SELECT TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Platform admins can manage conversation origin audit" ON public.conversation_origin_audit;
CREATE POLICY "Platform admins can manage conversation origin audit" ON public.conversation_origin_audit
  FOR ALL TO public
  USING (is_platform_admin((select auth.uid())))
  WITH CHECK (is_platform_admin((select auth.uid())));

DROP POLICY IF EXISTS "Users can view conversation origin audit in their org" ON public.conversation_origin_audit;
CREATE POLICY "Users can view conversation origin audit in their org" ON public.conversation_origin_audit
  FOR SELECT TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Admins can manage shares in their org" ON public.conversation_shares;
CREATE POLICY "Admins can manage shares in their org" ON public.conversation_shares
  FOR ALL TO public
  USING (((organization_id = get_user_org_id((select auth.uid()))) AND (has_role((select auth.uid()), 'owner'::app_role) OR has_role((select auth.uid()), 'admin'::app_role))))
  WITH CHECK (((organization_id = get_user_org_id((select auth.uid()))) AND (has_role((select auth.uid()), 'owner'::app_role) OR has_role((select auth.uid()), 'admin'::app_role))));

DROP POLICY IF EXISTS "Users can view shares in their org" ON public.conversation_shares;
CREATE POLICY "Users can view shares in their org" ON public.conversation_shares
  FOR SELECT TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Users can insert stage history in their org" ON public.conversation_stage_history;
CREATE POLICY "Users can insert stage history in their org" ON public.conversation_stage_history
  FOR INSERT TO public
  WITH CHECK ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Users can view stage history in their org" ON public.conversation_stage_history;
CREATE POLICY "Users can view stage history in their org" ON public.conversation_stage_history
  FOR SELECT TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Admins can manage statuses in their org" ON public.conversation_statuses;
CREATE POLICY "Admins can manage statuses in their org" ON public.conversation_statuses
  FOR ALL TO public
  USING (((organization_id = get_user_org_id((select auth.uid()))) AND (has_role((select auth.uid()), 'owner'::app_role) OR has_role((select auth.uid()), 'admin'::app_role))));

DROP POLICY IF EXISTS "Users can view statuses in their org" ON public.conversation_statuses;
CREATE POLICY "Users can view statuses in their org" ON public.conversation_statuses
  FOR SELECT TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Users can manage CRM entries in their org" ON public.crm_entries;
CREATE POLICY "Users can manage CRM entries in their org" ON public.crm_entries
  FOR ALL TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Users can view CRM entries in their org" ON public.crm_entries;
CREATE POLICY "Users can view CRM entries in their org" ON public.crm_entries
  FOR SELECT TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Admins can manage departments in their org" ON public.departments;
CREATE POLICY "Admins can manage departments in their org" ON public.departments
  FOR ALL TO public
  USING (((organization_id = get_user_org_id((select auth.uid()))) AND (has_role((select auth.uid()), 'owner'::app_role) OR has_role((select auth.uid()), 'admin'::app_role))));

DROP POLICY IF EXISTS "Users can view departments in their org" ON public.departments;
CREATE POLICY "Users can view departments in their org" ON public.departments
  FOR SELECT TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Users can manage document folders in their org" ON public.document_folders;
CREATE POLICY "Users can manage document folders in their org" ON public.document_folders
  FOR ALL TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Users can view document folders in their org" ON public.document_folders;
CREATE POLICY "Users can view document folders in their org" ON public.document_folders
  FOR SELECT TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Users can manage document packs in their org" ON public.document_packs;
CREATE POLICY "Users can manage document packs in their org" ON public.document_packs
  FOR ALL TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Users can view document packs in their org" ON public.document_packs;
CREATE POLICY "Users can view document packs in their org" ON public.document_packs
  FOR SELECT TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Users can manage signatures in their org" ON public.document_signatures;
CREATE POLICY "Users can manage signatures in their org" ON public.document_signatures
  FOR ALL TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Users can view signatures in their org" ON public.document_signatures;
CREATE POLICY "Users can view signatures in their org" ON public.document_signatures
  FOR SELECT TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Org members create document signers" ON public.document_signers;
CREATE POLICY "Org members create document signers" ON public.document_signers
  FOR INSERT TO public
  WITH CHECK ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Org members delete their document signers" ON public.document_signers;
CREATE POLICY "Org members delete their document signers" ON public.document_signers
  FOR DELETE TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Org members update their document signers" ON public.document_signers;
CREATE POLICY "Org members update their document signers" ON public.document_signers
  FOR UPDATE TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Org members view their document signers" ON public.document_signers;
CREATE POLICY "Org members view their document signers" ON public.document_signers
  FOR SELECT TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Users can manage document templates in their org" ON public.document_templates;
CREATE POLICY "Users can manage document templates in their org" ON public.document_templates
  FOR ALL TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Users can view document templates in their org" ON public.document_templates;
CREATE POLICY "Users can view document templates in their org" ON public.document_templates
  FOR SELECT TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Admins can manage backup logs" ON public.drive_backup_logs;
CREATE POLICY "Admins can manage backup logs" ON public.drive_backup_logs
  FOR ALL TO authenticated
  USING (((organization_id = get_user_org_id((select auth.uid()))) AND (has_role((select auth.uid()), 'owner'::app_role) OR has_role((select auth.uid()), 'admin'::app_role))))
  WITH CHECK (((organization_id = get_user_org_id((select auth.uid()))) AND (has_role((select auth.uid()), 'owner'::app_role) OR has_role((select auth.uid()), 'admin'::app_role))));

DROP POLICY IF EXISTS "Users can view backup logs in their org" ON public.drive_backup_logs;
CREATE POLICY "Users can view backup logs in their org" ON public.drive_backup_logs
  FOR SELECT TO authenticated
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Admins can manage drive configs" ON public.drive_configs;
CREATE POLICY "Admins can manage drive configs" ON public.drive_configs
  FOR ALL TO authenticated
  USING (((organization_id = get_user_org_id((select auth.uid()))) AND (has_role((select auth.uid()), 'owner'::app_role) OR has_role((select auth.uid()), 'admin'::app_role))))
  WITH CHECK (((organization_id = get_user_org_id((select auth.uid()))) AND (has_role((select auth.uid()), 'owner'::app_role) OR has_role((select auth.uid()), 'admin'::app_role))));

DROP POLICY IF EXISTS "Admins can view drive configs" ON public.drive_configs;
CREATE POLICY "Admins can view drive configs" ON public.drive_configs
  FOR SELECT TO authenticated
  USING (((organization_id = get_user_org_id((select auth.uid()))) AND (has_role_in_org((select auth.uid()), 'owner'::app_role, organization_id) OR has_role_in_org((select auth.uid()), 'admin'::app_role, organization_id))));

DROP POLICY IF EXISTS "Platform admins read entry flow assignments" ON public.entry_flow_assignments;
CREATE POLICY "Platform admins read entry flow assignments" ON public.entry_flow_assignments
  FOR SELECT TO public
  USING (is_platform_admin((select auth.uid())));

DROP POLICY IF EXISTS "Platform admins read entry flow events" ON public.entry_flow_events;
CREATE POLICY "Platform admins read entry flow events" ON public.entry_flow_events
  FOR SELECT TO public
  USING (is_platform_admin((select auth.uid())));

DROP POLICY IF EXISTS "Platform admins manage entry flow experiments" ON public.entry_flow_experiments;
CREATE POLICY "Platform admins manage entry flow experiments" ON public.entry_flow_experiments
  FOR ALL TO public
  USING (is_platform_admin((select auth.uid())))
  WITH CHECK (is_platform_admin((select auth.uid())));

DROP POLICY IF EXISTS "Platform admins manage entry flow variants" ON public.entry_flow_variants;
CREATE POLICY "Platform admins manage entry flow variants" ON public.entry_flow_variants
  FOR ALL TO public
  USING (is_platform_admin((select auth.uid())))
  WITH CHECK (is_platform_admin((select auth.uid())));

DROP POLICY IF EXISTS "Wizzy Flow workspace row access" ON public.external_participants;
CREATE POLICY "Wizzy Flow workspace row access" ON public.external_participants
  FOR ALL TO public
  USING (((workspace_id IS NOT NULL) AND user_has_workspace_access((select auth.uid()), workspace_id)))
  WITH CHECK (((workspace_id IS NOT NULL) AND user_has_workspace_access((select auth.uid()), workspace_id)));

DROP POLICY IF EXISTS "Users can manage executions in their organization" ON public.flow_executions;
CREATE POLICY "Users can manage executions in their organization" ON public.flow_executions
  FOR ALL TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Users can view executions in their organization" ON public.flow_executions;
CREATE POLICY "Users can view executions in their organization" ON public.flow_executions
  FOR SELECT TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Users can manage folders in their organization" ON public.flow_folders;
CREATE POLICY "Users can manage folders in their organization" ON public.flow_folders
  FOR ALL TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Users can view folders in their organization" ON public.flow_folders;
CREATE POLICY "Users can view folders in their organization" ON public.flow_folders
  FOR SELECT TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Users can view flow node logs in their org" ON public.flow_node_logs;
CREATE POLICY "Users can view flow node logs in their org" ON public.flow_node_logs
  FOR SELECT TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Users can manage flows in their organization" ON public.flows;
CREATE POLICY "Users can manage flows in their organization" ON public.flows
  FOR ALL TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Users can view flows in their organization" ON public.flows;
CREATE POLICY "Users can view flows in their organization" ON public.flows
  FOR SELECT TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Users can manage own org followup templates" ON public.followup_templates;
CREATE POLICY "Users can manage own org followup templates" ON public.followup_templates
  FOR ALL TO authenticated
  USING ((organization_id = get_user_org_id((select auth.uid()))))
  WITH CHECK ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Users can manage generated documents in their org" ON public.generated_documents;
CREATE POLICY "Users can manage generated documents in their org" ON public.generated_documents
  FOR ALL TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Users can view generated documents in their org" ON public.generated_documents;
CREATE POLICY "Users can view generated documents in their org" ON public.generated_documents
  FOR SELECT TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Platform admins can manage governance logs" ON public.governance_action_logs;
CREATE POLICY "Platform admins can manage governance logs" ON public.governance_action_logs
  FOR ALL TO public
  USING (is_platform_admin((select auth.uid())));

DROP POLICY IF EXISTS "Platform admins can manage certifications" ON public.governance_certifications;
CREATE POLICY "Platform admins can manage certifications" ON public.governance_certifications
  FOR ALL TO public
  USING (is_platform_admin((select auth.uid())));

DROP POLICY IF EXISTS "Platform admins full access" ON public.governance_checks;
CREATE POLICY "Platform admins full access" ON public.governance_checks
  FOR ALL TO public
  USING (is_platform_admin((select auth.uid())));

DROP POLICY IF EXISTS "Platform admins full access" ON public.governance_prompt_versions;
CREATE POLICY "Platform admins full access" ON public.governance_prompt_versions
  FOR ALL TO public
  USING (is_platform_admin((select auth.uid())));

DROP POLICY IF EXISTS "Platform admins full access" ON public.governance_prompts;
CREATE POLICY "Platform admins full access" ON public.governance_prompts
  FOR ALL TO public
  USING (is_platform_admin((select auth.uid())));

DROP POLICY IF EXISTS "Platform admins can manage score history" ON public.governance_score_history;
CREATE POLICY "Platform admins can manage score history" ON public.governance_score_history
  FOR ALL TO public
  USING (is_platform_admin((select auth.uid())));

DROP POLICY IF EXISTS "Platform admins full access" ON public.governance_snapshots;
CREATE POLICY "Platform admins full access" ON public.governance_snapshots
  FOR ALL TO public
  USING (is_platform_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admins can manage integration configs" ON public.integration_configs;
CREATE POLICY "Admins can manage integration configs" ON public.integration_configs
  FOR ALL TO public
  USING (((organization_id = get_user_org_id((select auth.uid()))) AND (has_role((select auth.uid()), 'owner'::app_role) OR has_role((select auth.uid()), 'admin'::app_role))));

DROP POLICY IF EXISTS "Admins can view integration configs" ON public.integration_configs;
CREATE POLICY "Admins can view integration configs" ON public.integration_configs
  FOR SELECT TO authenticated
  USING (((organization_id = get_user_org_id((select auth.uid()))) AND (has_role_in_org((select auth.uid()), 'owner'::app_role, organization_id) OR has_role_in_org((select auth.uid()), 'admin'::app_role, organization_id))));

DROP POLICY IF EXISTS "Admins can manage lead sources in their org" ON public.lead_sources;
CREATE POLICY "Admins can manage lead sources in their org" ON public.lead_sources
  FOR ALL TO public
  USING (((organization_id = get_user_org_id((select auth.uid()))) AND (has_role((select auth.uid()), 'owner'::app_role) OR has_role((select auth.uid()), 'admin'::app_role))));

DROP POLICY IF EXISTS "Users can view lead sources in their org" ON public.lead_sources;
CREATE POLICY "Users can view lead sources in their org" ON public.lead_sources
  FOR SELECT TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Admins can manage master prompts in their org" ON public.master_prompts;
CREATE POLICY "Admins can manage master prompts in their org" ON public.master_prompts
  FOR ALL TO public
  USING (((organization_id = get_user_org_id((select auth.uid()))) AND (has_role((select auth.uid()), 'owner'::app_role) OR has_role((select auth.uid()), 'admin'::app_role))));

DROP POLICY IF EXISTS "Users can view master prompts in their org" ON public.master_prompts;
CREATE POLICY "Users can view master prompts in their org" ON public.master_prompts
  FOR SELECT TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Users can view transcriptions for their org messages" ON public.media_transcriptions;
CREATE POLICY "Users can view transcriptions for their org messages" ON public.media_transcriptions
  FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM (messages m
     JOIN conversations c ON ((c.id = m.conversation_id)))
  WHERE ((m.id = media_transcriptions.message_id) AND (c.organization_id = get_user_org_id((select auth.uid())))))));

DROP POLICY IF EXISTS "Admins/Owners can delete organization knowledge" ON public.organization_knowledge;
CREATE POLICY "Admins/Owners can delete organization knowledge" ON public.organization_knowledge
  FOR DELETE TO public
  USING ((user_belongs_to_org((select auth.uid()), organization_id) AND (has_role((select auth.uid()), 'owner'::app_role) OR has_role((select auth.uid()), 'admin'::app_role))));

DROP POLICY IF EXISTS "Admins/Owners can insert organization knowledge" ON public.organization_knowledge;
CREATE POLICY "Admins/Owners can insert organization knowledge" ON public.organization_knowledge
  FOR INSERT TO public
  WITH CHECK ((user_belongs_to_org((select auth.uid()), organization_id) AND (has_role((select auth.uid()), 'owner'::app_role) OR has_role((select auth.uid()), 'admin'::app_role))));

DROP POLICY IF EXISTS "Admins/Owners can update organization knowledge" ON public.organization_knowledge;
CREATE POLICY "Admins/Owners can update organization knowledge" ON public.organization_knowledge
  FOR UPDATE TO public
  USING ((user_belongs_to_org((select auth.uid()), organization_id) AND (has_role((select auth.uid()), 'owner'::app_role) OR has_role((select auth.uid()), 'admin'::app_role))));

DROP POLICY IF EXISTS "Members can view their organization knowledge" ON public.organization_knowledge;
CREATE POLICY "Members can view their organization knowledge" ON public.organization_knowledge
  FOR SELECT TO public
  USING (user_belongs_to_org((select auth.uid()), organization_id));

DROP POLICY IF EXISTS "Organization managers can view organization memberships" ON public.organization_members;
CREATE POLICY "Organization managers can view organization memberships" ON public.organization_members
  FOR SELECT TO public
  USING (user_can_manage_org((select auth.uid()), organization_id));

DROP POLICY IF EXISTS "Organization owners and admins manage organization memberships" ON public.organization_members;
CREATE POLICY "Organization owners and admins manage organization memberships" ON public.organization_members
  FOR ALL TO public
  USING (user_can_manage_org((select auth.uid()), organization_id))
  WITH CHECK (user_can_manage_org((select auth.uid()), organization_id));

DROP POLICY IF EXISTS "Users can view own organization memberships" ON public.organization_members;
CREATE POLICY "Users can view own organization memberships" ON public.organization_members
  FOR SELECT TO public
  USING ((user_id = (select auth.uid())));

DROP POLICY IF EXISTS "Organization members can view organization plan" ON public.organization_plans;
CREATE POLICY "Organization members can view organization plan" ON public.organization_plans
  FOR SELECT TO public
  USING (user_is_org_member((select auth.uid()), organization_id));

DROP POLICY IF EXISTS "Platform admins full access" ON public.organization_plans;
CREATE POLICY "Platform admins full access" ON public.organization_plans
  FOR ALL TO public
  USING (is_platform_admin((select auth.uid())));

DROP POLICY IF EXISTS "Platform admins full access" ON public.organization_usage;
CREATE POLICY "Platform admins full access" ON public.organization_usage
  FOR ALL TO public
  USING (is_platform_admin((select auth.uid())));

DROP POLICY IF EXISTS "Organization members can view organizations" ON public.organizations;
CREATE POLICY "Organization members can view organizations" ON public.organizations
  FOR SELECT TO public
  USING (user_is_org_member((select auth.uid()), id));

DROP POLICY IF EXISTS "Organization owners and admins can update organizations" ON public.organizations;
CREATE POLICY "Organization owners and admins can update organizations" ON public.organizations
  FOR UPDATE TO public
  USING (user_can_manage_org((select auth.uid()), id))
  WITH CHECK (user_can_manage_org((select auth.uid()), id));

DROP POLICY IF EXISTS "Owners and admins can update organization" ON public.organizations;
CREATE POLICY "Owners and admins can update organization" ON public.organizations
  FOR UPDATE TO public
  USING ((user_belongs_to_org((select auth.uid()), id) AND (has_role((select auth.uid()), 'owner'::app_role) OR has_role((select auth.uid()), 'admin'::app_role))));

DROP POLICY IF EXISTS "Users can view their organization" ON public.organizations;
CREATE POLICY "Users can view their organization" ON public.organizations
  FOR SELECT TO public
  USING (user_belongs_to_org((select auth.uid()), id));

DROP POLICY IF EXISTS "Members can delete pack fixed signers" ON public.pack_fixed_signers;
CREATE POLICY "Members can delete pack fixed signers" ON public.pack_fixed_signers
  FOR DELETE TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Members can insert pack fixed signers" ON public.pack_fixed_signers;
CREATE POLICY "Members can insert pack fixed signers" ON public.pack_fixed_signers
  FOR INSERT TO public
  WITH CHECK ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Members can update pack fixed signers" ON public.pack_fixed_signers;
CREATE POLICY "Members can update pack fixed signers" ON public.pack_fixed_signers
  FOR UPDATE TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Members can view pack fixed signers" ON public.pack_fixed_signers;
CREATE POLICY "Members can view pack fixed signers" ON public.pack_fixed_signers
  FOR SELECT TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Users can manage columns in their org pipelines" ON public.pipeline_columns;
CREATE POLICY "Users can manage columns in their org pipelines" ON public.pipeline_columns
  FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM pipelines p
  WHERE ((p.id = pipeline_columns.pipeline_id) AND (p.organization_id = get_user_org_id((select auth.uid())))))));

DROP POLICY IF EXISTS "Users can view columns in their org pipelines" ON public.pipeline_columns;
CREATE POLICY "Users can view columns in their org pipelines" ON public.pipeline_columns
  FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM pipelines p
  WHERE ((p.id = pipeline_columns.pipeline_id) AND (p.organization_id = get_user_org_id((select auth.uid())))))));

DROP POLICY IF EXISTS "Users can manage pipelines in their organization" ON public.pipelines;
CREATE POLICY "Users can manage pipelines in their organization" ON public.pipelines
  FOR ALL TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Users can view pipelines in their organization" ON public.pipelines;
CREATE POLICY "Users can view pipelines in their organization" ON public.pipelines
  FOR SELECT TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Platform admins full access" ON public.platform_api_keys;
CREATE POLICY "Platform admins full access" ON public.platform_api_keys
  FOR ALL TO public
  USING (is_platform_admin((select auth.uid())));

DROP POLICY IF EXISTS "Authenticated users can view published packages" ON public.platform_packages;
CREATE POLICY "Authenticated users can view published packages" ON public.platform_packages
  FOR SELECT TO public
  USING (((is_published = true) OR is_platform_admin((select auth.uid()))));

DROP POLICY IF EXISTS "Platform admins can delete packages" ON public.platform_packages;
CREATE POLICY "Platform admins can delete packages" ON public.platform_packages
  FOR DELETE TO public
  USING (is_platform_admin((select auth.uid())));

DROP POLICY IF EXISTS "Platform admins can insert packages" ON public.platform_packages;
CREATE POLICY "Platform admins can insert packages" ON public.platform_packages
  FOR INSERT TO public
  WITH CHECK (is_platform_admin((select auth.uid())));

DROP POLICY IF EXISTS "Platform admins can update packages" ON public.platform_packages;
CREATE POLICY "Platform admins can update packages" ON public.platform_packages
  FOR UPDATE TO public
  USING (is_platform_admin((select auth.uid())));

DROP POLICY IF EXISTS "Platform admins full access" ON public.platform_plans;
CREATE POLICY "Platform admins full access" ON public.platform_plans
  FOR ALL TO public
  USING (is_platform_admin((select auth.uid())));

DROP POLICY IF EXISTS "Platform admins can manage settings" ON public.platform_settings;
CREATE POLICY "Platform admins can manage settings" ON public.platform_settings
  FOR ALL TO public
  USING (is_platform_admin((select auth.uid())));

DROP POLICY IF EXISTS "Wizzy Flow workspace row access" ON public.positions;
CREATE POLICY "Wizzy Flow workspace row access" ON public.positions
  FOR ALL TO public
  USING (((workspace_id IS NOT NULL) AND user_has_workspace_access((select auth.uid()), workspace_id)))
  WITH CHECK (((workspace_id IS NOT NULL) AND user_has_workspace_access((select auth.uid()), workspace_id)));

DROP POLICY IF EXISTS "Wizzy Flow workspace row access" ON public.process_documentation;
CREATE POLICY "Wizzy Flow workspace row access" ON public.process_documentation
  FOR ALL TO public
  USING (((workspace_id IS NOT NULL) AND user_has_workspace_access((select auth.uid()), workspace_id)))
  WITH CHECK (((workspace_id IS NOT NULL) AND user_has_workspace_access((select auth.uid()), workspace_id)));

DROP POLICY IF EXISTS "Admins can update profiles in their org" ON public.profiles;
CREATE POLICY "Admins can update profiles in their org" ON public.profiles
  FOR UPDATE TO authenticated
  USING (((organization_id = get_user_org_id((select auth.uid()))) AND (has_role((select auth.uid()), 'owner'::app_role) OR has_role((select auth.uid()), 'admin'::app_role))));

DROP POLICY IF EXISTS "Organization members can view profiles in their organizations" ON public.profiles;
CREATE POLICY "Organization members can view profiles in their organizations" ON public.profiles
  FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM (organization_members viewer
     JOIN organization_members target ON ((target.organization_id = viewer.organization_id)))
  WHERE ((viewer.user_id = (select auth.uid())) AND (target.user_id = profiles.user_id)))));

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (((user_id = (select auth.uid())) AND ((organization_id IS NULL) OR (organization_id = get_user_org_id((select auth.uid()))) OR (NOT (EXISTS ( SELECT 1
   FROM profiles profiles_1
  WHERE (profiles_1.user_id = (select auth.uid()))))))));

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile" ON public.profiles
  FOR INSERT TO public
  WITH CHECK ((user_id = (select auth.uid())));

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE TO public
  USING ((user_id = (select auth.uid())));

DROP POLICY IF EXISTS "Users can view profiles in their organization" ON public.profiles;
CREATE POLICY "Users can view profiles in their organization" ON public.profiles
  FOR SELECT TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Wizzy Flow project members access" ON public.project_members;
CREATE POLICY "Wizzy Flow project members access" ON public.project_members
  FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = project_members.project_id) AND (p.workspace_id IS NOT NULL) AND user_has_workspace_access((select auth.uid()), p.workspace_id)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = project_members.project_id) AND (p.workspace_id IS NOT NULL) AND user_has_workspace_access((select auth.uid()), p.workspace_id)))));

DROP POLICY IF EXISTS "Wizzy Flow workspace row access" ON public.project_templates;
CREATE POLICY "Wizzy Flow workspace row access" ON public.project_templates
  FOR ALL TO public
  USING (((workspace_id IS NOT NULL) AND user_has_workspace_access((select auth.uid()), workspace_id)))
  WITH CHECK (((workspace_id IS NOT NULL) AND user_has_workspace_access((select auth.uid()), workspace_id)));

DROP POLICY IF EXISTS "Wizzy Flow workspace row access" ON public.projects;
CREATE POLICY "Wizzy Flow workspace row access" ON public.projects
  FOR ALL TO public
  USING (((workspace_id IS NOT NULL) AND user_has_workspace_access((select auth.uid()), workspace_id)))
  WITH CHECK (((workspace_id IS NOT NULL) AND user_has_workspace_access((select auth.uid()), workspace_id)));

DROP POLICY IF EXISTS "Admins can manage quiz questions" ON public.quiz_questions;
CREATE POLICY "Admins can manage quiz questions" ON public.quiz_questions
  FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM quizzes q
  WHERE ((q.id = quiz_questions.quiz_id) AND (q.organization_id = get_user_org_id((select auth.uid()))) AND (has_role((select auth.uid()), 'owner'::app_role) OR has_role((select auth.uid()), 'admin'::app_role))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM quizzes q
  WHERE ((q.id = quiz_questions.quiz_id) AND (q.organization_id = get_user_org_id((select auth.uid()))) AND (has_role((select auth.uid()), 'owner'::app_role) OR has_role((select auth.uid()), 'admin'::app_role))))));

DROP POLICY IF EXISTS "Users can view quiz questions" ON public.quiz_questions;
CREATE POLICY "Users can view quiz questions" ON public.quiz_questions
  FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM quizzes q
  WHERE ((q.id = quiz_questions.quiz_id) AND (q.organization_id = get_user_org_id((select auth.uid())))))));

DROP POLICY IF EXISTS "Admins can manage submissions" ON public.quiz_submissions;
CREATE POLICY "Admins can manage submissions" ON public.quiz_submissions
  FOR ALL TO authenticated
  USING (((organization_id = get_user_org_id((select auth.uid()))) AND (has_role((select auth.uid()), 'owner'::app_role) OR has_role((select auth.uid()), 'admin'::app_role))))
  WITH CHECK (((organization_id = get_user_org_id((select auth.uid()))) AND (has_role((select auth.uid()), 'owner'::app_role) OR has_role((select auth.uid()), 'admin'::app_role))));

DROP POLICY IF EXISTS "Users can view submissions in their org" ON public.quiz_submissions;
CREATE POLICY "Users can view submissions in their org" ON public.quiz_submissions
  FOR SELECT TO authenticated
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Admins can manage quizzes in their org" ON public.quizzes;
CREATE POLICY "Admins can manage quizzes in their org" ON public.quizzes
  FOR ALL TO authenticated
  USING (((organization_id = get_user_org_id((select auth.uid()))) AND (has_role((select auth.uid()), 'owner'::app_role) OR has_role((select auth.uid()), 'admin'::app_role))))
  WITH CHECK (((organization_id = get_user_org_id((select auth.uid()))) AND (has_role((select auth.uid()), 'owner'::app_role) OR has_role((select auth.uid()), 'admin'::app_role))));

DROP POLICY IF EXISTS "Users can view quizzes in their org" ON public.quizzes;
CREATE POLICY "Users can view quizzes in their org" ON public.quizzes
  FOR SELECT TO authenticated
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Wizzy Flow workspace row access" ON public.recurring_tasks;
CREATE POLICY "Wizzy Flow workspace row access" ON public.recurring_tasks
  FOR ALL TO public
  USING (((workspace_id IS NOT NULL) AND user_has_workspace_access((select auth.uid()), workspace_id)))
  WITH CHECK (((workspace_id IS NOT NULL) AND user_has_workspace_access((select auth.uid()), workspace_id)));

DROP POLICY IF EXISTS "Wizzy Flow routine subtasks access" ON public.routine_task_subtasks;
CREATE POLICY "Wizzy Flow routine subtasks access" ON public.routine_task_subtasks
  FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM (routine_tasks rt
     JOIN routines r ON ((r.id = rt.routine_id)))
  WHERE ((rt.id = routine_task_subtasks.routine_task_id) AND (r.workspace_id IS NOT NULL) AND user_has_workspace_access((select auth.uid()), r.workspace_id)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (routine_tasks rt
     JOIN routines r ON ((r.id = rt.routine_id)))
  WHERE ((rt.id = routine_task_subtasks.routine_task_id) AND (r.workspace_id IS NOT NULL) AND user_has_workspace_access((select auth.uid()), r.workspace_id)))));

DROP POLICY IF EXISTS "Wizzy Flow routine tasks access" ON public.routine_tasks;
CREATE POLICY "Wizzy Flow routine tasks access" ON public.routine_tasks
  FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM routines r
  WHERE ((r.id = routine_tasks.routine_id) AND (r.workspace_id IS NOT NULL) AND user_has_workspace_access((select auth.uid()), r.workspace_id)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM routines r
  WHERE ((r.id = routine_tasks.routine_id) AND (r.workspace_id IS NOT NULL) AND user_has_workspace_access((select auth.uid()), r.workspace_id)))));

DROP POLICY IF EXISTS "Wizzy Flow workspace row access" ON public.routines;
CREATE POLICY "Wizzy Flow workspace row access" ON public.routines
  FOR ALL TO public
  USING (((workspace_id IS NOT NULL) AND user_has_workspace_access((select auth.uid()), workspace_id)))
  WITH CHECK (((workspace_id IS NOT NULL) AND user_has_workspace_access((select auth.uid()), workspace_id)));

DROP POLICY IF EXISTS "Users can create scheduled message contacts via org" ON public.scheduled_message_contacts;
CREATE POLICY "Users can create scheduled message contacts via org" ON public.scheduled_message_contacts
  FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM scheduled_messages sm
  WHERE ((sm.id = scheduled_message_contacts.scheduled_message_id) AND (sm.organization_id = get_user_org_id((select auth.uid())))))));

DROP POLICY IF EXISTS "Users can delete scheduled message contacts via org" ON public.scheduled_message_contacts;
CREATE POLICY "Users can delete scheduled message contacts via org" ON public.scheduled_message_contacts
  FOR DELETE TO public
  USING ((EXISTS ( SELECT 1
   FROM scheduled_messages sm
  WHERE ((sm.id = scheduled_message_contacts.scheduled_message_id) AND (sm.organization_id = get_user_org_id((select auth.uid())))))));

DROP POLICY IF EXISTS "Users can update scheduled message contacts via org" ON public.scheduled_message_contacts;
CREATE POLICY "Users can update scheduled message contacts via org" ON public.scheduled_message_contacts
  FOR UPDATE TO public
  USING ((EXISTS ( SELECT 1
   FROM scheduled_messages sm
  WHERE ((sm.id = scheduled_message_contacts.scheduled_message_id) AND (sm.organization_id = get_user_org_id((select auth.uid())))))));

DROP POLICY IF EXISTS "Users can view scheduled message contacts via org" ON public.scheduled_message_contacts;
CREATE POLICY "Users can view scheduled message contacts via org" ON public.scheduled_message_contacts
  FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM scheduled_messages sm
  WHERE ((sm.id = scheduled_message_contacts.scheduled_message_id) AND (sm.organization_id = get_user_org_id((select auth.uid())))))));

DROP POLICY IF EXISTS "Users can create scheduled messages for their org" ON public.scheduled_messages;
CREATE POLICY "Users can create scheduled messages for their org" ON public.scheduled_messages
  FOR INSERT TO public
  WITH CHECK ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Users can delete their org scheduled messages" ON public.scheduled_messages;
CREATE POLICY "Users can delete their org scheduled messages" ON public.scheduled_messages
  FOR DELETE TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Users can update their org scheduled messages" ON public.scheduled_messages;
CREATE POLICY "Users can update their org scheduled messages" ON public.scheduled_messages
  FOR UPDATE TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Users can view their org scheduled messages" ON public.scheduled_messages;
CREATE POLICY "Users can view their org scheduled messages" ON public.scheduled_messages
  FOR SELECT TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Org members can view signature evidence" ON public.signature_evidence;
CREATE POLICY "Org members can view signature evidence" ON public.signature_evidence
  FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM (document_signatures ds
     JOIN profiles p ON ((p.organization_id = ds.organization_id)))
  WHERE ((ds.id = signature_evidence.signature_id) AND (p.user_id = (select auth.uid()))))));

DROP POLICY IF EXISTS "Admins can manage stage notifications" ON public.stage_notifications;
CREATE POLICY "Admins can manage stage notifications" ON public.stage_notifications
  FOR ALL TO public
  USING (((organization_id = get_user_org_id((select auth.uid()))) AND (has_role((select auth.uid()), 'owner'::app_role) OR has_role((select auth.uid()), 'admin'::app_role))));

DROP POLICY IF EXISTS "Users can view stage notifications in their org" ON public.stage_notifications;
CREATE POLICY "Users can view stage notifications in their org" ON public.stage_notifications
  FOR SELECT TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Users can manage tags in their organization" ON public.tags;
CREATE POLICY "Users can manage tags in their organization" ON public.tags
  FOR ALL TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Users can view tags in their organization" ON public.tags;
CREATE POLICY "Users can view tags in their organization" ON public.tags
  FOR SELECT TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Wizzy Flow task child access" ON public.task_external_assignees;
CREATE POLICY "Wizzy Flow task child access" ON public.task_external_assignees
  FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM (tasks t
     LEFT JOIN projects p ON ((p.id = t.project_id)))
  WHERE ((t.id = task_external_assignees.task_id) AND (((t.workspace_id IS NOT NULL) AND user_has_workspace_access((select auth.uid()), t.workspace_id)) OR ((p.workspace_id IS NOT NULL) AND user_has_workspace_access((select auth.uid()), p.workspace_id)))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (tasks t
     LEFT JOIN projects p ON ((p.id = t.project_id)))
  WHERE ((t.id = task_external_assignees.task_id) AND (((t.workspace_id IS NOT NULL) AND user_has_workspace_access((select auth.uid()), t.workspace_id)) OR ((p.workspace_id IS NOT NULL) AND user_has_workspace_access((select auth.uid()), p.workspace_id)))))));

DROP POLICY IF EXISTS "Org members can delete template_fixed_signers" ON public.template_fixed_signers;
CREATE POLICY "Org members can delete template_fixed_signers" ON public.template_fixed_signers
  FOR DELETE TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Org members can insert template_fixed_signers" ON public.template_fixed_signers;
CREATE POLICY "Org members can insert template_fixed_signers" ON public.template_fixed_signers
  FOR INSERT TO public
  WITH CHECK ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Org members can update template_fixed_signers" ON public.template_fixed_signers;
CREATE POLICY "Org members can update template_fixed_signers" ON public.template_fixed_signers
  FOR UPDATE TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Org members can view template_fixed_signers" ON public.template_fixed_signers;
CREATE POLICY "Org members can view template_fixed_signers" ON public.template_fixed_signers
  FOR SELECT TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Wizzy Flow template child access" ON public.template_subtasks;
CREATE POLICY "Wizzy Flow template child access" ON public.template_subtasks
  FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM (template_tasks tt
     JOIN project_templates pt ON ((pt.id = tt.template_id)))
  WHERE ((tt.id = template_subtasks.template_task_id) AND (pt.workspace_id IS NOT NULL) AND user_has_workspace_access((select auth.uid()), pt.workspace_id)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (template_tasks tt
     JOIN project_templates pt ON ((pt.id = tt.template_id)))
  WHERE ((tt.id = template_subtasks.template_task_id) AND (pt.workspace_id IS NOT NULL) AND user_has_workspace_access((select auth.uid()), pt.workspace_id)))));

DROP POLICY IF EXISTS "Wizzy Flow template child access" ON public.template_task_assignees;
CREATE POLICY "Wizzy Flow template child access" ON public.template_task_assignees
  FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM (template_tasks tt
     JOIN project_templates pt ON ((pt.id = tt.template_id)))
  WHERE ((tt.id = template_task_assignees.template_task_id) AND (pt.workspace_id IS NOT NULL) AND user_has_workspace_access((select auth.uid()), pt.workspace_id)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (template_tasks tt
     JOIN project_templates pt ON ((pt.id = tt.template_id)))
  WHERE ((tt.id = template_task_assignees.template_task_id) AND (pt.workspace_id IS NOT NULL) AND user_has_workspace_access((select auth.uid()), pt.workspace_id)))));

DROP POLICY IF EXISTS "Wizzy Flow template child access" ON public.template_task_processes;
CREATE POLICY "Wizzy Flow template child access" ON public.template_task_processes
  FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM (template_tasks tt
     JOIN project_templates pt ON ((pt.id = tt.template_id)))
  WHERE ((tt.id = template_task_processes.template_task_id) AND (pt.workspace_id IS NOT NULL) AND user_has_workspace_access((select auth.uid()), pt.workspace_id)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (template_tasks tt
     JOIN project_templates pt ON ((pt.id = tt.template_id)))
  WHERE ((tt.id = template_task_processes.template_task_id) AND (pt.workspace_id IS NOT NULL) AND user_has_workspace_access((select auth.uid()), pt.workspace_id)))));

DROP POLICY IF EXISTS "Wizzy Flow template child access" ON public.template_tasks;
CREATE POLICY "Wizzy Flow template child access" ON public.template_tasks
  FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM project_templates pt
  WHERE ((pt.id = template_tasks.template_id) AND (pt.workspace_id IS NOT NULL) AND user_has_workspace_access((select auth.uid()), pt.workspace_id)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM project_templates pt
  WHERE ((pt.id = template_tasks.template_id) AND (pt.workspace_id IS NOT NULL) AND user_has_workspace_access((select auth.uid()), pt.workspace_id)))));

DROP POLICY IF EXISTS "Platform admins full access on user_fingerprints" ON public.user_fingerprints;
CREATE POLICY "Platform admins full access on user_fingerprints" ON public.user_fingerprints
  FOR ALL TO public
  USING (is_platform_admin((select auth.uid())));

DROP POLICY IF EXISTS "Owners and admins can manage permissions" ON public.user_permissions;
CREATE POLICY "Owners and admins can manage permissions" ON public.user_permissions
  FOR ALL TO public
  USING (((organization_id = get_user_org_id((select auth.uid()))) AND (has_role((select auth.uid()), 'owner'::app_role) OR has_role((select auth.uid()), 'admin'::app_role))));

DROP POLICY IF EXISTS "Users can view org permissions" ON public.user_permissions;
CREATE POLICY "Users can view org permissions" ON public.user_permissions
  FOR SELECT TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Users can view their own permissions" ON public.user_permissions;
CREATE POLICY "Users can view their own permissions" ON public.user_permissions
  FOR SELECT TO public
  USING ((user_id = (select auth.uid())));

DROP POLICY IF EXISTS "Owners can manage roles" ON public.user_roles;
CREATE POLICY "Owners can manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (((organization_id = get_user_org_id((select auth.uid()))) AND has_role((select auth.uid()), 'owner'::app_role)))
  WITH CHECK (((organization_id = get_user_org_id((select auth.uid()))) AND has_role((select auth.uid()), 'owner'::app_role) AND (role <> 'platform_admin'::app_role)));

DROP POLICY IF EXISTS "Users can view roles in their organization" ON public.user_roles;
CREATE POLICY "Users can view roles in their organization" ON public.user_roles
  FOR SELECT TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Users can view connection logs in their org" ON public.whatsapp_connection_logs;
CREATE POLICY "Users can view connection logs in their org" ON public.whatsapp_connection_logs
  FOR SELECT TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Users can manage groups in their organization" ON public.whatsapp_groups;
CREATE POLICY "Users can manage groups in their organization" ON public.whatsapp_groups
  FOR ALL TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Users can view groups in their organization" ON public.whatsapp_groups;
CREATE POLICY "Users can view groups in their organization" ON public.whatsapp_groups
  FOR SELECT TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Admins can manage WhatsApp instances" ON public.whatsapp_instances;
CREATE POLICY "Admins can manage WhatsApp instances" ON public.whatsapp_instances
  FOR ALL TO authenticated
  USING (((organization_id = get_user_org_id((select auth.uid()))) AND (has_role_in_org((select auth.uid()), 'owner'::app_role, organization_id) OR has_role_in_org((select auth.uid()), 'admin'::app_role, organization_id))))
  WITH CHECK (((organization_id = get_user_org_id((select auth.uid()))) AND (has_role_in_org((select auth.uid()), 'owner'::app_role, organization_id) OR has_role_in_org((select auth.uid()), 'admin'::app_role, organization_id))));

DROP POLICY IF EXISTS "Admins can view WhatsApp instances" ON public.whatsapp_instances;
CREATE POLICY "Admins can view WhatsApp instances" ON public.whatsapp_instances
  FOR SELECT TO authenticated
  USING (((organization_id = get_user_org_id((select auth.uid()))) AND (has_role_in_org((select auth.uid()), 'owner'::app_role, organization_id) OR has_role_in_org((select auth.uid()), 'admin'::app_role, organization_id))));

DROP POLICY IF EXISTS "Users can manage custom fields via widget" ON public.widget_custom_fields;
CREATE POLICY "Users can manage custom fields via widget" ON public.widget_custom_fields
  FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM widgets w
  WHERE ((w.id = widget_custom_fields.widget_id) AND (w.organization_id = get_user_org_id((select auth.uid())))))));

DROP POLICY IF EXISTS "Users can view custom fields via widget" ON public.widget_custom_fields;
CREATE POLICY "Users can view custom fields via widget" ON public.widget_custom_fields
  FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM widgets w
  WHERE ((w.id = widget_custom_fields.widget_id) AND (w.organization_id = get_user_org_id((select auth.uid())))))));

DROP POLICY IF EXISTS "Users can manage folders in their organization" ON public.widget_folders;
CREATE POLICY "Users can manage folders in their organization" ON public.widget_folders
  FOR ALL TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Users can view folders in their organization" ON public.widget_folders;
CREATE POLICY "Users can view folders in their organization" ON public.widget_folders
  FOR SELECT TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Users can view submissions in their organization" ON public.widget_submissions;
CREATE POLICY "Users can view submissions in their organization" ON public.widget_submissions
  FOR SELECT TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Users can manage widgets in their organization" ON public.widgets;
CREATE POLICY "Users can manage widgets in their organization" ON public.widgets
  FOR ALL TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Users can view widgets in their organization" ON public.widgets;
CREATE POLICY "Users can view widgets in their organization" ON public.widgets
  FOR SELECT TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Admins can manage workspace agent configs" ON public.workspace_agent_configs;
CREATE POLICY "Admins can manage workspace agent configs" ON public.workspace_agent_configs
  FOR ALL TO public
  USING (((organization_id = get_user_org_id((select auth.uid()))) AND (has_role((select auth.uid()), 'owner'::app_role) OR has_role((select auth.uid()), 'admin'::app_role))));

DROP POLICY IF EXISTS "Users can view workspace agent configs" ON public.workspace_agent_configs;
CREATE POLICY "Users can view workspace agent configs" ON public.workspace_agent_configs
  FOR SELECT TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

DROP POLICY IF EXISTS "Users in org can delete funnel configs" ON public.workspace_funnel_configs;
CREATE POLICY "Users in org can delete funnel configs" ON public.workspace_funnel_configs
  FOR DELETE TO public
  USING (user_belongs_to_org((select auth.uid()), organization_id));

DROP POLICY IF EXISTS "Users in org can insert funnel configs" ON public.workspace_funnel_configs;
CREATE POLICY "Users in org can insert funnel configs" ON public.workspace_funnel_configs
  FOR INSERT TO public
  WITH CHECK (user_belongs_to_org((select auth.uid()), organization_id));

DROP POLICY IF EXISTS "Users in org can update funnel configs" ON public.workspace_funnel_configs;
CREATE POLICY "Users in org can update funnel configs" ON public.workspace_funnel_configs
  FOR UPDATE TO public
  USING (user_belongs_to_org((select auth.uid()), organization_id));

DROP POLICY IF EXISTS "Users in org can view funnel configs" ON public.workspace_funnel_configs;
CREATE POLICY "Users in org can view funnel configs" ON public.workspace_funnel_configs
  FOR SELECT TO public
  USING (user_belongs_to_org((select auth.uid()), organization_id));

DROP POLICY IF EXISTS "Admins can manage workspace members" ON public.workspace_members;
CREATE POLICY "Admins can manage workspace members" ON public.workspace_members
  FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM workspaces w
  WHERE ((w.id = workspace_members.workspace_id) AND (w.organization_id = get_user_org_id((select auth.uid()))) AND (has_role((select auth.uid()), 'owner'::app_role) OR has_role((select auth.uid()), 'admin'::app_role))))));

DROP POLICY IF EXISTS "Organization managers can view workspace members" ON public.workspace_members;
CREATE POLICY "Organization managers can view workspace members" ON public.workspace_members
  FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM workspaces w
  WHERE ((w.id = workspace_members.workspace_id) AND user_can_manage_org((select auth.uid()), w.organization_id)))));

DROP POLICY IF EXISTS "Organization owners and admins manage workspace members" ON public.workspace_members;
CREATE POLICY "Organization owners and admins manage workspace members" ON public.workspace_members
  FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM workspaces w
  WHERE ((w.id = workspace_members.workspace_id) AND user_can_manage_org((select auth.uid()), w.organization_id)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM workspaces w
  WHERE ((w.id = workspace_members.workspace_id) AND user_can_manage_org((select auth.uid()), w.organization_id)))));

DROP POLICY IF EXISTS "Users can view workspace members in their org" ON public.workspace_members;
CREATE POLICY "Users can view workspace members in their org" ON public.workspace_members
  FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM workspaces w
  WHERE ((w.id = workspace_members.workspace_id) AND (w.organization_id = get_user_org_id((select auth.uid())))))));

DROP POLICY IF EXISTS "Workspace members can view same workspace memberships" ON public.workspace_members;
CREATE POLICY "Workspace members can view same workspace memberships" ON public.workspace_members
  FOR SELECT TO public
  USING (user_has_workspace_access((select auth.uid()), workspace_id));

DROP POLICY IF EXISTS "Owners/admins create workspace templates in their org" ON public.workspace_templates;
CREATE POLICY "Owners/admins create workspace templates in their org" ON public.workspace_templates
  FOR INSERT TO authenticated
  WITH CHECK ((user_belongs_to_org((select auth.uid()), organization_id) AND (has_role_in_org((select auth.uid()), 'owner'::app_role, organization_id) OR has_role_in_org((select auth.uid()), 'admin'::app_role, organization_id)) AND (EXISTS ( SELECT 1
   FROM workspaces w
  WHERE ((w.id = workspace_templates.workspace_id) AND (w.organization_id = workspace_templates.organization_id))))));

DROP POLICY IF EXISTS "Owners/admins delete workspace templates in their org" ON public.workspace_templates;
CREATE POLICY "Owners/admins delete workspace templates in their org" ON public.workspace_templates
  FOR DELETE TO authenticated
  USING ((user_belongs_to_org((select auth.uid()), organization_id) AND (has_role_in_org((select auth.uid()), 'owner'::app_role, organization_id) OR has_role_in_org((select auth.uid()), 'admin'::app_role, organization_id))));

DROP POLICY IF EXISTS "Owners/admins update workspace templates in their org" ON public.workspace_templates;
CREATE POLICY "Owners/admins update workspace templates in their org" ON public.workspace_templates
  FOR UPDATE TO authenticated
  USING ((user_belongs_to_org((select auth.uid()), organization_id) AND (has_role_in_org((select auth.uid()), 'owner'::app_role, organization_id) OR has_role_in_org((select auth.uid()), 'admin'::app_role, organization_id))));

DROP POLICY IF EXISTS "Owners/admins view workspace templates in their org" ON public.workspace_templates;
CREATE POLICY "Owners/admins view workspace templates in their org" ON public.workspace_templates
  FOR SELECT TO authenticated
  USING ((is_platform_admin((select auth.uid())) OR (user_belongs_to_org((select auth.uid()), organization_id) AND (has_role_in_org((select auth.uid()), 'owner'::app_role, organization_id) OR has_role_in_org((select auth.uid()), 'admin'::app_role, organization_id)))));

DROP POLICY IF EXISTS "Platform admins manage all workspace templates" ON public.workspace_templates;
CREATE POLICY "Platform admins manage all workspace templates" ON public.workspace_templates
  FOR ALL TO authenticated
  USING (is_platform_admin((select auth.uid())))
  WITH CHECK (is_platform_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admins can manage workspaces in their org" ON public.workspaces;
CREATE POLICY "Admins can manage workspaces in their org" ON public.workspaces
  FOR ALL TO public
  USING (((organization_id = get_user_org_id((select auth.uid()))) AND (has_role((select auth.uid()), 'owner'::app_role) OR has_role((select auth.uid()), 'admin'::app_role))));

DROP POLICY IF EXISTS "Organization members can view workspaces" ON public.workspaces;
CREATE POLICY "Organization members can view workspaces" ON public.workspaces
  FOR SELECT TO public
  USING (user_is_org_member((select auth.uid()), organization_id));

DROP POLICY IF EXISTS "Organization owners and admins manage workspaces" ON public.workspaces;
CREATE POLICY "Organization owners and admins manage workspaces" ON public.workspaces
  FOR ALL TO public
  USING (user_can_manage_org((select auth.uid()), organization_id))
  WITH CHECK (user_can_manage_org((select auth.uid()), organization_id));

DROP POLICY IF EXISTS "Users can view workspaces in their org" ON public.workspaces;
CREATE POLICY "Users can view workspaces in their org" ON public.workspaces
  FOR SELECT TO public
  USING ((organization_id = get_user_org_id((select auth.uid()))));

COMMIT;
