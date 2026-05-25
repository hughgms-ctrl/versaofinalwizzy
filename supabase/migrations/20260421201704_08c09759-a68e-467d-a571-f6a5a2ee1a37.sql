
-- Bucket público para fotos de perfil dos contatos
INSERT INTO storage.buckets (id, name, public)
VALUES ('contact-avatars', 'contact-avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Políticas: leitura pública, escrita apenas pelo service role
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='storage' AND tablename='objects' 
      AND policyname='Public read contact-avatars'
  ) THEN
    CREATE POLICY "Public read contact-avatars"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'contact-avatars');
  END IF;
END $$;
