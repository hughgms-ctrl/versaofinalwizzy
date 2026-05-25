-- Create unique index to prevent duplicate conversations per contact per organization
-- This ensures data integrity at the database level
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_contact_org_unique 
ON public.conversations (contact_id, organization_id);