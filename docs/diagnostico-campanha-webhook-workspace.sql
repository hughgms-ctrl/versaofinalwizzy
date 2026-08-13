-- Diagnóstico: campanha por webhook conta execuções mas o fluxo não roda.
-- Sintoma observado: flow-execute recusa com reason = "workspace_without_number".
-- Objetivo: descobrir se a conversa que o webhook reaproveitou está em um
-- workspace DIFERENTE do workspace da campanha.
--
-- Contexto do caso (troque se for investigar outro):
--   org          a9896931-7d69-4823-b5b4-c1dcd5c8d7fc
--   telefone     5531995852587
--   conversa     95d22105-a2d5-4cfb-9c1c-2a028ee49ae2
--   workspace    93e0490f-fc57-45b2-9873-ea22a5316f5f  (o que o fluxo reclamou)

-- =====================================================================
-- 1) A CAMPANHA: em qual workspace ela está e esse workspace tem número?
-- =====================================================================
SELECT
    c.id                AS campaign_id,
    c.name              AS campanha,
    c.match_type,
    c.is_active,
    c.trigger_count,
    c.flow_id,
    f.name              AS fluxo,
    f.organization_id   AS org_do_fluxo,
    c.organization_id   AS org_da_campanha,
    c.workspace_id      AS campaign_workspace_id,
    ws.name             AS campaign_workspace,
    ws.whatsapp_instance_id AS campaign_workspace_numero_id,
    CASE
        WHEN c.workspace_id IS NULL THEN 'sem workspace (usa fallback da org)'
        WHEN ws.whatsapp_instance_id IS NULL THEN '>>> WORKSPACE DA CAMPANHA SEM NUMERO <<<'
        ELSE 'ok'
    END AS veredito
FROM campaigns c
LEFT JOIN workspaces ws ON ws.id = c.workspace_id
LEFT JOIN flows f ON f.id = c.flow_id
WHERE c.organization_id = 'a9896931-7d69-4823-b5b4-c1dcd5c8d7fc'
  AND c.match_type = 'webhook';

-- =====================================================================
-- 2) TODAS as conversas desse telefone na org.
--    Responde: "esse número já tinha conversa no workspace da campanha?"
-- =====================================================================
SELECT
    conv.id             AS conversation_id,
    conv.workspace_id,
    ws.name             AS workspace,
    ws.whatsapp_instance_id AS workspace_numero_id,
    conv.whatsapp_instance_id AS conversa_numero_id,
    conv.source_phone,
    conv.status,
    conv.hidden_by_disconnect,
    conv.created_at,
    conv.updated_at,
    conv.metadata ->> 'source' AS origem
FROM conversations conv
JOIN contacts ct ON ct.id = conv.contact_id
LEFT JOIN workspaces ws ON ws.id = conv.workspace_id
WHERE conv.organization_id = 'a9896931-7d69-4823-b5b4-c1dcd5c8d7fc'
  AND ct.phone = '5531995852587'
ORDER BY conv.updated_at DESC;

-- =====================================================================
-- 3) Comparação direta: workspace da campanha X workspace da conversa.
--    Esta é a query que fecha o diagnóstico.
-- =====================================================================
SELECT
    cam.name                    AS campanha,
    cam.workspace_id            AS ws_da_campanha,
    wcam.name                   AS ws_da_campanha_nome,
    wcam.whatsapp_instance_id   AS ws_da_campanha_numero,
    conv.id                     AS conversa,
    conv.workspace_id           AS ws_da_conversa,
    wconv.name                  AS ws_da_conversa_nome,
    wconv.whatsapp_instance_id  AS ws_da_conversa_numero,
    CASE
        WHEN conv.workspace_id IS DISTINCT FROM cam.workspace_id
            THEN '>>> WORKSPACES DIFERENTES: a conversa antiga manda no envio <<<'
        WHEN wconv.whatsapp_instance_id IS NULL
            THEN '>>> MESMO WORKSPACE, mas SEM numero vinculado <<<'
        ELSE 'ok - deveria enviar'
    END AS veredito
FROM campaigns cam
LEFT JOIN workspaces wcam ON wcam.id = cam.workspace_id
CROSS JOIN LATERAL (
    SELECT conv.*
    FROM conversations conv
    JOIN contacts ct ON ct.id = conv.contact_id
    WHERE conv.organization_id = cam.organization_id
      AND ct.phone = '5531995852587'
    ORDER BY conv.updated_at DESC
    LIMIT 1
) conv
LEFT JOIN workspaces wconv ON wconv.id = conv.workspace_id
WHERE cam.organization_id = 'a9896931-7d69-4823-b5b4-c1dcd5c8d7fc'
  AND cam.match_type = 'webhook';

-- =====================================================================
-- 4) Panorama: todos os workspaces da org e seus números.
--    Mostra se ALGUM workspace tem número vinculado.
-- =====================================================================
SELECT
    ws.id               AS workspace_id,
    ws.name             AS workspace,
    ws.is_active,
    ws.whatsapp_instance_id,
    wi.label            AS numero_label,
    wi.phone_number,
    wi.status           AS numero_status,
    wi.is_active        AS numero_ativo
FROM workspaces ws
LEFT JOIN whatsapp_instances wi ON wi.id = ws.whatsapp_instance_id
WHERE ws.organization_id = 'a9896931-7d69-4823-b5b4-c1dcd5c8d7fc'
ORDER BY ws.name;

-- =====================================================================
-- 5) O fluxo chegou a registrar execução alguma vez?
-- =====================================================================
SELECT
    fe.id,
    fe.flow_id,
    f.name AS fluxo,
    fe.conversation_id,
    fe.status,
    fe.current_node_id,
    fe.error_message,
    fe.started_at
FROM flow_executions fe
LEFT JOIN flows f ON f.id = fe.flow_id
WHERE fe.organization_id = 'a9896931-7d69-4823-b5b4-c1dcd5c8d7fc'
ORDER BY fe.started_at DESC
LIMIT 20;

-- =====================================================================
-- 6) Checagem à parte: a coluna whatsapp_instances.logical_phone existe?
--    O campaign-webhook faz .select('id, phone_number, logical_phone').
--    Se a coluna não existir, o SELECT inteiro falha, a instância vem null
--    e a conversa nasce sem número vinculado. Ela NÃO aparece no types.ts,
--    mas várias funções a usam — então vale confirmar no banco vivo.
-- =====================================================================
SELECT column_name, data_type, is_generated
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'whatsapp_instances'
  AND column_name IN ('logical_phone', 'phone_number');

-- =====================================================================
-- 7) Regra "cada fluxo tem 1 workspace apenas": algum fluxo viola?
--    workspace_ids é legado (pasta multi-workspace escrevia nela).
--    Linhas com mais de um id, ou com workspace_id nulo e array cheio,
--    são inconsistentes com a regra e devem ser normalizadas.
-- =====================================================================
SELECT
    f.id,
    f.name,
    f.workspace_id,
    f.workspace_ids,
    COALESCE(array_length(f.workspace_ids, 1), 0) AS qtd_no_array,
    CASE
        WHEN COALESCE(array_length(f.workspace_ids, 1), 0) > 1
            THEN '>>> fluxo em VARIOS workspaces <<<'
        WHEN f.workspace_id IS NULL AND COALESCE(array_length(f.workspace_ids, 1), 0) = 1
            THEN 'workspace_id nulo, mas array tem 1 (normalizar)'
        WHEN f.workspace_id IS NULL
            THEN 'fluxo global (sem workspace)'
        ELSE 'ok'
    END AS veredito
FROM flows f
WHERE f.organization_id = 'a9896931-7d69-4823-b5b4-c1dcd5c8d7fc'
ORDER BY qtd_no_array DESC, f.name;

-- Se a query 7 acusar linhas fora da regra, normalize assim (revise antes de rodar):
-- UPDATE flows
--    SET workspace_id  = COALESCE(workspace_id, workspace_ids[1]),
--        workspace_ids = ARRAY[COALESCE(workspace_id, workspace_ids[1])]
--  WHERE organization_id = 'a9896931-7d69-4823-b5b4-c1dcd5c8d7fc'
--    AND COALESCE(workspace_id, workspace_ids[1]) IS NOT NULL
--    AND (array_length(workspace_ids, 1) IS DISTINCT FROM 1 OR workspace_id IS NULL);
