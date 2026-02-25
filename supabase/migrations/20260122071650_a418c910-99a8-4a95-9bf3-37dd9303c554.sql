-- Add columns for message sync tracking
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS oldest_synced_message_id TEXT DEFAULT NULL;