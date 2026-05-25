-- Add visible_in_chat column to flows and flow_folders
ALTER TABLE flows ADD COLUMN IF NOT EXISTS visible_in_chat BOOLEAN DEFAULT TRUE;
ALTER TABLE flow_folders ADD COLUMN IF NOT EXISTS visible_in_chat BOOLEAN DEFAULT TRUE;
