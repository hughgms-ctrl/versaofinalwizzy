
-- Trigger function: auto-assign workspace_id based on tag matching
CREATE OR REPLACE FUNCTION public.auto_assign_workspace_on_tag()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _workspace_id uuid;
  _org_id uuid;
BEGIN
  -- Get the contact's organization
  SELECT organization_id INTO _org_id FROM contacts WHERE id = NEW.contact_id;

  -- Find a workspace whose filter_tag_ids contains this tag
  SELECT id INTO _workspace_id
  FROM workspaces
  WHERE is_active = true
    AND organization_id = _org_id
    AND NEW.tag_id = ANY(filter_tag_ids)
  LIMIT 1;

  IF _workspace_id IS NOT NULL THEN
    -- Update contact workspace
    UPDATE contacts SET workspace_id = _workspace_id WHERE id = NEW.contact_id AND (workspace_id IS NULL OR workspace_id != _workspace_id);

    -- Update all conversations for this contact
    UPDATE conversations SET workspace_id = _workspace_id WHERE contact_id = NEW.contact_id AND (workspace_id IS NULL OR workspace_id != _workspace_id);
  END IF;

  RETURN NEW;
END;
$$;

-- Attach trigger to contact_tags
CREATE TRIGGER trg_auto_assign_workspace_on_tag
AFTER INSERT ON public.contact_tags
FOR EACH ROW
EXECUTE FUNCTION public.auto_assign_workspace_on_tag();
