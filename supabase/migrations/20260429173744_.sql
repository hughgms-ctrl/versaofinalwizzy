
ALTER TABLE public.document_folders
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'both' CHECK (kind IN ('template','pack','both'));

ALTER TABLE public.document_signatures
  ADD COLUMN IF NOT EXISTS archived_at timestamp with time zone;
;
