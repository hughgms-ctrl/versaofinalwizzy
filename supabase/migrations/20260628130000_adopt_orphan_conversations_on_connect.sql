-- Adota conversas ÓRFÃS (whatsapp_instance_id IS NULL) ao (re)conectar um número.
--
-- Problema (confirmado 2026-06-28):
--   • Ao deletar/desconectar uma instância, suas conversas viram órfãs
--     (FK ON DELETE SET NULL → whatsapp_instance_id = NULL), mas mantêm o
--     source_phone (número da empresa que recebeu/enviou).
--   • Ao reconectar/adicionar o número, é criada uma instância com NOVO uuid.
--     O zapi-webhook procura conversa por (contato, org, NOVO uuid), não acha a
--     órfã (NULL) e CRIA UMA NOVA conversa → chat DUPLICADO com o mesmo número.
--
-- Correção (regra de negócio confirmada 2026-06-28):
--   • Gatilho: ao conectar/associar o número (quando o phone_number é gravado).
--   • Critério: adota só órfãs cujo source_phone casa com o phone_number da
--     instância (match key = mesmo número, tolerante a DDI 55 e 9º dígito).
--     Seguro mesmo com várias instâncias na mesma org — não toca conversas de
--     OUTROS números (essas têm whatsapp_instance_id real, não NULL).
--   • Se já existir conversa daquele contato na instância (o "duplicado" recém
--     criado pelo webhook), faz MERGE: move mensagens e registros operacionais
--     para a conversa keeper e deleta a órfã — evita a colisão 23505 no índice
--     parcial idx_conversations_contact_org_instance_unique (contato, org, instância).
--
-- Idempotente: rodar de novo não faz nada (órfãs já adotadas deixam de ter
-- whatsapp_instance_id NULL). Chamada pelo zapi-check-status no connect.
--
-- Aplicação: MANUAL no SQL Editor do Supabase (regra de deploy Lovable).

CREATE OR REPLACE FUNCTION public.adopt_orphan_conversations_for_instance(_instance_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org_id uuid;
  _phone_key text;
  _orphan record;
  _keeper_id uuid;
  _adopted integer := 0;
BEGIN
  -- Resolve a instância e seu número.
  SELECT organization_id, public.whatsapp_phone_match_key(phone_number)
  INTO _org_id, _phone_key
  FROM public.whatsapp_instances
  WHERE id = _instance_id;

  -- Sem instância ou sem número conhecido → nada a adotar (critério é por número).
  IF _org_id IS NULL OR _phone_key IS NULL OR _phone_key = '' THEN
    RETURN 0;
  END IF;

  -- Percorre as órfãs daquele número, na mesma org.
  FOR _orphan IN
    SELECT id, contact_id, last_message_at, unread_count, metadata
    FROM public.conversations
    WHERE whatsapp_instance_id IS NULL
      AND organization_id = _org_id
      AND public.whatsapp_phone_match_key(source_phone) = _phone_key
    ORDER BY created_at ASC
  LOOP
    -- Já existe conversa desse contato NA instância? (duplicado criado pelo webhook
    -- ou órfã anterior já adotada nesta mesma execução).
    SELECT id INTO _keeper_id
    FROM public.conversations
    WHERE contact_id = _orphan.contact_id
      AND organization_id = _org_id
      AND whatsapp_instance_id = _instance_id
    LIMIT 1;

    IF _keeper_id IS NULL THEN
      -- Caminho feliz: nenhuma duplicata → só carimba a instância na órfã.
      UPDATE public.conversations
      SET whatsapp_instance_id = _instance_id
      WHERE id = _orphan.id;
      _adopted := _adopted + 1;

    ELSIF _keeper_id <> _orphan.id THEN
      -- Há duplicata → MERGE da órfã para a keeper (mesmo contato/instância).
      -- Move histórico e registros operacionais (mesmo conjunto do merge de contatos).
      UPDATE public.messages          SET conversation_id = _keeper_id WHERE conversation_id = _orphan.id;
      UPDATE public.flow_executions   SET conversation_id = _keeper_id WHERE conversation_id = _orphan.id;
      UPDATE public.campaign_queue    SET conversation_id = _keeper_id WHERE conversation_id = _orphan.id;
      UPDATE public.calendar_bookings SET conversation_id = _keeper_id WHERE conversation_id = _orphan.id;
      UPDATE public.cases             SET conversation_id = _keeper_id WHERE conversation_id = _orphan.id;

      UPDATE public.conversations k
      SET
        last_message_at = greatest(
          coalesce(k.last_message_at, '-infinity'::timestamptz),
          coalesce(_orphan.last_message_at, '-infinity'::timestamptz)
        ),
        unread_count = coalesce(k.unread_count, 0) + coalesce(_orphan.unread_count, 0),
        metadata = coalesce(k.metadata, '{}'::jsonb) || jsonb_build_object(
          'merged_conversation_ids',
          coalesce(k.metadata->'merged_conversation_ids', '[]'::jsonb) || to_jsonb(_orphan.id::text)
        )
      WHERE k.id = _keeper_id;

      DELETE FROM public.conversations WHERE id = _orphan.id;
      _adopted := _adopted + 1;
    END IF;
  END LOOP;

  RETURN _adopted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.adopt_orphan_conversations_for_instance(uuid) TO authenticated, service_role;
