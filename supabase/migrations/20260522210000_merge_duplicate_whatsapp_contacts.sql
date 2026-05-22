CREATE OR REPLACE FUNCTION public.whatsapp_phone_match_key(raw_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  WITH clean AS (
    SELECT regexp_replace(coalesce(raw_phone, ''), '\D', '', 'g') AS digits
  ),
  no_country AS (
    SELECT CASE
      WHEN digits LIKE '55%' AND length(digits) >= 12 THEN substr(digits, 3)
      ELSE digits
    END AS local_digits
    FROM clean
  )
  SELECT CASE
    WHEN length(local_digits) = 11 AND substr(local_digits, 3, 1) = '9'
      THEN substr(local_digits, 1, 2) || substr(local_digits, 4)
    ELSE local_digits
  END
  FROM no_country;
$$;

DO $$
DECLARE
  duplicate_group record;
  duplicate_contact record;
  keeper_contact_id uuid;
  keeper_conversation_id uuid;
  duplicate_conversation_id uuid;
  merged_aliases jsonb;
BEGIN
  FOR duplicate_group IN
    SELECT organization_id, public.whatsapp_phone_match_key(phone) AS phone_key
    FROM public.contacts
    WHERE phone IS NOT NULL AND public.whatsapp_phone_match_key(phone) <> ''
    GROUP BY organization_id, public.whatsapp_phone_match_key(phone)
    HAVING count(*) > 1
  LOOP
    SELECT c.id
    INTO keeper_contact_id
    FROM public.contacts c
    WHERE c.organization_id = duplicate_group.organization_id
      AND public.whatsapp_phone_match_key(c.phone) = duplicate_group.phone_key
    ORDER BY
      CASE WHEN regexp_replace(c.phone, '\D', '', 'g') LIKE '55%' THEN 0 ELSE 1 END,
      c.updated_at DESC NULLS LAST,
      c.created_at DESC NULLS LAST
    LIMIT 1;

    SELECT conv.id
    INTO keeper_conversation_id
    FROM public.conversations conv
    WHERE conv.contact_id = keeper_contact_id
      AND conv.organization_id = duplicate_group.organization_id
    ORDER BY conv.last_message_at DESC NULLS LAST, conv.created_at DESC
    LIMIT 1;

    FOR duplicate_contact IN
      SELECT *
      FROM public.contacts c
      WHERE c.organization_id = duplicate_group.organization_id
        AND public.whatsapp_phone_match_key(c.phone) = duplicate_group.phone_key
        AND c.id <> keeper_contact_id
    LOOP
      SELECT conv.id
      INTO duplicate_conversation_id
      FROM public.conversations conv
      WHERE conv.contact_id = duplicate_contact.id
        AND conv.organization_id = duplicate_group.organization_id
      ORDER BY conv.last_message_at DESC NULLS LAST, conv.created_at DESC
      LIMIT 1;

      IF keeper_conversation_id IS NULL AND duplicate_conversation_id IS NOT NULL THEN
        UPDATE public.conversations
        SET contact_id = keeper_contact_id
        WHERE id = duplicate_conversation_id;
        keeper_conversation_id := duplicate_conversation_id;
      ELSIF keeper_conversation_id IS NOT NULL AND duplicate_conversation_id IS NOT NULL THEN
        UPDATE public.messages
        SET conversation_id = keeper_conversation_id
        WHERE conversation_id = duplicate_conversation_id;

        UPDATE public.flow_executions SET conversation_id = keeper_conversation_id WHERE conversation_id = duplicate_conversation_id;
        UPDATE public.campaign_queue SET conversation_id = keeper_conversation_id WHERE conversation_id = duplicate_conversation_id;
        UPDATE public.calendar_bookings SET conversation_id = keeper_conversation_id WHERE conversation_id = duplicate_conversation_id;
        UPDATE public.cases SET conversation_id = keeper_conversation_id WHERE conversation_id = duplicate_conversation_id;

        UPDATE public.conversations k
        SET
          last_message_at = greatest(
            coalesce(k.last_message_at, '-infinity'::timestamptz),
            coalesce(d.last_message_at, '-infinity'::timestamptz)
          ),
          unread_count = coalesce(k.unread_count, 0) + coalesce(d.unread_count, 0),
          metadata = coalesce(k.metadata, '{}'::jsonb) || jsonb_build_object('merged_conversation_ids',
            coalesce(k.metadata->'merged_conversation_ids', '[]'::jsonb) || to_jsonb(d.id::text)
          )
        FROM public.conversations d
        WHERE k.id = keeper_conversation_id
          AND d.id = duplicate_conversation_id;

        DELETE FROM public.conversations
        WHERE id = duplicate_conversation_id;
      END IF;

      UPDATE public.contact_tags ct
      SET contact_id = keeper_contact_id
      WHERE ct.contact_id = duplicate_contact.id
        AND NOT EXISTS (
          SELECT 1 FROM public.contact_tags existing
          WHERE existing.contact_id = keeper_contact_id
            AND existing.tag_id = ct.tag_id
        );
      DELETE FROM public.contact_tags WHERE contact_id = duplicate_contact.id;

      DELETE FROM public.contact_presence cp
      WHERE cp.contact_id = duplicate_contact.id
        AND EXISTS (
          SELECT 1 FROM public.contact_presence existing
          WHERE existing.contact_id = keeper_contact_id
        );
      UPDATE public.contact_presence SET contact_id = keeper_contact_id WHERE contact_id = duplicate_contact.id;

      DELETE FROM public.scheduled_message_contacts smc
      WHERE smc.contact_id = duplicate_contact.id
        AND EXISTS (
          SELECT 1 FROM public.scheduled_message_contacts existing
          WHERE existing.contact_id = keeper_contact_id
            AND existing.scheduled_message_id = smc.scheduled_message_id
        );
      UPDATE public.scheduled_message_contacts SET contact_id = keeper_contact_id WHERE contact_id = duplicate_contact.id;

      UPDATE public.contact_notes SET contact_id = keeper_contact_id WHERE contact_id = duplicate_contact.id;
      UPDATE public.contact_folders SET contact_id = keeper_contact_id WHERE contact_id = duplicate_contact.id;
      UPDATE public.contact_files SET contact_id = keeper_contact_id WHERE contact_id = duplicate_contact.id;
      UPDATE public.scheduled_messages SET contact_id = keeper_contact_id WHERE contact_id = duplicate_contact.id;
      UPDATE public.campaign_queue SET contact_id = keeper_contact_id WHERE contact_id = duplicate_contact.id;
      UPDATE public.calendar_bookings SET contact_id = keeper_contact_id WHERE contact_id = duplicate_contact.id;
      UPDATE public.cases SET contact_id = keeper_contact_id WHERE contact_id = duplicate_contact.id;
      UPDATE public.widget_submissions SET contact_id = keeper_contact_id WHERE contact_id = duplicate_contact.id;
      UPDATE public.quiz_submissions SET contact_id = keeper_contact_id WHERE contact_id = duplicate_contact.id;

      SELECT jsonb_agg(DISTINCT value)
      INTO merged_aliases
      FROM jsonb_array_elements_text(
        coalesce((SELECT metadata->'phone_aliases' FROM public.contacts WHERE id = keeper_contact_id), '[]'::jsonb) ||
        coalesce(duplicate_contact.metadata->'phone_aliases', '[]'::jsonb) ||
        to_jsonb(ARRAY[duplicate_contact.phone])
      ) AS alias(value);

      UPDATE public.contacts keeper
      SET
        name = coalesce(nullif(keeper.name, ''), duplicate_contact.name),
        email = coalesce(nullif(keeper.email, ''), duplicate_contact.email),
        avatar_url = coalesce(nullif(keeper.avatar_url, ''), duplicate_contact.avatar_url),
        metadata = coalesce(keeper.metadata, '{}'::jsonb) ||
          jsonb_build_object(
            'phone_aliases', coalesce(merged_aliases, '[]'::jsonb),
            'canonical_phone', regexp_replace(keeper.phone, '\D', '', 'g'),
            'merged_contact_ids', coalesce(keeper.metadata->'merged_contact_ids', '[]'::jsonb) || to_jsonb(duplicate_contact.id::text)
          ),
        updated_at = now()
      WHERE keeper.id = keeper_contact_id;

      DELETE FROM public.contacts WHERE id = duplicate_contact.id;
    END LOOP;
  END LOOP;
END $$;
