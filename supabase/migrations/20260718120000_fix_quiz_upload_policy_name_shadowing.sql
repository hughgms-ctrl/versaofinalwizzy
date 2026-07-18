-- Corrige name-shadowing na policy de upload público de quiz (20260709120500).
--
-- Bug: dentro do `EXISTS (SELECT 1 FROM quizzes q ...)`, o `(storage.foldername(name))[2]`
-- estava SEM qualificar. Como `quizzes` tem coluna `name`, o Postgres ligou `name`
-- a `q.name` (o TÍTULO do quiz, ex. "Novo Wizzy Quiz") em vez de `storage.objects.name`
-- (o path do arquivo). Resultado: `foldername('<titulo>')[2]` = NULL → o EXISTS é
-- SEMPRE falso → TODO upload anônimo de quiz falha com "new row violates row-level
-- security policy". (Mesma classe de bug que a 20260713120000 e o flip 20260715120000
-- já tinham corrigido qualificando objects.name — aqui faltou.)
--
-- Fix: recria a policy idêntica na intenção (só quiz ativo/público pode receber
-- upload em quiz-uploads/<quiz_id>/...), mas QUALIFICANDO objects.name em ambos os
-- usos de foldername. Sem mudança de path, sem afetar leitura, bucket segue privado.

DROP POLICY IF EXISTS "Public users can upload quiz files" ON storage.objects;

CREATE POLICY "Public users can upload quiz files"
ON storage.objects FOR INSERT
TO public
WITH CHECK (
  bucket_id = 'contact-files'
  AND (storage.foldername(objects.name))[1] = 'quiz-uploads'
  AND EXISTS (
    SELECT 1
    FROM public.quizzes q
    WHERE q.id::text = (storage.foldername(objects.name))[2]
      AND q.is_active = true
      AND q.public_token IS NOT NULL
  )
);
