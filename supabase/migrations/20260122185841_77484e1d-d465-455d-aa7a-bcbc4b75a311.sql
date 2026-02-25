-- Create table to cache media transcriptions/descriptions
CREATE TABLE public.media_transcriptions (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
    media_url TEXT NOT NULL,
    media_type TEXT NOT NULL,
    transcription TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(message_id)
);

-- Enable RLS
ALTER TABLE public.media_transcriptions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view transcriptions for messages in their org's conversations
CREATE POLICY "Users can view transcriptions for their org messages"
ON public.media_transcriptions
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.messages m
        JOIN public.conversations c ON c.id = m.conversation_id
        WHERE m.id = media_transcriptions.message_id
        AND c.organization_id = public.get_user_org_id(auth.uid())
    )
);

-- Policy: Service role can insert (from edge functions)
CREATE POLICY "Service role can manage transcriptions"
ON public.media_transcriptions
FOR ALL
USING (true)
WITH CHECK (true);

-- Create index for faster lookups
CREATE INDEX idx_media_transcriptions_message_id ON public.media_transcriptions(message_id);
CREATE INDEX idx_media_transcriptions_media_url ON public.media_transcriptions(media_url);