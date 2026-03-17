CREATE OR REPLACE FUNCTION public.auto_assign_workspace_on_tag()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _workspace_id uuid;
  _org_id uuid;
  _current_workspace_id uuid;
BEGIN
  -- Get the contact's organization and current workspace
  SELECT organization_id, workspace_id INTO _org_id, _current_workspace_id FROM contacts WHERE id = NEW.contact_id;

  -- If the contact already has a workspace assigned, do NOT override it
  -- This prevents campaign-assigned workspaces from being overridden by tag triggers
  IF _current_workspace_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Find a workspace whose filter_tag_ids contains this tag
  SELECT id INTO _workspace_id
  FROM workspaces
  WHERE is_active = true
    AND organization_id = _org_id
    AND NEW.tag_id = ANY(filter_tag_ids)
  LIMIT 1;

  IF _workspace_id IS NOT NULL THEN
    -- Update contact workspace
    UPDATE contacts SET workspace_id = _workspace_id WHERE id = NEW.contact_id;

    -- Update all conversations for this contact
    UPDATE conversations SET workspace_id = _workspace_id WHERE contact_id = NEW.contact_id AND (workspace_id IS NULL);
  END IF;

  RETURN NEW;
END;
$function$;