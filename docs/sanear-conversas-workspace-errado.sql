-- ============================================================================
-- SANEAMENTO — devolver as conversas que já foram carimbadas no workspace errado
--
-- Pré-requisito: migration 20260818120000_workspace_conversa_pertence_ao_numero.sql
-- aplicada (ela cria wz_workspace_allowed_for_conversation / wz_*_phone_key e a
-- guarda). A migration NÃO move dados — quem move é este script, à mão.
--
-- >>> Rode PASSO A PASSO. Os passos 1 e 2 são leitura. O passo 3 move. <<<
-- Aplicação: MANUAL no SQL Editor do Supabase (regra de deploy Lovable).
-- ============================================================================


-- ---------------------------------------------------------------------------
-- PASSO 1 — DRY-RUN: quantas conversas estão num workspace que não atende o
-- número delas, e para onde cada uma deveria ir.
--
-- destino_correto:
--   • um workspace  → o dono do número da conversa (é para lá que ela volta)
--   • NULL          → nenhum workspace atende esse número → vira "Sem Workspace"
--     (aparece no seletor "Sem Workspace", não some do sistema)
-- ---------------------------------------------------------------------------
WITH erradas AS (
  SELECT
    c.id,
    c.organization_id,
    c.workspace_id                                                   AS workspace_atual,
    public.wz_conversation_phone_key(c.whatsapp_instance_id, c.source_phone) AS numero_conversa
  FROM public.conversations c
  WHERE c.workspace_id IS NOT NULL
    AND NOT public.wz_workspace_allowed_for_conversation(
              c.workspace_id, c.organization_id, c.whatsapp_instance_id, c.source_phone
            )
)
SELECT
  o.name                                   AS org,
  wa.name                                  AS workspace_atual,
  coalesce(wd.name, '(sem workspace)')     AS destino_correto,
  e.numero_conversa,
  count(*)                                 AS conversas
FROM erradas e
JOIN public.organizations o ON o.id = e.organization_id
LEFT JOIN public.workspaces wa ON wa.id = e.workspace_atual
LEFT JOIN LATERAL (
  SELECT w.id, w.name
  FROM public.workspaces w
  WHERE w.organization_id = e.organization_id
    AND w.is_active = true
    AND public.wz_workspace_phone_key(w.id) = e.numero_conversa
  ORDER BY w.created_at, w.id
  LIMIT 1
) wd ON true
GROUP BY 1, 2, 3, 4
ORDER BY conversas DESC;


-- ---------------------------------------------------------------------------
-- PASSO 2 — a lista nominal (confira algumas antes de mover).
-- ---------------------------------------------------------------------------
SELECT
  c.id                                        AS conversa,
  ct.name                                     AS contato,
  ct.phone,
  wa.name                                     AS workspace_atual,
  public.wz_conversation_phone_key(c.whatsapp_instance_id, c.source_phone) AS numero_conversa,
  coalesce(wi.phone_number, '(instância deletada)') AS instancia_atual,
  c.created_at,
  c.updated_at,
  c.last_message_at
FROM public.conversations c
JOIN public.contacts ct  ON ct.id = c.contact_id
LEFT JOIN public.workspaces wa ON wa.id = c.workspace_id
LEFT JOIN public.whatsapp_instances wi ON wi.id = c.whatsapp_instance_id
WHERE c.workspace_id IS NOT NULL
  AND NOT public.wz_workspace_allowed_for_conversation(
            c.workspace_id, c.organization_id, c.whatsapp_instance_id, c.source_phone
          )
ORDER BY c.updated_at DESC
LIMIT 300;


-- ---------------------------------------------------------------------------
-- PASSO 3 — EXECUTAR (descomente). Devolve cada conversa ao workspace do número
-- dela; se esse número não tem dono, deixa sem workspace.
--
-- Escopo: descomente o AND da org para sanear só a org do caso relatado; sem ele
-- o script corrige a base inteira (é a mesma regra para todo mundo).
--
-- A guarda criada na migration deixa passar: o destino é, por construção, o
-- workspace do próprio número (ou NULL).
-- ---------------------------------------------------------------------------
-- UPDATE public.conversations c
-- SET workspace_id = (
--       SELECT w.id
--       FROM public.workspaces w
--       WHERE w.organization_id = c.organization_id
--         AND w.is_active = true
--         AND public.wz_workspace_phone_key(w.id)
--             = public.wz_conversation_phone_key(c.whatsapp_instance_id, c.source_phone)
--       ORDER BY w.created_at, w.id
--       LIMIT 1
--     )
-- WHERE c.workspace_id IS NOT NULL
--   -- AND c.organization_id = '<ORG_ID>'::uuid
--   AND NOT public.wz_workspace_allowed_for_conversation(
--             c.workspace_id, c.organization_id, c.whatsapp_instance_id, c.source_phone
--           );


-- ---------------------------------------------------------------------------
-- PASSO 4 — CONFERIR (deve voltar 0 linhas).
-- ---------------------------------------------------------------------------
SELECT count(*) AS ainda_erradas
FROM public.conversations c
WHERE c.workspace_id IS NOT NULL
  AND NOT public.wz_workspace_allowed_for_conversation(
            c.workspace_id, c.organization_id, c.whatsapp_instance_id, c.source_phone
          );


-- ---------------------------------------------------------------------------
-- PASSO 5 — o outro lado do sintoma: conversas de número que não está mais
-- conectado continuam visíveis se a instância ainda existe (é o "anti-piscar"
-- de docs/regra-visibilidade-numero-conectado.md: só a instância DELETADA
-- esconde). Esta consulta mostra o que está visível vindo de número não
-- conectado — decida caso a caso se o número deve ser deletado da org.
-- ---------------------------------------------------------------------------
SELECT
  o.name                       AS org,
  coalesce(w.name, '(sem workspace)') AS workspace,
  wi.phone_number,
  wi.status,
  count(*)                     AS conversas_visiveis
FROM public.conversations c
JOIN public.whatsapp_instances wi ON wi.id = c.whatsapp_instance_id
JOIN public.organizations o ON o.id = c.organization_id
LEFT JOIN public.workspaces w ON w.id = c.workspace_id
WHERE wi.status IS DISTINCT FROM 'connected'
  AND c.hidden_by_disconnect = false
GROUP BY 1, 2, 3, 4
ORDER BY conversas_visiveis DESC;
