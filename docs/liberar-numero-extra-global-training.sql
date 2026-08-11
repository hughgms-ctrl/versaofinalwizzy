-- ============================================================================
-- LIBERAR +1 NÚMERO DE WHATSAPP PARA A ORG "GLOBAL TRAINING"
-- ============================================================================
-- Contexto: o limite de números NÃO fica na organização. Ele mora dentro do
-- JSONB do plano, em:
--
--     platform_plans.features -> 'limits' ->> 'max_whatsapp_numbers'
--
-- Como não existe campo de exceção por organização, a forma de dar +1 número
-- para UMA org sem mexer no plano dos outros clientes é criar um PLANO ESPELHO:
-- uma cópia idêntica do plano atual, com is_active = false (não aparece na
-- landing nem no checkout), mudando apenas o limite de números. Depois apontamos
-- só a Global Training para esse plano.
--
-- ATENÇÃO — regra importante do sistema:
--   max_whatsapp_numbers = 0  (ou ausente)  SIGNIFICA ILIMITADO, não zero.
--   Todos os enforcements fazem "IF limite <= 0 THEN libera".
--   Portanto NUNCA use 0 achando que está restringindo.
--
-- ORDEM DE USO:
--   Passo 1 -> descobre a org e o plano atual        (só leitura)
--   Passo 2 -> confere quantos números já estão em uso (só leitura)
--   Passo 3 -> cria o plano espelho                  (ESCREVE)
--   Passo 4 -> aponta a org para o espelho           (ESCREVE)
--   Passo 5 -> confere o resultado                   (só leitura)
-- ============================================================================


-- ============================================================================
-- PASSO 1 — qual é a org e qual plano ela usa hoje? (só leitura)
-- ============================================================================
-- Confirme o nome da organização e ANOTE o plan_id e o limite atual.
-- Se vier mais de uma linha, ajuste o ILIKE para o nome exato.
SELECT
  o.id                                                        AS organization_id,
  o.name                                                      AS organizacao,
  pp.id                                                       AS plan_id_atual,
  pp.name                                                     AS plano_atual,
  pp.slug                                                     AS slug_atual,
  pp.is_active                                                AS plano_publico,
  pp.features->'limits'->>'max_whatsapp_numbers'              AS limite_numeros_hoje,
  -- quantas outras orgs usam esse mesmo plano (as que NÃO podem ser afetadas)
  (SELECT COUNT(*) FROM organization_plans op2
    WHERE op2.plan_id = pp.id AND op2.organization_id <> o.id) AS outras_orgs_no_plano
FROM organizations o
JOIN organization_plans op ON op.organization_id = o.id
JOIN platform_plans pp     ON pp.id = op.plan_id
WHERE o.name ILIKE '%global%training%';

-- Leitura do resultado:
--   limite_numeros_hoje = NULL ou '0'  -> a org JÁ é ilimitada; não precisa
--                                         fazer nada, o problema é outro
--                                         (ver PASSO 2 / nota final).
--   outras_orgs_no_plano = 0           -> ninguém mais usa esse plano; nesse
--                                         caso você poderia simplesmente editar
--                                         o plano atual (ver ALTERNATIVA no fim).


-- ============================================================================
-- PASSO 2 — quantos números ela já tem "em uso"? (só leitura)
-- ============================================================================
-- A contagem do sistema NÃO é "todas as instâncias". Só conta a instância que
-- está efetivamente ocupando uma vaga, segundo a mesma regra da trigger:
--   status = 'connected' OR is_active OR connected_at IS NOT NULL
--   OR phone_number <> ''
-- Instância 'pending' recém-criada não ocupa vaga.
SELECT
  wi.id,
  wi.instance_name,
  wi.phone_number,
  wi.status,
  wi.is_active,
  wi.connected_at,
  (
    wi.status = 'connected'
    OR wi.is_active
    OR wi.connected_at IS NOT NULL
    OR COALESCE(wi.phone_number, '') <> ''
  ) AS ocupa_vaga
FROM whatsapp_instances wi
JOIN organizations o ON o.id = wi.organization_id
WHERE o.name ILIKE '%global%training%'
ORDER BY ocupa_vaga DESC, wi.created_at;

-- Total que o sistema enxerga (é este número que bate no limite):
SELECT COUNT(*) AS numeros_ocupando_vaga
FROM whatsapp_instances wi
JOIN organizations o ON o.id = wi.organization_id
WHERE o.name ILIKE '%global%training%'
  AND (
    wi.status = 'connected'
    OR wi.is_active
    OR wi.connected_at IS NOT NULL
    OR COALESCE(wi.phone_number, '') <> ''
  );

-- Se "numeros_ocupando_vaga" for MAIOR que o esperado, pode haver instância
-- velha/desconectada ainda segurando vaga (phone_number preenchido).
-- Nesse caso, apagar a instância morta resolve sem precisar de plano novo.


-- ============================================================================
-- PASSO 3 — CRIAR O PLANO ESPELHO (ESCREVE!)
-- ============================================================================
-- Copia TODAS as colunas do plano atual, mudando apenas:
--   - name / slug  (para diferenciar no admin)
--   - is_active    -> false  (não aparece para o público / checkout)
--   - features.limits.max_whatsapp_numbers -> limite atual + 1
--
-- Rode do BEGIN ao COMMIT. Se os números vierem errados, troque COMMIT por
-- ROLLBACK e nada é salvo.

BEGIN;

WITH origem AS (
  SELECT pp.*
  FROM organizations o
  JOIN organization_plans op ON op.organization_id = o.id
  JOIN platform_plans pp     ON pp.id = op.plan_id
  WHERE o.name ILIKE '%global%training%'
  LIMIT 1
)
INSERT INTO platform_plans (
  name, slug, price_monthly, price_yearly, max_team_members,
  max_conversations, max_ai_requests_month, storage_limit_bytes,
  ai_mode, allowed_modules, features, is_active
)
SELECT
  origem.name || ' (Global Training)',
  origem.slug || '-global-training',
  origem.price_monthly,
  origem.price_yearly,
  origem.max_team_members,
  origem.max_conversations,
  origem.max_ai_requests_month,
  origem.storage_limit_bytes,
  origem.ai_mode,
  origem.allowed_modules,
  -- jsonb_set com create_if_missing = true: funciona mesmo se 'limits' existir
  -- mas não tiver a chave. COALESCE cobre o caso de features/limits ausentes.
  jsonb_set(
    COALESCE(origem.features, '{}'::jsonb) || jsonb_build_object(
      'limits', COALESCE(origem.features->'limits', '{}'::jsonb)
    ),
    '{limits,max_whatsapp_numbers}',
    to_jsonb(
      COALESCE(
        NULLIF(origem.features->'limits'->>'max_whatsapp_numbers', '')::int,
        0
      ) + 1
    ),
    true
  ),
  false                                   -- <- inativo: fora da landing/checkout
FROM origem;

-- Confira o espelho criado ANTES de confirmar.
-- limite_novo deve ser exatamente (limite antigo + 1).
SELECT
  id            AS plan_id_espelho,
  name,
  slug,
  is_active,
  features->'limits'->>'max_whatsapp_numbers' AS limite_novo,
  price_monthly
FROM platform_plans
WHERE slug LIKE '%-global-training';

COMMIT;
-- ROLLBACK;   <- use este no lugar do COMMIT se algo vier errado

-- CUIDADO: se o limite antigo era NULL/0 (= ilimitado), este script produz
-- limite = 1, o que na prática RESTRINGE em vez de liberar. Se o PASSO 1
-- mostrou NULL ou 0, PARE e não rode o PASSO 4 — a org já era ilimitada.


-- ============================================================================
-- PASSO 4 — APONTAR A ORG PARA O ESPELHO (ESCREVE!)
-- ============================================================================
-- Só troca o plan_id. Billing (asaas/stripe, período, status) fica intacto,
-- porque o preço do espelho é idêntico ao do original.

BEGIN;

UPDATE organization_plans op
SET plan_id    = (SELECT id FROM platform_plans WHERE slug LIKE '%-global-training' LIMIT 1),
    updated_at = now()
FROM organizations o
WHERE o.id = op.organization_id
  AND o.name ILIKE '%global%training%';

-- Deve retornar exatamente 1 linha, com o plano espelho e o limite novo:
SELECT
  o.name                                          AS organizacao,
  pp.name                                         AS plano_agora,
  pp.is_active                                    AS plano_publico,
  pp.features->'limits'->>'max_whatsapp_numbers'  AS limite_numeros
FROM organizations o
JOIN organization_plans op ON op.organization_id = o.id
JOIN platform_plans pp     ON pp.id = op.plan_id
WHERE o.name ILIKE '%global%training%';

COMMIT;
-- ROLLBACK;


-- ============================================================================
-- PASSO 5 — CONFERIR O RESULTADO (só leitura)
-- ============================================================================
-- Valida pela MESMA função que a trigger e a edge function usam.
-- vagas_livres deve ser >= 1 para conseguir conectar o número novo.
SELECT
  o.name                                                       AS organizacao,
  public.get_platform_plan_limit(o.id, 'max_whatsapp_numbers')  AS limite_efetivo,
  (SELECT COUNT(*) FROM whatsapp_instances wi
    WHERE wi.organization_id = o.id
      AND (wi.status = 'connected' OR wi.is_active
           OR wi.connected_at IS NOT NULL
           OR COALESCE(wi.phone_number, '') <> ''))            AS em_uso,
  public.get_platform_plan_limit(o.id, 'max_whatsapp_numbers')
    - (SELECT COUNT(*) FROM whatsapp_instances wi
        WHERE wi.organization_id = o.id
          AND (wi.status = 'connected' OR wi.is_active
               OR wi.connected_at IS NOT NULL
               OR COALESCE(wi.phone_number, '') <> ''))        AS vagas_livres
FROM organizations o
WHERE o.name ILIKE '%global%training%';

-- Garantia de que nenhum outro cliente foi afetado:
-- todas as outras orgs devem continuar no plano ORIGINAL.
SELECT pp.name AS plano, pp.is_active, COUNT(*) AS orgs
FROM organization_plans op
JOIN platform_plans pp ON pp.id = op.plan_id
GROUP BY pp.name, pp.is_active
ORDER BY orgs DESC;


-- ============================================================================
-- DEPOIS DE RODAR
-- ============================================================================
-- O backend (trigger + edge function zapi-create-instance) já respeita o novo
-- limite IMEDIATAMENTE — leem o plano por join, sem cache.
--
-- A INTERFACE pode levar até ~5 minutos para atualizar: o hook
-- useOrganizationPlan tem staleTime de 5 min. Se o botão de adicionar número
-- continuar bloqueado, basta o usuário dar F5 na página.


-- ============================================================================
-- DESFAZER
-- ============================================================================
-- Volta a org para o plano original e apaga o espelho.
-- Troque <PLAN_ID_ORIGINAL> pelo id anotado no PASSO 1.
--
-- BEGIN;
-- UPDATE organization_plans op
-- SET plan_id = '<PLAN_ID_ORIGINAL>', updated_at = now()
-- FROM organizations o
-- WHERE o.id = op.organization_id
--   AND o.name ILIKE '%global%training%';
--
-- DELETE FROM platform_plans WHERE slug LIKE '%-global-training';
-- COMMIT;


-- ============================================================================
-- ALTERNATIVA — se o PASSO 1 mostrou outras_orgs_no_plano = 0
-- ============================================================================
-- Se NENHUMA outra organização usa esse plano, não há motivo para criar um
-- espelho: dá para editar o plano atual direto, sem efeito colateral.
--
-- BEGIN;
-- UPDATE platform_plans pp
-- SET features = jsonb_set(
--       COALESCE(pp.features, '{}'::jsonb) || jsonb_build_object(
--         'limits', COALESCE(pp.features->'limits', '{}'::jsonb)
--       ),
--       '{limits,max_whatsapp_numbers}',
--       to_jsonb(
--         COALESCE(NULLIF(pp.features->'limits'->>'max_whatsapp_numbers','')::int, 0) + 1
--       ),
--       true
--     ),
--     updated_at = now()
-- FROM organizations o
-- JOIN organization_plans op ON op.organization_id = o.id
-- WHERE pp.id = op.plan_id
--   AND o.name ILIKE '%global%training%';
-- COMMIT;
--
-- CUIDADO: se você editar esse plano depois pela tela /admin → Planos, o
-- AdminPlansPage reescreve features.limits INTEIRO ao salvar, o que pode
-- desfazer este ajuste. Prefira sempre alterar por SQL.
