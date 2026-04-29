
-- Classifica pastas com base no conteúdo atual
UPDATE public.document_folders f SET kind = 'template'
WHERE EXISTS (SELECT 1 FROM public.document_templates t WHERE t.folder_id = f.id)
  AND NOT EXISTS (SELECT 1 FROM public.document_packs p WHERE p.folder_id = f.id);

UPDATE public.document_folders f SET kind = 'pack'
WHERE EXISTS (SELECT 1 FROM public.document_packs p WHERE p.folder_id = f.id)
  AND NOT EXISTS (SELECT 1 FROM public.document_templates t WHERE t.folder_id = f.id);
