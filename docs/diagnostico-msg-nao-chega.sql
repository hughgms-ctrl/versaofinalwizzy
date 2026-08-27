-- ============================================================================
-- DIAGNÓSTICO — mensagem sai com 1 TIQUE CINZA e nunca chega no aparelho
-- (caso relatado 2026-08-27: contato criado na aba Contatos, número
--  5531995375139, mensagem enviada pelo chat, sem erro na tela, não chegou)
-- ----------------------------------------------------------------------------
-- COMO LER O SINTOMA, ANTES DE RODAR QUALQUER COISA:
--   ⚠ vermelho no balão  -> o provedor RECUSOU. O motivo está em
--                           messages.error_message (ex.: número sem WhatsApp).
--   1 tique cinza        -> a linha foi gravada SEM failed_at: o provedor
--                           respondeu 200. Ou seja, o Wizzy fez a parte dele.
--                           O que falta é o WhatsApp: ou a sessão da instância
--                           está morta (aceita e não entrega), ou o ACK de
--                           entrega não volta porque o webhook está fora.
--   2 tiques             -> o WhatsApp confirmou a entrega; problema é do
--                           aparelho de destino (número, bloqueio, app).
--
-- O PASSO 4 é o que separa "não enviou" de "enviou e não recebemos o ACK":
-- se NENHUMA mensagem da org recebeu delivered_at nas últimas 48h, o buraco é
-- o webhook (ver [[evolution-webhook-drift-inbound]]), e o 1 tique cinza é
-- normal mesmo em mensagem entregue.
--
-- Tudo aqui é READ-ONLY. Rode no SQL Editor. Substitua <ORG_ID>:
--   SELECT p.organization_id FROM public.profiles p
--   JOIN auth.users u ON u.id = p.user_id WHERE u.email = 'hugo-gms@hotmail.com';
-- ============================================================================


-- ---------------------------------------------------------------------------
-- PASSO 1 — O contato e as conversas dele. Confere o telefone GRAVADO (é o que
-- vai para o provedor, dígito por dígito) e por qual número/workspace a
-- conversa está amarrada.
-- ---------------------------------------------------------------------------
SELECT
  c.id            AS contact_id,
  c.phone         AS telefone_gravado,
  c.name,
  c.workspace_id,
  c.created_at    AS contato_criado_em,
  conv.id         AS conversation_id,
  conv.workspace_id AS conv_workspace,
  conv.whatsapp_instance_id,
  conv.source_phone AS numero_da_empresa,
  conv.status,
  conv.service_mode,
  conv.last_message_at
FROM public.contacts c
LEFT JOIN public.conversations conv ON conv.contact_id = c.id
WHERE c.organization_id = '<ORG_ID>'
  -- variantes: com 55, sem 55, sem o nono dígito
  AND c.phone IN ('5531995375139', '553195375139', '31995375139', '3195375139')
ORDER BY conv.last_message_at DESC NULLS LAST;


-- ---------------------------------------------------------------------------
-- PASSO 2 — As mensagens dessa conversa. `resposta_do_provedor` mostra se veio
-- um id de mensagem (provedor aceitou) ou um send_error (provedor recusou).
-- ---------------------------------------------------------------------------
SELECT
  m.created_at,
  m.direction,
  m.type,
  left(coalesce(m.content, ''), 60) AS trecho,
  m.zapi_message_id                 AS id_no_provedor,
  m.delivered_at,
  m.read_at,
  m.failed_at,
  left(coalesce(m.error_message, ''), 200) AS erro,
  left(m.metadata::text, 400)              AS resposta_do_provedor
FROM public.messages m
JOIN public.conversations conv ON conv.id = m.conversation_id
JOIN public.contacts c         ON c.id = conv.contact_id
WHERE c.organization_id = '<ORG_ID>'
  AND c.phone IN ('5531995375139', '553195375139', '31995375139', '3195375139')
ORDER BY m.created_at DESC
LIMIT 30;


-- ---------------------------------------------------------------------------
-- PASSO 3 — A instância que enviou. `status` aqui é o que o BANCO acha; ela
-- pode estar 'connected' com a sessão morta (drift). Sinais de alerta:
--   - disconnected_at recente ou depois de connected_at;
--   - updated_at parado há dias (ninguém sincroniza o status);
--   - key_propria = true (cópia velha de evolution_api_key tem prioridade
--     sobre a global e derruba envio E recebimento -- ver a memória
--     [[evolution-stale-instance-apikey]]).
-- ---------------------------------------------------------------------------
SELECT
  wi.id,
  wi.label,
  wi.phone_number,
  wi.status,
  wi.is_active,
  wi.provider,
  wi.evolution_instance_name,
  (wi.evolution_api_key IS NOT NULL) AS key_propria,
  wi.connected_at,
  wi.disconnected_at,
  wi.updated_at,
  w.id   AS workspace_id,
  w.name AS workspace
FROM public.whatsapp_instances wi
LEFT JOIN public.workspaces w ON w.whatsapp_instance_id = wi.id
WHERE wi.organization_id = '<ORG_ID>'
ORDER BY wi.updated_at DESC;


-- ---------------------------------------------------------------------------
-- PASSO 4 — O ACK de entrega está voltando? (separa "não enviou" de "enviou e
-- não sabemos"). Se entregues = 0 em todas as linhas, o webhook está fora e o
-- tique nunca vai virar dois -- mesmo em mensagem que chegou.
-- ---------------------------------------------------------------------------
SELECT
  date_trunc('day', m.created_at) AS dia,
  count(*)                                          AS enviadas,
  count(*) FILTER (WHERE m.delivered_at IS NOT NULL) AS entregues,
  count(*) FILTER (WHERE m.read_at IS NOT NULL)      AS lidas,
  count(*) FILTER (WHERE m.failed_at IS NOT NULL)    AS falhadas
FROM public.messages m
JOIN public.conversations conv ON conv.id = m.conversation_id
WHERE conv.organization_id = '<ORG_ID>'
  AND m.direction = 'outbound'
  AND m.created_at > now() - interval '7 days'
GROUP BY 1
ORDER BY 1 DESC;


-- ---------------------------------------------------------------------------
-- PASSO 5 — A org ainda RECEBE mensagem? Última inbound por número. Silêncio
-- em um número que costumava receber = webhook caído nele (corrigir com a
-- função zapi-configure-webhook).
-- ---------------------------------------------------------------------------
SELECT
  wi.phone_number,
  wi.label,
  wi.status,
  max(m.created_at) FILTER (WHERE m.direction = 'inbound')  AS ultima_recebida,
  max(m.created_at) FILTER (WHERE m.direction = 'outbound') AS ultima_enviada
FROM public.whatsapp_instances wi
LEFT JOIN public.conversations conv ON conv.whatsapp_instance_id = wi.id
LEFT JOIN public.messages m         ON m.conversation_id = conv.id
WHERE wi.organization_id = '<ORG_ID>'
GROUP BY wi.id, wi.phone_number, wi.label, wi.status
ORDER BY ultima_recebida DESC NULLS LAST;
