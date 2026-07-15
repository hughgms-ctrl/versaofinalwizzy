-- Fase 1.2 (plano-seguranca-storage-buckets): endurecer o upload público do quiz.
--
-- Antes: policy INSERT `TO public` só checava o prefixo `quiz-uploads/%` no bucket
-- público contact-files. Qualquer anônimo podia despejar arquivo arbitrário
-- (dump/malware) num bucket de leitura pública, sem nenhum quiz por trás.
--
-- Depois: o quiz_id embutido no path (`quiz-uploads/<quiz_id>/<arquivo>`) precisa
-- corresponder a um quiz REAL, ativo e público. Mesma fronteira de confiança que a
-- policy "Anyone can view active quizzes by token" (is_active=true AND public_token).
--
-- RLS-only: NÃO muda a convenção de path do app (PublicQuizPage.tsx:894 já usa
-- `quiz-uploads/${quiz.id}/...`), NÃO torna o bucket privado, NÃO afeta leitura.
-- Comparação feita como texto (q.id::text) pra não estourar cast de uuid num path
-- inesperado.

DROP POLICY IF EXISTS "Public users can upload quiz files" ON storage.objects;

CREATE POLICY "Public users can upload quiz files"
ON storage.objects FOR INSERT
TO public
WITH CHECK (
  bucket_id = 'contact-files'
  AND name LIKE 'quiz-uploads/%'
  AND EXISTS (
    SELECT 1
    FROM public.quizzes q
    WHERE q.id::text = (storage.foldername(name))[2]
      AND q.is_active = true
      AND q.public_token IS NOT NULL
  )
);
