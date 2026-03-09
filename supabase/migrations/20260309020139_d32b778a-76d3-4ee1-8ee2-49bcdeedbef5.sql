
-- Clean duplicates: keep only the most recent position per conversation_id
DELETE FROM conversation_pipeline_positions
WHERE id NOT IN (
  SELECT DISTINCT ON (conversation_id) id
  FROM conversation_pipeline_positions
  ORDER BY conversation_id, updated_at DESC
);

-- Add unique constraint: one conversation can only be in one pipeline globally
ALTER TABLE conversation_pipeline_positions
ADD CONSTRAINT unique_conversation_pipeline_position UNIQUE (conversation_id);
