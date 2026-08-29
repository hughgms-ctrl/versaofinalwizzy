-- ============================================================================
-- Saneamento depois da migration 20260829120000 (conversa pertence ao workspace)
--
-- Caso de 2026-08-28: o número do workspace B caiu, foi reconectado e vinculado
-- ao workspace A (por um tempo A e B juntos, depois só A). Resultado:
--   * conversas antigas do número seguem em B (certo pela spec: histórico fica);
--   * conversas nascidas no período "A+B juntos" ficaram SEM workspace (o webhook
--     antigo gravava NULL quando 2 workspaces disputavam o número);
--   * o backfill da migration marcou como dono o último workspace que enviou —
--     se foi B, a função de roteamento ignora (B não atende mais o número) e a
--     próxima mensagem cai em A, num chat novo.
--
-- Rode no SQL Editor, passo a passo. Troque os placeholders.
-- ============================================================================

-- 0) Descobrir ids
SELECT w.id, w.name, w.is_active, w.whatsapp_instance_id, wi.phone_number, wi.status, wi.routing_mode
FROM public.workspaces w
LEFT JOIN public.whatsapp_instances wi ON wi.id = w.whatsapp_instance_id
WHERE w.organization_id = '<ORG_ID>'
ORDER BY w.created_at;

-- 1) Conversas do número por workspace (visão geral)
SELECT c.workspace_id, w.name, count(*) AS conversas,
       count(*) FILTER (WHERE c.last_message_at > now() - interval '7 days') AS ativas_7d
FROM public.conversations c
LEFT JOIN public.workspaces w ON w.id = c.workspace_id
WHERE c.organization_id = '<ORG_ID>'
  AND c.whatsapp_instance_id = '<INSTANCE_ID>'
GROUP BY 1, 2
ORDER BY 3 DESC;

-- 2) DRY-RUN: conversas SEM workspace deste número (nasceram no período A+B).
--    Elas vão para o workspace que atende o número hoje (A).
SELECT c.id, ct.name, ct.phone, c.last_message_at, c.created_at
FROM public.conversations c
JOIN public.contacts ct ON ct.id = c.contact_id
WHERE c.organization_id = '<ORG_ID>'
  AND c.whatsapp_instance_id = '<INSTANCE_ID>'
  AND c.workspace_id IS NULL
ORDER BY c.last_message_at DESC NULLS LAST;

-- 2b) Antes de mover: se o workspace A JÁ tem chat desse contato neste número,
--     o UPDATE colide no índice único. Lista os que colidem (mesclar à mão pela
--     UI "Workspace" da conversa, que faz a mesclagem, ou apagar a vazia).
SELECT c.id AS conversa_sem_workspace, a.id AS conversa_em_A, ct.name, ct.phone
FROM public.conversations c
JOIN public.contacts ct ON ct.id = c.contact_id
JOIN public.conversations a
  ON a.contact_id = c.contact_id
 AND a.whatsapp_instance_id = c.whatsapp_instance_id
 AND a.workspace_id = '<WORKSPACE_A_ID>'
WHERE c.organization_id = '<ORG_ID>'
  AND c.whatsapp_instance_id = '<INSTANCE_ID>'
  AND c.workspace_id IS NULL;

-- 3) MOVER (só as que não colidem). O trigger de transferência marca A como dono.
-- UPDATE public.conversations c
-- SET workspace_id = '<WORKSPACE_A_ID>'
-- WHERE c.organization_id = '<ORG_ID>'
--   AND c.whatsapp_instance_id = '<INSTANCE_ID>'
--   AND c.workspace_id IS NULL
--   AND NOT EXISTS (
--     SELECT 1 FROM public.conversations a
--     WHERE a.contact_id = c.contact_id
--       AND a.whatsapp_instance_id = c.whatsapp_instance_id
--       AND a.workspace_id = '<WORKSPACE_A_ID>'
--   );

-- 4) Conferir donos do número: quem está com B (que não atende mais o número)
--    vai cair em A na próxima mensagem, automaticamente. Nada a fazer.
SELECT o.workspace_id, w.name, o.claimed_by, count(*)
FROM public.contact_number_owners o
LEFT JOIN public.workspaces w ON w.id = o.workspace_id
WHERE o.whatsapp_instance_id = '<INSTANCE_ID>'
GROUP BY 1, 2, 3
ORDER BY 4 DESC;

-- 5) (Opcional) Se quiser que A já seja o dono de todo mundo deste número agora,
--    sem esperar a próxima mensagem:
-- UPDATE public.contact_number_owners
-- SET workspace_id = '<WORKSPACE_A_ID>', claimed_by = 'backfill', updated_at = now()
-- WHERE whatsapp_instance_id = '<INSTANCE_ID>'
--   AND workspace_id NOT IN (
--     SELECT id FROM public.workspaces
--     WHERE whatsapp_instance_id = '<INSTANCE_ID>' AND is_active
--   );
