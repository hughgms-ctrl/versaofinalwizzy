
-- 1. Notificações por workspace
ALTER TABLE public.stage_notifications ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.stage_notifications DROP CONSTRAINT IF EXISTS stage_notifications_pipeline_id_column_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS stage_notifications_pipeline_column_workspace_uidx
  ON public.stage_notifications (pipeline_id, column_id, COALESCE(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- 5. Tags automáticas por coluna
ALTER TABLE public.pipeline_columns ADD COLUMN IF NOT EXISTS auto_add_tag_ids uuid[] NOT NULL DEFAULT '{}';

-- Trigger no conversation_pipeline_positions
CREATE OR REPLACE FUNCTION public.apply_column_auto_tags()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _tag_ids uuid[];
  _tag_id uuid;
  _contact_id uuid;
BEGIN
  IF NEW.column_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.column_id = OLD.column_id THEN RETURN NEW; END IF;

  SELECT contact_id INTO _contact_id FROM public.conversations WHERE id = NEW.conversation_id;
  IF _contact_id IS NULL THEN RETURN NEW; END IF;

  SELECT auto_add_tag_ids INTO _tag_ids FROM public.pipeline_columns WHERE id = NEW.column_id;
  IF _tag_ids IS NULL OR array_length(_tag_ids, 1) IS NULL THEN RETURN NEW; END IF;

  FOREACH _tag_id IN ARRAY _tag_ids LOOP
    INSERT INTO public.contact_tags (contact_id, tag_id, added_by_type)
    VALUES (_contact_id, _tag_id, 'system')
    ON CONFLICT DO NOTHING;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_column_auto_tags ON public.conversation_pipeline_positions;
CREATE TRIGGER trg_apply_column_auto_tags
  AFTER INSERT OR UPDATE OF column_id ON public.conversation_pipeline_positions
  FOR EACH ROW EXECUTE FUNCTION public.apply_column_auto_tags();
