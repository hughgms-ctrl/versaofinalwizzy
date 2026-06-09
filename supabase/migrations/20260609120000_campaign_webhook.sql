-- Webhook trigger support for campaigns
-- 1. Unique public token per campaign (each webhook campaign gets a different URL)
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS webhook_token UUID DEFAULT gen_random_uuid();

-- Backfill any existing rows that don't have a token yet
UPDATE public.campaigns SET webhook_token = gen_random_uuid() WHERE webhook_token IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_campaigns_webhook_token ON public.campaigns(webhook_token);

-- 2. Carry seeded flow variables through the queue (used when a webhook hit is
--    enqueued because it arrived outside the campaign time window).
ALTER TABLE public.campaign_queue ADD COLUMN IF NOT EXISTS variables JSONB;

-- 3. Log of incoming webhook calls (auditing / debugging)
CREATE TABLE IF NOT EXISTS public.campaign_webhook_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE,
    payload JSONB,
    status TEXT NOT NULL DEFAULT 'received', -- received, processed, queued, skipped, error
    error TEXT,
    contacts_processed INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_webhook_logs_campaign ON public.campaign_webhook_logs(campaign_id, created_at DESC);

ALTER TABLE public.campaign_webhook_logs ENABLE ROW LEVEL SECURITY;

-- Allow all for service role (the public edge function writes with the service key)
CREATE POLICY "Allow all for service role" ON public.campaign_webhook_logs
    FOR ALL USING (auth.role() = 'service_role');

-- Allow select for authenticated users in the same org
CREATE POLICY "Allow select for org users" ON public.campaign_webhook_logs
    FOR SELECT USING (
        organization_id IN (
            SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
        )
    );
