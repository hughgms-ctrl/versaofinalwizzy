ALTER TABLE public.document_templates
  ADD COLUMN IF NOT EXISTS content_html text,
  ADD COLUMN IF NOT EXISTS logo_url text;

UPDATE public.document_templates
SET content_html = '<p>' || replace(coalesce(content,''), E'\n', '</p><p>') || '</p>'
WHERE content_html IS NULL;;
