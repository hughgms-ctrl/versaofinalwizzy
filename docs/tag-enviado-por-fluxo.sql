-- ============================================================================
-- Aplicar a tag "enviado" em todos os contatos que passaram por um fluxo.
--
-- Rodar no SQL Editor do Supabase, UMA PARTE POR VEZ, na ordem.
-- As PARTES 0, 1 e 2 são só leitura. Nada muda no banco até a PARTE 3.
--
-- >>> ANTES DE COMEÇAR: este arquivo tem UM valor a preencher, o id do fluxo.
--     Ele aparece como  '00000000-0000-0000-0000-000000000000'::uuid  nas
--     PARTES 1.3, 2, 3, 4 e 5. Rode a PARTE 0, copie o flow_id e faça
--     localizar-e-substituir no arquivo inteiro. Se sobrar um lugar com o
--     placeholder, aquela query volta vazia (não dá erro) — por isso confira
--     que a contagem da 2.1 bate com a da 0.2.
-- ============================================================================


-- ============================================================================
-- PARTE 0 — DESCOBRIR A ORG E O FLUXO
--
-- É aqui que se resolve "fazer na org correta": em vez de adivinhar o
-- organization_id, escolha a LINHA do fluxo certo — o org id vem junto, e todas
-- as partes seguintes se ancoram no flow_id (que já é único por org). Assim não
-- tem como aplicar na org errada.
-- ============================================================================

-- 0.1 — Todos os fluxos que têm execução, com a org e o volume.
--       Ache o seu pela combinação nome + organizacao + ultima_execucao.
SELECT
  f.id                                   AS flow_id,          -- <<< COPIE ESTE
  f.name                                 AS fluxo,
  o.name                                 AS organizacao,
  f.organization_id,
  f.is_active,
  w.name                                 AS workspace_do_fluxo,
  COUNT(fe.id)                           AS execucoes,
  COUNT(DISTINCT conv.contact_id)        AS contatos_distintos,
  MIN(fe.started_at)                     AS primeira_execucao,
  MAX(fe.started_at)                     AS ultima_execucao
FROM public.flows f
JOIN public.organizations o        ON o.id = f.organization_id
LEFT JOIN public.workspaces w      ON w.id = f.workspace_id
JOIN public.flow_executions fe     ON fe.flow_id = f.id
LEFT JOIN public.conversations conv ON conv.id = fe.conversation_id
-- Se souber parte do nome, descomente pra filtrar:
-- WHERE f.name ILIKE '%parte do nome%'
GROUP BY f.id, f.name, o.name, f.organization_id, f.is_active, w.name
ORDER BY MAX(fe.started_at) DESC NULLS LAST;

-- 0.2 — Confirmação do fluxo escolhido: quebra por status da execução.
--       >>> DECIDA AQUI o que conta como "passou pelo fluxo".
--       Status possíveis: running, waiting_delay, waiting_input, completed,
--       failed, cancelled. O padrão deste arquivo é TODOS (quem entrou no
--       fluxo, terminando ou não). Se quiser só quem chegou ao fim, veja a
--       variante comentada em cada PARTE (procure por "SÓ CONCLUÍDAS").
SELECT
  fe.status,
  COUNT(*)                        AS execucoes,
  COUNT(DISTINCT conv.contact_id) AS contatos_distintos
FROM public.flow_executions fe
JOIN public.conversations conv ON conv.id = fe.conversation_id
WHERE fe.flow_id = '00000000-0000-0000-0000-000000000000'::uuid
GROUP BY fe.status
ORDER BY execucoes DESC;

-- 0.3 — (opcional) Qual org pertence a um login, pra cruzar com a 0.1:
SELECT u.email, p.organization_id, o.name AS organizacao
FROM auth.users u
JOIN public.profiles p      ON p.user_id = u.id
JOIN public.organizations o ON o.id = p.organization_id
WHERE u.email = 'hugo-gms@hotmail.com';   -- troque pelo login em questão

-- 0.4 — Pré-requisito das PARTES 3 e 4: os dois ON CONFLICT dependem de índices
--       únicos que estão nas migrations, mas o banco vivo já divergiu do repo
--       antes. Devem voltar DUAS linhas: tags(organization_id,name) e
--       contact_tags(contact_id,tag_id). Se faltar alguma, o INSERT
--       correspondente falha com "no unique or exclusion constraint matching
--       the ON CONFLICT specification" — me avise que eu adapto para NOT EXISTS.
SELECT conrelid::regclass AS tabela, conname, pg_get_constraintdef(oid) AS definicao
FROM pg_constraint
WHERE conrelid IN ('public.tags'::regclass, 'public.contact_tags'::regclass)
  AND contype = 'u';


-- ============================================================================
-- PARTE 1 — CHECAGEM CRÍTICA (rodar ANTES de qualquer escrita)
--
-- `contact_tags` tem DOIS triggers AFTER INSERT que disparam em massa:
--
--   1) trg_auto_assign_workspace_on_tag — se algum workspace tiver a tag em
--      `filter_tag_ids`, MOVE o contato e as conversas dele para aquele
--      workspace. (supabase/migrations/20260317143036_*.sql)
--   2) on_contact_tag_added_campaign — POST via pg_net para
--      trigger-campaign-on-tag a CADA linha inserida. Se existir campanha ativa
--      ligada à tag, ela DISPARA MENSAGEM REAL para cada contato.
--      (supabase/migrations/20260309003415_*.sql)
--
-- Se 1.2 ou 1.3 voltarem qualquer linha, use o bloco 4-ALT (triggers
-- desligados) em vez do INSERT normal da PARTE 4.
-- ============================================================================

-- 1.1 — A tag "enviado" já existe? Em quais orgs, com qual workspace?
--       (a constraint é UNIQUE(organization_id, name) — pode existir uma por org)
SELECT t.id, t.organization_id, o.name AS organizacao, t.name,
       t.workspace_id, w.name AS workspace, t.created_at,
       (SELECT COUNT(*) FROM public.contact_tags ct WHERE ct.tag_id = t.id) AS ja_tagueados
FROM public.tags t
JOIN public.organizations o   ON o.id = t.organization_id
LEFT JOIN public.workspaces w ON w.id = t.workspace_id
WHERE lower(t.name) = 'enviado';

-- 1.2 — >>> DECISIVO <<< Algum workspace usa a tag "enviado" como filtro de
--       entrada? Qualquer linha aqui = risco de mover contatos em massa.
SELECT w.id, w.name AS workspace, w.organization_id, w.is_active, t.name AS tag
FROM public.workspaces w
JOIN public.tags t ON t.id = ANY(w.filter_tag_ids)
WHERE lower(t.name) = 'enviado';

-- 1.3 — >>> DECISIVO <<< Existe campanha ATIVA ligada à tag "enviado"?
--       O casamento é match_type='tag_added' AND trigger_keyword = UUID da tag
--       (o campo guarda o id da tag, não o nome).
SELECT cmp.id, cmp.name, cmp.is_active, cmp.match_type, cmp.workspace_id, cmp.flow_id
FROM public.campaigns cmp
JOIN public.tags t ON t.id::text = cmp.trigger_keyword
WHERE lower(t.name) = 'enviado'
  AND cmp.match_type = 'tag_added'
  AND cmp.is_active = true;

-- 1.4 — Cuidado extra com o nome "enviado": por ser genérico, ele pode já
--       existir com outro uso em outra org. A 1.1 mostra isso. Todas as partes
--       abaixo se limitam à org do fluxo, então uma tag homônima em outra org
--       não é tocada.


-- ============================================================================
-- PARTE 2 — PREVIEW: exatamente quem vai receber a tag
-- ============================================================================
-- O CTE `alvo` abaixo é a definição de "passou pelo fluxo". Ele se repete
-- igual nas PARTES 2, 4 e 5 — se mudar aqui, copie nas outras.

-- 2.1 — Números agregados. `total_contatos` tem que bater com o
--       `contatos_distintos` somado da query 0.2.
WITH alvo AS (
  SELECT DISTINCT conv.contact_id, c.organization_id
  FROM public.flow_executions fe
  JOIN public.conversations conv ON conv.id = fe.conversation_id
  JOIN public.contacts c         ON c.id = conv.contact_id
  WHERE fe.flow_id = '00000000-0000-0000-0000-000000000000'::uuid
  -- SÓ CONCLUÍDAS: descomente para taguear apenas quem terminou o fluxo
  -- AND fe.status = 'completed'
)
SELECT
  (SELECT COUNT(*) FROM alvo)                             AS total_contatos,
  (SELECT COUNT(DISTINCT organization_id) FROM alvo)      AS orgs_envolvidas,
  (SELECT COUNT(*) FROM alvo a
     JOIN public.contact_tags ct ON ct.contact_id = a.contact_id
     JOIN public.tags t ON t.id = ct.tag_id
                       AND lower(t.name) = 'enviado'
                       AND t.organization_id = a.organization_id
  )                                                       AS ja_tagueados;

-- 2.2 — Lista nominal (confira algumas linhas antes de aplicar):
WITH alvo AS (
  SELECT DISTINCT conv.contact_id, c.organization_id
  FROM public.flow_executions fe
  JOIN public.conversations conv ON conv.id = fe.conversation_id
  JOIN public.contacts c         ON c.id = conv.contact_id
  WHERE fe.flow_id = '00000000-0000-0000-0000-000000000000'::uuid
)
SELECT c.name, c.phone, c.organization_id, c.workspace_id
FROM alvo a
JOIN public.contacts c ON c.id = a.contact_id
ORDER BY c.name NULLS LAST;

-- 2.3 — Rede de segurança: contatos que aparecem nos LOGS DE NÓ do fluxo mas
--       NÃO têm linha em flow_executions (execução apagada/antiga). Se voltar
--       linhas, decida se eles também entram — se sim, me avise que eu ajusto
--       o CTE `alvo` para unir as duas fontes.
SELECT DISTINCT c.id, c.name, c.phone
FROM public.flow_node_logs fnl
JOIN public.conversations conv ON conv.id = fnl.conversation_id
JOIN public.contacts c         ON c.id = conv.contact_id
WHERE fnl.flow_execution_id IN (
        SELECT id FROM public.flow_executions
        WHERE flow_id = '00000000-0000-0000-0000-000000000000'::uuid
      )
  AND NOT EXISTS (
        SELECT 1
        FROM public.flow_executions fe2
        JOIN public.conversations conv2 ON conv2.id = fe2.conversation_id
        WHERE fe2.flow_id = '00000000-0000-0000-0000-000000000000'::uuid
          AND conv2.contact_id = c.id
      );


-- ============================================================================
-- PARTE 3 — CRIAR A TAG (só se a 1.1 não trouxe a tag na org do fluxo)
--
-- Escopo: cria APENAS na org do fluxo. ON CONFLICT torna a re-execução segura —
-- se a tag já existir naquela org, ela (e o workspace dela) é preservada.
-- workspace_id NULL = tag global, visível em todos os workspaces da org.
-- ============================================================================
INSERT INTO public.tags (organization_id, name, color, description, workspace_id)
SELECT DISTINCT
  f.organization_id,
  'enviado',
  '#22c55e',
  'Passou pelo fluxo: ' || f.name,
  NULL::uuid   -- sem o cast o Postgres infere `text` e a coluna é uuid
FROM public.flows f
WHERE f.id = '00000000-0000-0000-0000-000000000000'::uuid
ON CONFLICT (organization_id, name) DO NOTHING;

-- 3.1 — Confirme que a tag existe na org certa antes de seguir:
SELECT t.id, t.name, t.organization_id, o.name AS organizacao, t.workspace_id
FROM public.tags t
JOIN public.organizations o ON o.id = t.organization_id
WHERE lower(t.name) = 'enviado'
  AND t.organization_id = (SELECT organization_id FROM public.flows
                           WHERE id = '00000000-0000-0000-0000-000000000000'::uuid);


-- ============================================================================
-- PARTE 4 — APLICAR A TAG NOS CONTATOS
--
-- Releia a PARTE 1. Se 1.2 ou 1.3 voltaram linha, PULE este INSERT e use 4-ALT.
-- added_by_type = 'flow' porque a marcação vem de passagem por fluxo
-- (valores aceitos: 'manual', 'flow', 'ai', 'whatsapp').
-- ============================================================================
INSERT INTO public.contact_tags (contact_id, tag_id, added_by_type)
SELECT DISTINCT conv.contact_id, t.id, 'flow'
FROM public.flow_executions fe
JOIN public.conversations conv ON conv.id = fe.conversation_id
JOIN public.contacts c         ON c.id = conv.contact_id
JOIN public.tags t             ON t.organization_id = c.organization_id
                              AND lower(t.name) = 'enviado'
WHERE fe.flow_id = '00000000-0000-0000-0000-000000000000'::uuid
  -- SÓ CONCLUÍDAS: descomente para taguear apenas quem terminou o fluxo
  -- AND fe.status = 'completed'
ON CONFLICT (contact_id, tag_id) DO NOTHING;


-- --- 4-ALT — marcação "seca": os dois triggers desligados. Use este bloco se a
--     1.2 (workspace com a tag em filter_tag_ids) ou a 1.3 (campanha ativa na
--     tag) tiverem voltado qualquer linha.
--     Rode o bloco INTEIRO de uma vez. Se rodar em pedaços e algo falhar no
--     meio, os triggers ficam desativados no banco — o COMMIT/ROLLBACK da
--     transação é o que garante a reativação.
-- BEGIN;
--   ALTER TABLE public.contact_tags DISABLE TRIGGER trg_auto_assign_workspace_on_tag;
--   ALTER TABLE public.contact_tags DISABLE TRIGGER on_contact_tag_added_campaign;
--
--   INSERT INTO public.contact_tags (contact_id, tag_id, added_by_type)
--   SELECT DISTINCT conv.contact_id, t.id, 'flow'
--   FROM public.flow_executions fe
--   JOIN public.conversations conv ON conv.id = fe.conversation_id
--   JOIN public.contacts c         ON c.id = conv.contact_id
--   JOIN public.tags t             ON t.organization_id = c.organization_id
--                                 AND lower(t.name) = 'enviado'
--   WHERE fe.flow_id = '00000000-0000-0000-0000-000000000000'::uuid
--   ON CONFLICT (contact_id, tag_id) DO NOTHING;
--
--   ALTER TABLE public.contact_tags ENABLE TRIGGER on_contact_tag_added_campaign;
--   ALTER TABLE public.contact_tags ENABLE TRIGGER trg_auto_assign_workspace_on_tag;
-- COMMIT;

-- 4-ALT.1 — Depois do bloco acima, confirme que os dois triggers voltaram
--           (tgenabled deve ser 'O' nas duas linhas; 'D' = ainda desativado):
-- SELECT tgname, tgenabled FROM pg_trigger
-- WHERE tgrelid = 'public.contact_tags'::regclass AND NOT tgisinternal;


-- ============================================================================
-- PARTE 5 — VERIFICAÇÃO
-- ============================================================================

-- 5.1 — Total com a tag na org do fluxo. Tem que bater com `total_contatos`
--       da 2.1 (ou ser maior, se a tag já era usada para outra coisa antes —
--       compare com o `ja_tagueados` que a 1.1 mostrou ANTES de rodar).
SELECT t.organization_id, o.name AS organizacao, COUNT(ct.contact_id) AS contatos_com_a_tag
FROM public.tags t
JOIN public.organizations o        ON o.id = t.organization_id
LEFT JOIN public.contact_tags ct   ON ct.tag_id = t.id
WHERE lower(t.name) = 'enviado'
  AND t.organization_id = (SELECT organization_id FROM public.flows
                           WHERE id = '00000000-0000-0000-0000-000000000000'::uuid)
GROUP BY t.organization_id, o.name;

-- 5.2 — Ninguém do alvo pode ter ficado de fora. O ideal é voltar ZERO linhas.
WITH alvo AS (
  SELECT DISTINCT conv.contact_id, c.organization_id
  FROM public.flow_executions fe
  JOIN public.conversations conv ON conv.id = fe.conversation_id
  JOIN public.contacts c         ON c.id = conv.contact_id
  WHERE fe.flow_id = '00000000-0000-0000-0000-000000000000'::uuid
)
SELECT c.id, c.name, c.phone
FROM alvo a
JOIN public.contacts c ON c.id = a.contact_id
WHERE NOT EXISTS (
  SELECT 1
  FROM public.contact_tags ct
  JOIN public.tags t ON t.id = ct.tag_id
  WHERE ct.contact_id = a.contact_id
    AND lower(t.name) = 'enviado'
    AND t.organization_id = a.organization_id
);


-- ============================================================================
-- ROLLBACK — desfaz só a marcação feita por ESTE script (mantém a tag)
--
-- O filtro added_by_type='flow' evita apagar marcações antigas feitas à mão.
-- Se a tag "enviado" já era usada por fluxos de verdade antes, troque o filtro
-- por uma janela de tempo: AND ct.created_at >= '2026-08-17'::date
-- ============================================================================
-- DELETE FROM public.contact_tags ct
-- USING public.tags t
-- WHERE ct.tag_id = t.id
--   AND lower(t.name) = 'enviado'
--   AND ct.added_by_type = 'flow'
--   AND t.organization_id = (SELECT organization_id FROM public.flows
--                            WHERE id = '00000000-0000-0000-0000-000000000000'::uuid);
--
-- Para remover a tag também. NÃO use delete_tag_safely: essa função está no
-- repo mas nunca foi aplicada no banco vivo. Delete direto — contact_tags tem
-- ON DELETE CASCADE, mas confira antes se nenhuma campanha/agendamento aponta
-- pra ela (as FKs de campaigns/scheduled_messages não são cascade):
-- DELETE FROM public.tags
-- WHERE lower(name) = 'enviado'
--   AND organization_id = (SELECT organization_id FROM public.flows
--                          WHERE id = '00000000-0000-0000-0000-000000000000'::uuid);
