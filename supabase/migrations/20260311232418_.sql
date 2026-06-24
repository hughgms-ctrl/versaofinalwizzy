-- Mark confirmed-implemented checklist items as done
UPDATE governance_checks SET status = 'done', notes = 'Tabela user_roles com enum app_role e função has_role() SECURITY DEFINER implementadas.', updated_at = now() WHERE id = '9e5254f2-5d70-43e9-b7e2-b1f9cea1df9a';

UPDATE governance_checks SET status = 'done', notes = 'Todas as tabelas públicas têm RLS habilitado. Policies usam is_platform_admin, get_user_org_id e has_role.', updated_at = now() WHERE id = '184e77fc-114a-42eb-9db9-d76eea5afe85';

UPDATE governance_checks SET status = 'done', notes = 'Edge functions admin usam verifyAdmin() com getUser + user_roles check. Demais usam getClaims.', updated_at = now() WHERE id = 'd1e5ce01-f0e1-4c69-b7cf-d4ae9b2d75ed';

UPDATE governance_checks SET status = 'done', notes = 'Service Role Key usada apenas em edge functions (Deno.env.get). Nunca exposta ao client.', updated_at = now() WHERE id = 'ecdd55ec-ef6e-46d9-a27b-6ca58b85cb5b';

UPDATE governance_checks SET status = 'done', notes = 'Admin verificado via RPC is_platform_admin no banco. Nenhum uso de localStorage para auth.', updated_at = now() WHERE id = 'b6f37b83-30d1-449b-ba16-45508feee0b4';

UPDATE governance_checks SET status = 'done', notes = 'Zod validação adicionada em admin-governance. WhatsApp formatter escapa HTML.', updated_at = now() WHERE id = '747ee620-c473-41f5-be24-7debe9b5ad0f';

UPDATE governance_checks SET status = 'done', notes = 'formatWhatsAppMessage() escapa &, < e > antes de renderizar. Único uso de dangerouslySetInnerHTML é seguro.', updated_at = now() WHERE id = '3b61542b-89a4-42db-b6b2-659fd9fd0f06';

UPDATE governance_checks SET status = 'done', notes = 'Supabase SDK usado para todas as queries. Nenhum SQL raw aceito do cliente. RLS filtra por auth.uid().', updated_at = now() WHERE id = 'c2c322ba-88a0-4cef-a3e9-4eccc53fe781';

UPDATE governance_checks SET status = 'done', notes = 'RLS policies impedem UPDATE em campos sensíveis. user_roles tem UNIQUE constraint.', updated_at = now() WHERE id = '448699a8-9e09-4b40-b3fa-c377c7be164d';

UPDATE governance_checks SET status = 'done', notes = 'Console.logs de tokens sanitizados - removidos substrings de tokens em 5 edge functions.', updated_at = now() WHERE id = '60d44281-c46e-4cd3-bf1a-e1c9337ca240';

UPDATE governance_checks SET status = 'done', notes = 'Todas as edge functions admin verificam role via verifyAdmin() antes de processar.', updated_at = now() WHERE id = 'f2922a88-558f-4b24-ae1e-6532f91f5530';

UPDATE governance_checks SET status = 'done', notes = 'Sistema de governança com governance_prompts e governance_prompt_versions implementado.', updated_at = now() WHERE id = '03ddd311-39e0-4112-aea8-05199fcf91cc';

UPDATE governance_checks SET status = 'done', notes = 'governance_prompt_versions salva automaticamente ao editar. Timeline com versões.', updated_at = now() WHERE id = 'd709dd0d-5c15-4fa4-a1c3-a31b06bcd526';

UPDATE governance_checks SET status = 'done', notes = 'governance_action_logs registra todas as ações com performed_by, entity e details.', updated_at = now() WHERE id = '35def01b-e8b0-4bb2-bc9c-64c0bc2979f9';

UPDATE governance_checks SET status = 'done', notes = 'Google Drive backup integrado via drive_configs e drive_backup_logs.', updated_at = now() WHERE id = '43c99607-e205-4c43-b297-4a169f90c96f';

-- Update prompts status to implemented where applicable
UPDATE governance_prompts SET status = 'implemented', updated_at = now() WHERE name = 'Proteção de Webhooks e APIs Públicas' AND status = 'partial';;
