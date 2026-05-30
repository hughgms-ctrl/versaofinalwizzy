ALTER TABLE public.pipelines
ADD COLUMN IF NOT EXISTS board_background_color text DEFAULT '#9b3f6d',
ADD COLUMN IF NOT EXISTS board_background_image text;
