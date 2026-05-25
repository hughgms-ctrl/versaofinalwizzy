-- Create storage bucket for chat media
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-media',
  'chat-media',
  true,
  16777216, -- 16MB limit
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'audio/ogg', 'audio/mpeg', 'audio/webm', 'audio/mp4', 'audio/wav', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain', 'text/csv']
);

-- Policy: Anyone can view files (public bucket)
CREATE POLICY "Public read access for chat media"
ON storage.objects
FOR SELECT
USING (bucket_id = 'chat-media');

-- Policy: Authenticated users can upload files to their org folder
CREATE POLICY "Users can upload chat media"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'chat-media' AND
  auth.role() = 'authenticated'
);

-- Policy: Users can delete their uploads
CREATE POLICY "Users can delete their chat media"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'chat-media' AND
  auth.role() = 'authenticated'
);