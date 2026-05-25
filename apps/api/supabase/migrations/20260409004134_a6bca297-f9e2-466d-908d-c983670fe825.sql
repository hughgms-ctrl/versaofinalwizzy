
-- Change default token to 8 chars (shorter URLs)
ALTER TABLE public.quizzes 
ALTER COLUMN public_token SET DEFAULT encode(gen_random_bytes(4), 'hex');

-- Update existing long tokens to shorter ones
UPDATE public.quizzes 
SET public_token = encode(gen_random_bytes(4), 'hex')
WHERE public_token IS NOT NULL AND length(public_token) > 8;
