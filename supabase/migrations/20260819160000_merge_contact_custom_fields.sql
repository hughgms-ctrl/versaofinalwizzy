-- Gravar campo personalizado do contato a partir do fluxo.
--
-- O motor (flow-execute) já SEMEAVA contacts.metadata.custom_fields no começo da
-- execução, mas não existia caminho de volta: nenhum nó escrevia lá, e toda
-- resposta coletada morria em flow_executions.variables. Este RPC é esse
-- caminho, usado pelo nó 'action-contact-field'.
--
-- Existe como função no banco em vez de um read-modify-write na edge function
-- porque metadata é um jsonb compartilhado: nele moram note, phone_aliases e
-- custom_fields. Ler no cliente, mesclar e regravar o objeto inteiro perde
-- qualquer escrita concorrente que caia entre o SELECT e o UPDATE — foi
-- exatamente esse padrão que já destruiu note/phone_aliases na importação
-- (ver comentário em supabase/functions/import-contacts/index.ts). Aqui o
-- SELECT ... FOR UPDATE segura a linha e a mescla vira atômica.

CREATE OR REPLACE FUNCTION public.merge_contact_custom_fields(
  _contact_id uuid,
  _values jsonb
)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  _base jsonb;
  _current jsonb;
BEGIN
  IF _contact_id IS NULL OR _values IS NULL OR jsonb_typeof(_values) <> 'object' THEN
    RETURN;
  END IF;

  SELECT metadata INTO _base FROM public.contacts WHERE id = _contact_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  -- metadata é jsonb, mas algum caminho antigo pode ter gravado uma STRING JSON
  -- em vez de objeto (o flow-execute já se defende disso na leitura). Tenta
  -- desserializar antes de desistir: trocar direto por '{}' apagaria o resto do
  -- metadata do contato.
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

  _current := _base -> 'custom_fields';
  IF _current IS NULL OR jsonb_typeof(_current) <> 'object' THEN
    _current := '{}'::jsonb;
  END IF;

  UPDATE public.contacts
     SET metadata = jsonb_set(_base, '{custom_fields}', _current || _values, true)
   WHERE id = _contact_id;
END;
$$;

-- Sem SECURITY DEFINER de propósito: quem chama pelo app continua sujeito à RLS
-- de contacts, e a edge function usa service role.
REVOKE ALL ON FUNCTION public.merge_contact_custom_fields(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.merge_contact_custom_fields(uuid, jsonb) TO authenticated, service_role;
