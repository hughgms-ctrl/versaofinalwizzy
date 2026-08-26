-- ============================================================================
-- DIAGNÓSTICO — agendamento do workspace A saiu pelo NÚMERO do workspace B
-- (caso relatado 2026-08-26: agendamento montado no "Comercial", número caiu,
--  2 disparos saíram pelo número do "Comercial 2")
-- ----------------------------------------------------------------------------
-- CAUSA (já corrigida no código, ver resolveWhatsAppInstance):
--   O resolvedor compartilhado buscava as instâncias com .eq('status','connected')
--   e SÓ ENTÃO procurava a instância designada do workspace nessa lista. Com o
--   número do workspace CAÍDO ele não estava na lista, o `find` voltava undefined
--   e o código seguia para o fallback por organização, que devolve a instância
--   is_active/conectada — o número do OUTRO workspace.
--   Não tem nada a ver com o CSV/contatos do Comercial 2: o número foi escolhido
--   pelo fallback, e as conversas foram criadas já com esse número (por isso os
--   contatos aparecem lá).
--
-- Tudo aqui é READ-ONLY. Rode no SQL Editor. Substitua <ORG_ID>.
--   SELECT p.organization_id FROM public.profiles p
--   JOIN auth.users u ON u.id = p.user_id WHERE u.email = 'hugo-gms@hotmail.com';
-- ============================================================================


-- ---------------------------------------------------------------------------
-- PASSO 1 — Workspaces x número designado x status do número.
-- Esperado no caso: o workspace do agendamento com número 'disconnected'
-- e o outro workspace com o número 'connected' + is_active.
-- ---------------------------------------------------------------------------
SELECT
  w.id AS workspace_id, w.name,
  w.whatsapp_instance_id AS ws_instance,
  wi.phone_number        AS ws_phone,
  wi.status::text        AS ws_status,
  wi.is_active
FROM public.workspaces w
LEFT JOIN public.whatsapp_instances wi ON wi.id = w.whatsapp_instance_id
WHERE w.organization_id = '<ORG_ID>'::uuid
ORDER BY w.created_at;


-- ---------------------------------------------------------------------------
-- PASSO 2 — Agendamentos recentes: workspace do agendamento x número que a
-- conversa de cada contato acabou usando. Linha com ws_instance <> conv_instance
-- (ou ws_instance NULL do lado da conversa) É O VAZAMENTO.
-- ---------------------------------------------------------------------------
SELECT
  sm.id            AS scheduled_id,
  sm.title,
  sm.scheduled_at,
  w.name           AS agendamento_workspace,
  wsi.phone_number AS numero_do_workspace,
  wsi.status::text AS status_do_numero,
  c.name           AS contato,
  c.phone,
  smc.status       AS envio_status,
  smc.sent_at,
  ci.phone_number  AS numero_que_enviou,
  cw.name          AS workspace_do_numero_usado,
  (conv.whatsapp_instance_id IS DISTINCT FROM w.whatsapp_instance_id) AS vazou
FROM public.scheduled_messages sm
JOIN public.scheduled_message_contacts smc ON smc.scheduled_message_id = sm.id
JOIN public.contacts c   ON c.id = smc.contact_id
LEFT JOIN public.workspaces w          ON w.id = sm.workspace_id
LEFT JOIN public.whatsapp_instances wsi ON wsi.id = w.whatsapp_instance_id
LEFT JOIN LATERAL (
  SELECT cv.id, cv.whatsapp_instance_id, cv.workspace_id
  FROM public.conversations cv
  WHERE cv.contact_id = c.id
    AND cv.organization_id = sm.organization_id
  ORDER BY cv.last_message_at DESC NULLS LAST
  LIMIT 1
) conv ON TRUE
LEFT JOIN public.whatsapp_instances ci ON ci.id = conv.whatsapp_instance_id
LEFT JOIN public.workspaces cw          ON cw.whatsapp_instance_id = ci.id
WHERE sm.organization_id = '<ORG_ID>'::uuid
  AND sm.scheduled_at > now() - interval '14 days'
ORDER BY sm.scheduled_at DESC, c.name;


-- ---------------------------------------------------------------------------
-- PASSO 3 — As mensagens que REALMENTE saíram por agendamento nos últimos 14
-- dias, com o número usado. É a prova do disparo (metadata.source).
-- ---------------------------------------------------------------------------
SELECT
  m.created_at,
  m.metadata->>'scheduled_id' AS scheduled_id,
  sm.title,
  wsm.name  AS workspace_do_agendamento,
  ct.name   AS contato, ct.phone,
  wi.phone_number AS numero_que_enviou,
  wcv.name  AS workspace_do_numero_usado,
  left(m.content, 60) AS trecho
FROM public.messages m
JOIN public.conversations cv ON cv.id = m.conversation_id
JOIN public.contacts ct      ON ct.id = cv.contact_id
LEFT JOIN public.whatsapp_instances wi ON wi.id = cv.whatsapp_instance_id
LEFT JOIN public.workspaces wcv ON wcv.whatsapp_instance_id = wi.id
LEFT JOIN public.scheduled_messages sm ON sm.id = (m.metadata->>'scheduled_id')::uuid
LEFT JOIN public.workspaces wsm ON wsm.id = sm.workspace_id
WHERE cv.organization_id = '<ORG_ID>'::uuid
  AND m.metadata->>'source' = 'scheduled_message'
  AND m.created_at > now() - interval '14 days'
ORDER BY m.created_at DESC;


-- ---------------------------------------------------------------------------
-- PASSO 4 — Mesma checagem para TODO envio automático (fluxo, follow-up,
-- campanha, IA): conversa cujo número não é o número do workspace dela.
-- Passivo acumulado pelo mesmo bug em outras funções.
-- ---------------------------------------------------------------------------
SELECT
  w.name           AS workspace_da_conversa,
  wsi.phone_number AS numero_do_workspace,
  ci.phone_number  AS numero_da_conversa,
  count(*)         AS conversas
FROM public.conversations cv
JOIN public.workspaces w ON w.id = cv.workspace_id
LEFT JOIN public.whatsapp_instances wsi ON wsi.id = w.whatsapp_instance_id
LEFT JOIN public.whatsapp_instances ci  ON ci.id = cv.whatsapp_instance_id
WHERE cv.organization_id = '<ORG_ID>'::uuid
  AND w.whatsapp_instance_id IS NOT NULL
  AND cv.whatsapp_instance_id IS DISTINCT FROM w.whatsapp_instance_id
GROUP BY 1, 2, 3
ORDER BY conversas DESC;
