
-- Add trigger configuration to master_prompts
ALTER TABLE public.master_prompts
  ADD COLUMN trigger_type text NOT NULL DEFAULT 'disabled',
  ADD COLUMN trigger_tags uuid[] DEFAULT '{}'::uuid[],
  ADD COLUMN trigger_keywords jsonb DEFAULT '[]'::jsonb;

-- trigger_type: 'disabled' | 'tag' | 'keyword'
-- trigger_tags: array of tag UUIDs (when trigger_type = 'tag')
-- trigger_keywords: array of { value: string, match_type: 'exact' | 'contains' | 'starts_with' }
