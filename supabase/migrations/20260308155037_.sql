ALTER TABLE public.pipelines ADD COLUMN IF NOT EXISTS default_assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL;;
