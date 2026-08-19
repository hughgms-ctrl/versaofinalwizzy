-- ============================================================================
-- DEVOLVER ao "Comercial" as conversas dele + tirar da frente as do NÚMERO ANTIGO
--
-- Contexto (diagnóstico de 2026-08-18):
--   Comercial    = 6859cbde-f285-4a50-b0f6-e23a46ff9561
--   Comercial 2  = 93e0490f-fc57-45b2-9873-ea22a5316f5f
--   Os dois estão vinculados à MESMA instância d1942367-4fe6-4422-b69d-cf19fd38ead5
--   (número 5511984571454). "Hewerton" tem número próprio (16892997422) e NÃO é
--   tocado por nada aqui.
--
-- Como os dois workspaces atendem o mesmo número, não existe critério técnico que
-- diga "esta conversa é do Comercial 2": tudo que veio do 5511984571454 é do
-- Comercial. O que veio de OUTRO número é o legado do número antigo — é ele que o
-- PASSO 1 identifica, antes de qualquer coisa ser alterada.
--
-- >>> RODE PASSO A PASSO. Só os blocos marcados EXECUTAR alteram dados, e todos
--     têm dry-run logo acima. Não pule o PASSO 1. <<<
--
-- Pré-requisito: migration 20260818120000 aplicada — este script usa
-- `wz_conversation_phone_key(instância, source_phone)`, que resolve "de qual
-- número é esta conversa" (instância viva; se foi deletada, o source_phone).
-- A guarda criada por ela deixa o PASSO 2 passar: origem e destino são o mesmo
-- número.
--
-- Aplicação: MANUAL no SQL Editor do Supabase (regra de deploy Lovable).
-- ============================================================================


-- ---------------------------------------------------------------------------
-- PASSO 1 — MAPA (read-only). De quais números vieram as conversas que hoje
-- estão no Comercial 2? É esta tabela que diz qual é "o número antigo".
--
-- Ler assim:
--   • numero_key = a chave do 5511984571454  → é do Comercial, vai no PASSO 2
--   • qualquer outra chave                   → legado do número antigo (PASSO 3)
--   • numero_key nulo → conversa sem número identificável (source_phone NULL e
--     instância deletada). Não arquive no automático: olhe contato e data.
-- ---------------------------------------------------------------------------
SELECT
  coalesce(public.wz_conversation_phone_key(c.whatsapp_instance_id, c.source_phone),
           '(sem número)')                                     AS numero_key,
  coalesce(wi.phone_number, c.source_phone, '(nenhum)')         AS numero,
  coalesce(wi.status::text, '(instância deletada)')             AS status_instancia,
  count(*)                                                      AS conversas,
  min(c.created_at)                                             AS mais_antiga,
  max(c.last_message_at)                                        AS ultima_mensagem,
  count(*) FILTER (WHERE c.status = 'archived')                 AS ja_arquivadas
FROM public.conversations c
LEFT JOIN public.whatsapp_instances wi ON wi.id = c.whatsapp_instance_id
WHERE c.workspace_id = '93e0490f-fc57-45b2-9873-ea22a5316f5f'::uuid
GROUP BY 1, 2, 3
ORDER BY conversas DESC;


-- ---------------------------------------------------------------------------
-- PASSO 2 — DEVOLVER ao Comercial tudo que veio do número compartilhado.
-- ---------------------------------------------------------------------------

-- 2a) DRY-RUN — quais são:
SELECT c.id, ct.name AS contato, ct.phone, c.status::text AS status, c.last_message_at
FROM public.conversations c
JOIN public.contacts ct ON ct.id = c.contact_id
WHERE c.workspace_id = '93e0490f-fc57-45b2-9873-ea22a5316f5f'::uuid
  AND public.wz_conversation_phone_key(c.whatsapp_instance_id, c.source_phone)
      = public.whatsapp_phone_match_key('5511984571454')
ORDER BY c.last_message_at DESC NULLS LAST;

-- 2b) EXECUTAR (descomente). Reversível: rode de novo com os dois UUIDs
--     trocados de lugar. Nada é apagado.
-- UPDATE public.conversations c
-- SET workspace_id = '6859cbde-f285-4a50-b0f6-e23a46ff9561'::uuid
-- WHERE c.workspace_id = '93e0490f-fc57-45b2-9873-ea22a5316f5f'::uuid
--   AND public.wz_conversation_phone_key(c.whatsapp_instance_id, c.source_phone)
--       = public.whatsapp_phone_match_key('5511984571454');

-- 2c) O contato acompanha? `contacts.workspace_id` é do CRM e não tem número,
--     então fica a seu critério. Só descomente se quiser que voltem também:
-- UPDATE public.contacts
-- SET workspace_id = '6859cbde-f285-4a50-b0f6-e23a46ff9561'::uuid
-- WHERE workspace_id = '93e0490f-fc57-45b2-9873-ea22a5316f5f'::uuid;


-- ---------------------------------------------------------------------------
-- PASSO 3 — AS DO NÚMERO ANTIGO.
--
-- >>> Troque '<NUMERO_ANTIGO>' pelo que o PASSO 1 mostrou (pode ser mais de um:
--     ARRAY['5527992547093','11999998888']). Enquanto estiver como está, os
--     blocos abaixo não alcançam nada — é proposital. <<<
--
-- Três formas de "remover", da mais reversível para a definitiva. Escolha UMA.
-- ---------------------------------------------------------------------------

-- 3a) DRY-RUN — o que a lista alcança, com o tamanho do histórico em jogo:
SELECT c.id, ct.name AS contato, ct.phone, c.source_phone,
       coalesce(wi.phone_number, '(instância deletada)') AS numero,
       c.created_at, c.last_message_at,
       (SELECT count(*) FROM public.messages m WHERE m.conversation_id = c.id) AS mensagens
FROM public.conversations c
JOIN public.contacts ct ON ct.id = c.contact_id
LEFT JOIN public.whatsapp_instances wi ON wi.id = c.whatsapp_instance_id
WHERE c.workspace_id = '93e0490f-fc57-45b2-9873-ea22a5316f5f'::uuid
  AND public.wz_conversation_phone_key(c.whatsapp_instance_id, c.source_phone)
      = ANY (SELECT public.whatsapp_phone_match_key(n)
             FROM unnest(ARRAY['<NUMERO_ANTIGO>']::text[]) n)
ORDER BY c.last_message_at DESC NULLS LAST;


-- 3b) RECOMENDADO — ARQUIVAR. Some da caixa de entrada (a lista esconde
--     'archived' por padrão), o histórico fica inteiro, e desfazer é trocar o
--     status de volta. Comece por aqui: se ninguém sentir falta, aí considere 3c.
-- UPDATE public.conversations c
-- SET status = 'archived'
-- WHERE c.workspace_id = '93e0490f-fc57-45b2-9873-ea22a5316f5f'::uuid
--   AND public.wz_conversation_phone_key(c.whatsapp_instance_id, c.source_phone)
--       = ANY (SELECT public.whatsapp_phone_match_key(n)
--              FROM unnest(ARRAY['<NUMERO_ANTIGO>']::text[]) n);


-- 3c) DEFINITIVO — APAGAR. Leia antes de descomentar.
--     DELETE em conversations CASCATEIA. Vão junto, sem volta:
--       • messages — todo o histórico da conversa
--       • conversation_origin_audit — a prova de qual número originou
--       • flow_node_logs, campaign_queue e as demais tabelas com
--         ON DELETE CASCADE em conversation_id
--     Não há lixeira. Rode o 3a antes e olhe a coluna `mensagens`: se houver
--     histórico que importe, use o 3b.
-- DELETE FROM public.conversations c
-- WHERE c.workspace_id = '93e0490f-fc57-45b2-9873-ea22a5316f5f'::uuid
--   AND public.wz_conversation_phone_key(c.whatsapp_instance_id, c.source_phone)
--       = ANY (SELECT public.whatsapp_phone_match_key(n)
--              FROM unnest(ARRAY['<NUMERO_ANTIGO>']::text[]) n);


-- ---------------------------------------------------------------------------
-- PASSO 4 — CONFERIR. O Comercial 2 deve ficar vazio (ou só com o que você
-- decidiu deixar) e o Comercial com as conversas do 5511984571454.
-- ---------------------------------------------------------------------------
SELECT
  coalesce(w.name, '(sem workspace)')          AS workspace,
  coalesce(wi.phone_number, '(sem instância)') AS numero,
  c.status::text                               AS status,
  count(*)                                     AS conversas
FROM public.conversations c
LEFT JOIN public.workspaces w          ON w.id  = c.workspace_id
LEFT JOIN public.whatsapp_instances wi ON wi.id = c.whatsapp_instance_id
WHERE c.organization_id = (
  SELECT organization_id FROM public.workspaces
  WHERE id = '6859cbde-f285-4a50-b0f6-e23a46ff9561'::uuid
)
GROUP BY 1, 2, 3
ORDER BY 1, 4 DESC;
