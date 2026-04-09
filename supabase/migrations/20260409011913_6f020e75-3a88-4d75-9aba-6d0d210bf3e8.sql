ALTER TABLE public.quizzes ALTER COLUMN public_token SET DEFAULT encode(gen_random_bytes(3), 'hex');

UPDATE public.quizzes SET public_token = encode(gen_random_bytes(3), 'hex') WHERE length(public_token) > 6;