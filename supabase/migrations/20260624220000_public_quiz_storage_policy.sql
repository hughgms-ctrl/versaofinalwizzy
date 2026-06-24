-- Allow public anonymous uploads to contact-files storage bucket under quiz-uploads/ directory
CREATE POLICY "Public users can upload quiz files"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'contact-files' AND name LIKE 'quiz-uploads/%');
