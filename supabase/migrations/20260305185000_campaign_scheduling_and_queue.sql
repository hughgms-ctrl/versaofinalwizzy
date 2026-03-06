-- Add scheduling columns to campaigns
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS start_hour INTEGER DEFAULT 0;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS end_hour INTEGER DEFAULT 23;

-- Create campaign queue table
CREATE TABLE IF NOT EXISTS public.campaign_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE,
    message_content TEXT,
    scheduled_for TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- pending, processed, failed
    created_at TIMESTAMPTZ DEFAULT now(),
    processed_at TIMESTAMPTZ
);

-- Add index for pending items
CREATE INDEX IF NOT EXISTS idx_campaign_queue_status_scheduled ON public.campaign_queue(status, scheduled_for);

-- Enable RLS
ALTER TABLE public.campaign_queue ENABLE ROW LEVEL SECURITY;

-- Allow all for service role (webhooks/functions)
CREATE POLICY "Allow all for service role" ON public.campaign_queue
    FOR ALL USING (auth.role() = 'service_role');

-- Allow select for authenticated users in same org
CREATE POLICY "Allow select for org users" ON public.campaign_queue
    FOR SELECT USING (
        organization_id IN (
            SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
        )
    );
