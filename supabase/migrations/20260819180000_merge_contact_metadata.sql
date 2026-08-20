-- Gravar UMA chave de contacts.metadata sem reescrever o jsonb inteiro.
--
-- O par desta função é merge_contact_custom_fields (20260819160000), e o motivo
-- é o mesmo, agora do outro lado do balcão: metadata é um jsonb compartilhado
-- (note, description, blocked, phone_aliases, canonical_phone e custom_fields
-- moram todos ali).
--
-- A sequência que o funil produz várias vezes por dia:
--   1. o vendedor abre o card e a tela carrega contacts.metadata;
--   2. ele liga para o lead — a IA da triagem segue gravando custom_fields no
--      MESMO contato durante a conversa;
--   3. ele escreve a observação e salva.
-- Com `.update({ metadata: { ...copiaDaTela, note } })` o passo 3 regrava o
-- objeto inteiro a partir da cópia do passo 1 e apaga o que a IA coletou no
-- passo 2 — em silêncio: ninguém reclama que "sumiu o gargalo da Juliana", o
-- campo só aparece vazio e a conclusão vira "a IA não coletou".
--
-- Aqui o SELECT ... FOR UPDATE segura a linha: um segundo gravador espera,
-- relê o valor já commitado e mescla em cima dele.

CREATE OR REPLACE FUNCTION public.merge_contact_metadata(
  _contact_id uuid,
  _patch jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  _base jsonb;
  _merged jsonb;
BEGIN
  IF _contact_id IS NULL OR _patch IS NULL OR jsonb_typeof(_patch) <> 'object' THEN
    RAISE EXCEPTION 'merge_contact_metadata: informe _contact_id e _patch como objeto jsonb';
  END IF;

  SELECT metadata INTO _base FROM public.contacts WHERE id = _contact_id FOR UPDATE;
  IF NOT FOUND THEN
    -- Também cai aqui quando a RLS esconde a linha. Erra alto de propósito: o
    -- caminho antigo mostrava toast verde num update de 0 linhas.
    RAISE EXCEPTION 'Contato % não encontrado ou sem permissão', _contact_id;
  END IF;

  -- Mesma defesa de merge_contact_custom_fields: algum caminho antigo pode ter
  -- gravado uma STRING JSON em vez de objeto. Trocar direto por '{}' apagaria
  -- o resto do metadata do contato.
  IF jsonb_typeof(_base) = 'string' THEN
    BEGIN
      _base := (_base #>> '{}')::jsonb;
    EXCEPTION WHEN others THEN
      _base := NULL;
    END;
  END IF;

  IF _base IS NULL OR jsonb_typeof(_base) <> 'object' THEN
    _base := '{}'::jsonb;
  END IF;

  -- Mescla RASA de propósito: o patch manda só nas chaves que ele cita, e
  -- custom_fields (objeto aninhado, escrito por outra função) fica intocado.
  _merged := _base || _patch;

  UPDATE public.contacts SET metadata = _merged WHERE id = _contact_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sem permissão para atualizar o contato %', _contact_id;
  END IF;

  RETURN _merged;
END;
$$;

-- Sem SECURITY DEFINER de propósito: quem chama pelo app continua sujeito à RLS
-- de contacts, e a edge function usa service role.
REVOKE ALL ON FUNCTION public.merge_contact_metadata(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.merge_contact_metadata(uuid, jsonb) TO authenticated, service_role;

-- Sem isto o PostgREST responde PGRST202 (função não encontrada) até o próximo
-- reload do cache de schema, e o app volta a "não foi possível salvar".
NOTIFY pgrst, 'reload schema';
