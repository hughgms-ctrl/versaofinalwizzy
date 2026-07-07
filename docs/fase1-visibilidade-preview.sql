-- ============================================================================
-- FASE 1 — PREVIEW (somente leitura) da visibilidade por número conectado.
-- ----------------------------------------------------------------------------
-- Modelo: conversa SEM instância (whatsapp_instance_id IS NULL) = número não
-- conectado = candidata a ESCONDER. Antes de esconder, este preview separa:
--   • readotável_por_source_phone → o número da conversa casa com uma instância
--     CONECTADA → deve ganhar a instância de volta e ficar VISÍVEL.
--   • readotável_por_workspace → a conversa está num workspace cujo número está
--     conectado → recuperável via workspace → VISÍVEL.
--   • seria_escondida → não casa com nenhum número conectado (histórico de número
--     desconectado / órfã antiga) → fica ESCONDIDA.
--
-- >>> RODE E CONFIRA, principalmente o detalhe das "seria_escondida". <<<
-- Nada é alterado aqui. Requer a função whatsapp_phone_match_key (PARTE 0 de
-- docs/unificar-conversas-duplicadas.sql) já criada.
-- ============================================================================

-- 1) Panorama: quantas órfãs em cada destino, por org.
WITH connected_keys AS (
  SELECT organization_id, public.whatsapp_phone_match_key(phone_number) AS pk
  FROM public.whatsapp_instances
  WHERE status = 'connected' AND phone_number IS NOT NULL
    AND public.whatsapp_phone_match_key(phone_number) <> ''
),
orphan AS (
  SELECT
    cv.id, cv.organization_id, cv.workspace_id,
    NULLIF(public.whatsapp_phone_match_key(cv.source_phone), '') AS conv_pk
  FROM public.conversations cv
  WHERE cv.whatsapp_instance_id IS NULL
)
SELECT
  o.organization_id,
  CASE
    WHEN o.conv_pk IS NOT NULL AND EXISTS (
      SELECT 1 FROM connected_keys ck
      WHERE ck.organization_id = o.organization_id AND ck.pk = o.conv_pk
    ) THEN 'readotavel_por_source_phone'
    WHEN o.workspace_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.workspaces w
      JOIN public.whatsapp_instances wi ON wi.id = w.whatsapp_instance_id
      WHERE w.id = o.workspace_id AND wi.status = 'connected'
    ) THEN 'readotavel_por_workspace'
    ELSE 'seria_escondida'
  END AS destino,
  count(*) AS conversas
FROM orphan o
GROUP BY o.organization_id, 2
ORDER BY o.organization_id, 2;

-- 2) DETALHE das que SERIAM ESCONDIDAS — confira se são mesmo de número
--    desconectado / histórico antigo (e não algo ativo que perdeu a instância).
WITH connected_keys AS (
  SELECT organization_id, public.whatsapp_phone_match_key(phone_number) AS pk
  FROM public.whatsapp_instances
  WHERE status = 'connected' AND phone_number IS NOT NULL
    AND public.whatsapp_phone_match_key(phone_number) <> ''
),
orphan AS (
  SELECT
    cv.id, cv.organization_id, cv.contact_id, cv.workspace_id, cv.status,
    cv.source_phone, cv.last_message_at, cv.created_at,
    NULLIF(public.whatsapp_phone_match_key(cv.source_phone), '') AS conv_pk
  FROM public.conversations cv
  WHERE cv.whatsapp_instance_id IS NULL
)
SELECT
  o.organization_id,
  ct.name AS contato,
  ct.phone AS telefone_contato,
  o.id AS conversation_id,
  o.status,
  o.source_phone,
  ws.name AS workspace,
  o.last_message_at,
  o.created_at,
  (SELECT count(*) FROM public.messages m WHERE m.conversation_id = o.id) AS msgs
FROM orphan o
LEFT JOIN public.contacts ct  ON ct.id = o.contact_id
LEFT JOIN public.workspaces ws ON ws.id = o.workspace_id
WHERE NOT (
    o.conv_pk IS NOT NULL AND EXISTS (
      SELECT 1 FROM connected_keys ck
      WHERE ck.organization_id = o.organization_id AND ck.pk = o.conv_pk
    )
  )
  AND NOT (
    o.workspace_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.workspaces w
      JOIN public.whatsapp_instances wi ON wi.id = w.whatsapp_instance_id
      WHERE w.id = o.workspace_id AND wi.status = 'connected'
    )
  )
ORDER BY o.organization_id, msgs DESC, o.last_message_at DESC NULLS LAST;
