-- Conversations must have one owner workspace. Do not use workspace_ids to
-- make conversations visible in every workspace linked to the same number.

UPDATE public.conversations
SET workspace_ids = CASE
  WHEN workspace_id IS NULL THEN '{}'::uuid[]
  ELSE ARRAY[workspace_id]
END;
