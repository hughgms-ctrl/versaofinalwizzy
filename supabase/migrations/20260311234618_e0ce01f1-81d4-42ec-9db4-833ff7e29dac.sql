-- Add missing columns to governance_prompts
ALTER TABLE governance_prompts ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE governance_prompts ADD COLUMN IF NOT EXISTS is_generic boolean DEFAULT false;