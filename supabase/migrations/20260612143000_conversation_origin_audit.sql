-- Audit-only origin tracking for WhatsApp conversations/messages.
--
-- IMPORTANT:
-- This table must never be used for inbox visibility, conversation RLS,
-- workspace access, or message routing. It exists only for support,
-- cleanup, and historical tracing of which connected WhatsApp identity
-- was observed when a conversation/message entered the system.

CREATE TABLE IF NOT EXISTS public.conversation_origin_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  whatsapp_instance_id uuid REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL,
  connected_phone text,
  connected_phone_digits text GENERATED ALWAYS AS (
    regexp_replace(coalesce(connected_phone, ''), '\D', '', 'g')
  ) STORED,
  provider text,
  provider_instance_id text,
  provider_instance_name text,
  captured_from text NOT NULL DEFAULT 'unknown',
  captured_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE public.conversation_origin_audit IS
'Audit-only origin table. Do not use for inbox visibility, RLS filtering, routing, workspace access, or message delivery decisions.';

COMMENT ON COLUMN public.conversation_origin_audit.connected_phone IS
'Connected WhatsApp phone/identity observed at ingestion time. Historical/support metadata only; not an access-control boundary.';

CREATE INDEX IF NOT EXISTS idx_conversation_origin_audit_org_phone
  ON public.conversation_origin_audit (organization_id, connected_phone_digits);

CREATE INDEX IF NOT EXISTS idx_conversation_origin_audit_conversation
  ON public.conversation_origin_audit (conversation_id);

CREATE INDEX IF NOT EXISTS idx_conversation_origin_audit_instance
  ON public.conversation_origin_audit (whatsapp_instance_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_origin_audit_message_unique
  ON public.conversation_origin_audit (message_id)
  WHERE message_id IS NOT NULL;

ALTER TABLE public.conversation_origin_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view conversation origin audit in their org"
ON public.conversation_origin_audit;

CREATE POLICY "Users can view conversation origin audit in their org"
ON public.conversation_origin_audit
FOR SELECT
USING (organization_id = public.get_user_org_id(auth.uid()));

DROP POLICY IF EXISTS "Platform admins can manage conversation origin audit"
ON public.conversation_origin_audit;

CREATE POLICY "Platform admins can manage conversation origin audit"
ON public.conversation_origin_audit
FOR ALL
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.record_conversation_origin_audit(
  _organization_id uuid,
  _conversation_id uuid,
  _whatsapp_instance_id uuid DEFAULT NULL,
  _message_id uuid DEFAULT NULL,
  _connected_phone text DEFAULT NULL,
  _provider text DEFAULT NULL,
  _provider_instance_id text DEFAULT NULL,
  _provider_instance_name text DEFAULT NULL,
  _captured_from text DEFAULT 'unknown',
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _conversation_org_id uuid;
  _message_conversation_id uuid;
  _jwt_role text;
BEGIN
  SELECT current_setting('request.jwt.claim.role', true) INTO _jwt_role;

  IF coalesce(_jwt_role, '') <> 'service_role'
     AND auth.uid() IS NOT NULL
     AND _organization_id <> public.get_user_org_id(auth.uid())
     AND NOT public.is_platform_admin(auth.uid())
  THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT organization_id INTO _conversation_org_id
  FROM public.conversations
  WHERE id = _conversation_id;

  IF _conversation_org_id IS NULL THEN
    RAISE EXCEPTION 'Conversation not found';
  END IF;

  IF _conversation_org_id <> _organization_id THEN
    RAISE EXCEPTION 'Conversation organization mismatch';
  END IF;

  IF _message_id IS NOT NULL THEN
    SELECT conversation_id INTO _message_conversation_id
    FROM public.messages
    WHERE id = _message_id;

    IF _message_conversation_id IS NULL THEN
      RAISE EXCEPTION 'Message not found';
    END IF;

    IF _message_conversation_id <> _conversation_id THEN
      RAISE EXCEPTION 'Message conversation mismatch';
    END IF;

    INSERT INTO public.conversation_origin_audit (
      organization_id,
      conversation_id,
      message_id,
      whatsapp_instance_id,
      connected_phone,
      provider,
      provider_instance_id,
      provider_instance_name,
      captured_from,
      metadata
    )
    VALUES (
      _organization_id,
      _conversation_id,
      _message_id,
      _whatsapp_instance_id,
      NULLIF(_connected_phone, ''),
      NULLIF(_provider, ''),
      NULLIF(_provider_instance_id, ''),
      NULLIF(_provider_instance_name, ''),
      coalesce(NULLIF(_captured_from, ''), 'unknown'),
      coalesce(_metadata, '{}'::jsonb)
    )
    ON CONFLICT (message_id) WHERE message_id IS NOT NULL
    DO UPDATE SET
      whatsapp_instance_id = coalesce(EXCLUDED.whatsapp_instance_id, conversation_origin_audit.whatsapp_instance_id),
      connected_phone = coalesce(EXCLUDED.connected_phone, conversation_origin_audit.connected_phone),
      provider = coalesce(EXCLUDED.provider, conversation_origin_audit.provider),
      provider_instance_id = coalesce(EXCLUDED.provider_instance_id, conversation_origin_audit.provider_instance_id),
      provider_instance_name = coalesce(EXCLUDED.provider_instance_name, conversation_origin_audit.provider_instance_name),
      captured_from = EXCLUDED.captured_from,
      metadata = conversation_origin_audit.metadata || EXCLUDED.metadata;

    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.conversation_origin_audit coa
    WHERE coa.organization_id = _organization_id
      AND coa.conversation_id = _conversation_id
      AND coa.message_id IS NULL
      AND coa.whatsapp_instance_id IS NOT DISTINCT FROM _whatsapp_instance_id
      AND coa.connected_phone_digits = regexp_replace(coalesce(_connected_phone, ''), '\D', '', 'g')
      AND coa.provider IS NOT DISTINCT FROM NULLIF(_provider, '')
      AND coa.provider_instance_id IS NOT DISTINCT FROM NULLIF(_provider_instance_id, '')
      AND coa.provider_instance_name IS NOT DISTINCT FROM NULLIF(_provider_instance_name, '')
      AND coa.captured_from = coalesce(NULLIF(_captured_from, ''), 'unknown')
  ) THEN
    INSERT INTO public.conversation_origin_audit (
      organization_id,
      conversation_id,
      whatsapp_instance_id,
      connected_phone,
      provider,
      provider_instance_id,
      provider_instance_name,
      captured_from,
      metadata
    )
    VALUES (
      _organization_id,
      _conversation_id,
      _whatsapp_instance_id,
      NULLIF(_connected_phone, ''),
      NULLIF(_provider, ''),
      NULLIF(_provider_instance_id, ''),
      NULLIF(_provider_instance_name, ''),
      coalesce(NULLIF(_captured_from, ''), 'unknown'),
      coalesce(_metadata, '{}'::jsonb)
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_conversation_origin_audit(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  jsonb
) TO authenticated, service_role;
