-- Migration to add show_unassigned column to public.pipelines
ALTER TABLE public.pipelines ADD COLUMN IF NOT EXISTS show_unassigned boolean NOT NULL DEFAULT false;
