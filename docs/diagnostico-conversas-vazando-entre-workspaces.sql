-- ============================================================================
-- DIAGNÓSTICO — conversas do workspace A aparecendo no workspace B
-- (caso relatado 2026-08-18: "Comercial" x "Comercial 2")
-- ----------------------------------------------------------------------------
-- O front NÃO mistura workspace: `useConversations` e `usePaginatedConversations`
-- filtram no servidor com `.eq('workspace_id', selectedWorkspaceId)`. Se a
-- conversa aparece em "Comercial 2", a LINHA está com workspace_id = Comercial 2.
--
-- RESULTADO DA 1ª RODADA (2026-08-18) — já sabemos:
--   • "Comercial" (6859cbde…) e "Comercial 2" (93e0490f…) estão vinculados à
--     MESMA instância d1942367… (número 5511984571454, disconnected).
--   • NENHUM workspace da org tem filter_tag_ids → os dois triggers de tag
--     (auto_assign_workspace / auto_assign_workspace_on_tag) estão DESCARTADOS.
--   • Existem campanhas apontando para Comercial 2 ("Boston", "ENEGBOS120726").
--   • Nenhum fluxo usa o nó action-workspace.
-- Sobram como suspeitos: CAMPANHA (campaign-webhook / gatilho por palavra-chave
-- no zapi-webhook) e MOVER EM MASSA (safe-record-actions).
-- Os passos abaixo foram reescritos para fechar essa conta. Tudo read-only.
-- ============================================================================

-- Org do caso: substitua nos passos abaixo.
--   SELECT p.organization_id, o.name FROM public.profiles p
--   JOIN public.organizations o ON o.id = p.organization_id
--   JOIN auth.users u ON u.id = p.user_id WHERE u.email = 'hugo-gms@hotmail.com';


-- ---------------------------------------------------------------------------
-- PASSO 1 — Workspaces x número (JÁ RODADO — mantido para conferência futura).
-- ---------------------------------------------------------------------------
SELECT
  w.id AS workspace_id, w.name, w.is_active, w.created_at,
  w.whatsapp_instance_id AS ws_instance,
  wi.phone_number        AS ws_instance_phone,
  wi.status::text        AS ws_instance_status,
  w.filter_tag_ids
FROM public.workspaces w
LEFT JOIN public.whatsapp_instances wi ON wi.id = w.whatsapp_instance_id
WHERE w.organization_id = '<ORG_ID>'::uuid
ORDER BY w.created_at;


-- ---------------------------------------------------------------------------
-- PASSO 1B — Números da org (corrigido: não existe coluna instance_name).
-- ---------------------------------------------------------------------------
SELECT id, label, evolution_instance_name, provider, phone_number,
       status::text AS status, is_active, created_at, connected_at, disconnected_at
FROM public.whatsapp_instances
WHERE organization_id = '<ORG_ID>'::uuid
ORDER BY created_at;


-- ---------------------------------------------------------------------------
-- PASSO 2 — Onde estão as conversas: workspace x número x visibilidade.
-- (corrigido: status é enum, precisa de ::text para o coalesce)
-- `movidas_depois` = updated_at bem posterior ao created_at → carimbadas depois.
-- ---------------------------------------------------------------------------
SELECT
  coalesce(w.name, '(sem workspace)')            AS workspace,
  coalesce(wi.phone_number, '(sem instância)')   AS numero,
  coalesce(wi.status::text, '—')                 AS status_numero,
  count(*)                                       AS conversas,
  count(*) FILTER (WHERE c.hidden_by_disconnect) AS escondidas,
  count(*) FILTER (WHERE c.updated_at > c.created_at + interval '1 day') AS movidas_depois,
  max(c.updated_at)                              AS ultimo_carimbo
FROM public.conversations c
LEFT JOIN public.workspaces w          ON w.id  = c.workspace_id
LEFT JOIN public.whatsapp_instances wi ON wi.id = c.whatsapp_instance_id
WHERE c.organization_id = '<ORG_ID>'::uuid
GROUP BY 1, 2, 3
ORDER BY 1, 4 DESC;


-- ---------------------------------------------------------------------------
-- PASSO 3 — As conversas do "Comercial 2", uma a uma, com a ORIGEM auditada
-- (conversation_origin_audit = por qual número conectado a conversa entrou)
-- e a marca de quem a criou (metadata->>'source').
--
--   criada_por = 'campaign_webhook'  → nasceu da campanha (suspeito nº1)
--   origem_auditada != numero_atual  → nasceu em OUTRO número
--   numero_atual = '(sem instância)' → número deletado
-- ---------------------------------------------------------------------------
SELECT
  c.id            AS conversa,
  ct.name         AS contato,
  ct.phone,
  c.created_at,
  c.updated_at,
  c.last_message_at,
  c.source_phone,
  coalesce(wi.phone_number, '(sem instância)') AS numero_atual,
  coalesce(wi.status::text, '—')               AS status_numero,
  c.hidden_by_disconnect,
  c.metadata->>'source'                        AS criada_por,
  c.metadata->>'campaign_id'                   AS campanha,
  (SELECT string_agg(DISTINCT a.connected_phone, ', ')
     FROM public.conversation_origin_audit a
    WHERE a.conversation_id = c.id)            AS origem_auditada
FROM public.conversations c
JOIN public.contacts ct ON ct.id = c.contact_id
LEFT JOIN public.whatsapp_instances wi ON wi.id = c.whatsapp_instance_id
WHERE c.organization_id = '<ORG_ID>'::uuid
  AND c.workspace_id = '93e0490f-fc57-45b2-9873-ea22a5316f5f'::uuid   -- Comercial 2
ORDER BY c.updated_at DESC
LIMIT 200;


-- ---------------------------------------------------------------------------
-- PASSO 3B — O MESMO CONTATO com conversa nos DOIS workspaces?
-- É o cenário do campaign-webhook: ele procura a conversa do contato JÁ FILTRANDO
-- pelo workspace da campanha; não achando, CRIA outra. O contato passa a ter dois
-- chats do mesmo número, um em cada workspace — e é isso que se lê como
-- "as conversas do Comercial estão aparecendo no Comercial 2".
-- ---------------------------------------------------------------------------
SELECT
  ct.name AS contato, ct.phone,
  count(*)                                   AS conversas,
  string_agg(coalesce(w.name,'(sem workspace)') || ' [' ||
             coalesce(wi.phone_number,'sem instância') || ', ' ||
             coalesce(c.metadata->>'source','—') || ']', ' | '
             ORDER BY c.created_at)          AS onde
FROM public.conversations c
JOIN public.contacts ct ON ct.id = c.contact_id
LEFT JOIN public.workspaces w          ON w.id  = c.workspace_id
LEFT JOIN public.whatsapp_instances wi ON wi.id = c.whatsapp_instance_id
WHERE c.organization_id = '<ORG_ID>'::uuid
GROUP BY ct.id, ct.name, ct.phone
HAVING count(DISTINCT coalesce(c.workspace_id, '00000000-0000-0000-0000-000000000000'::uuid)) > 1
ORDER BY conversas DESC
LIMIT 100;


-- ---------------------------------------------------------------------------
-- PASSO 3C — Quantas conversas do Comercial 2 vieram de campanha, e de qual.
-- ---------------------------------------------------------------------------
SELECT
  coalesce(w.name,'(sem workspace)')  AS workspace,
  coalesce(c.metadata->>'source','—') AS criada_por,
  ca.name                             AS campanha,
  count(*)                            AS conversas,
  min(c.created_at)                   AS primeira,
  max(c.created_at)                   AS ultima
FROM public.conversations c
LEFT JOIN public.workspaces w ON w.id = c.workspace_id
LEFT JOIN public.campaigns ca ON ca.id::text = c.metadata->>'campaign_id'
WHERE c.organization_id = '<ORG_ID>'::uuid
GROUP BY 1, 2, 3
ORDER BY conversas DESC;


-- ---------------------------------------------------------------------------
-- PASSO 4 — Mecanismos vivos no banco (corrigido: pg_policy.polpermissive).
-- Com filter_tag_ids vazio em toda a org, os triggers de tag não explicam nada
-- aqui — mas vale saber qual versão está viva antes de aplicar a migration.
-- ---------------------------------------------------------------------------
SELECT p.proname, pg_get_functiondef(p.oid) AS fonte
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('auto_assign_workspace', 'auto_assign_workspace_on_tag');

SELECT c.relname AS tabela, t.tgname AS trigger, t.tgenabled,
       pg_get_triggerdef(t.oid) AS definicao
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE NOT t.tgisinternal AND n.nspname = 'public'
  AND c.relname IN ('conversations', 'contact_tags', 'contacts')
ORDER BY 1, 2;

-- A regra de visibilidade por número (Fase 2) está ligada nesta base?
SELECT polname, polcmd, polpermissive
FROM pg_policy
WHERE polrelid = 'public.conversations'::regclass;
