-- Centralize destructive conversation/tag cleanup behind SECURITY DEFINER RPCs.
-- Client-side chained deletes can be interrupted by RLS on related tables, leaving
-- the UI with generic errors for otherwise valid organization-scoped actions.

CREATE OR REPLACE FUNCTION public.delete_tag_safely(_tag_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org_id uuid;
BEGIN
  SELECT organization_id INTO _org_id
  FROM public.tags
  WHERE id = _tag_id;

  IF _org_id IS NULL THEN
    RAISE EXCEPTION 'Tag not found';
  END IF;

  IF _org_id <> public.get_user_org_id(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.workspaces
  SET filter_tag_ids = array_remove(COALESCE(filter_tag_ids, '{}'::uuid[]), _tag_id)
  WHERE organization_id = _org_id
    AND _tag_id = ANY(COALESCE(filter_tag_ids, '{}'::uuid[]));

  UPDATE public.widgets
  SET tag_id = NULL,
      tag_ids = array_remove(COALESCE(tag_ids, '{}'::uuid[]), _tag_id)
  WHERE organization_id = _org_id
    AND (tag_id = _tag_id OR _tag_id = ANY(COALESCE(tag_ids, '{}'::uuid[])));

  UPDATE public.pipeline_columns pc
  SET auto_add_tag_ids = array_remove(COALESCE(pc.auto_add_tag_ids, '{}'::uuid[]), _tag_id)
  FROM public.pipelines p
  WHERE p.id = pc.pipeline_id
    AND p.organization_id = _org_id
    AND _tag_id = ANY(COALESCE(pc.auto_add_tag_ids, '{}'::uuid[]));

  DELETE FROM public.contact_tags WHERE tag_id = _tag_id;
  DELETE FROM public.tags WHERE id = _tag_id AND organization_id = _org_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_tag_safely(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_conversation_safely(_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org_id uuid;
BEGIN
  SELECT organization_id INTO _org_id
  FROM public.conversations
  WHERE id = _conversation_id;

  IF _org_id IS NULL THEN
    RAISE EXCEPTION 'Conversation not found';
  END IF;

  IF _org_id <> public.get_user_org_id(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  DELETE FROM public.conversations
  WHERE id = _conversation_id
    AND organization_id = _org_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_conversation_safely(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_conversation_workspace_safely(
  _conversation_id uuid,
  _workspace_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org_id uuid;
  _contact_id uuid;
BEGIN
  SELECT organization_id, contact_id INTO _org_id, _contact_id
  FROM public.conversations
  WHERE id = _conversation_id;

  IF _org_id IS NULL THEN
    RAISE EXCEPTION 'Conversation not found';
  END IF;

  IF _org_id <> public.get_user_org_id(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF _workspace_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.workspaces
    WHERE id = _workspace_id
      AND organization_id = _org_id
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Workspace not found';
  END IF;

  UPDATE public.conversations
  SET workspace_id = _workspace_id
  WHERE id = _conversation_id
    AND organization_id = _org_id;

  UPDATE public.contacts
  SET workspace_id = _workspace_id
  WHERE id = _contact_id
    AND organization_id = _org_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_conversation_workspace_safely(uuid, uuid) TO authenticated;
