-- Create storage bucket for flow media assets
INSERT INTO storage.buckets (id, name, public)
VALUES ('flow-media', 'flow-media', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to flow-media bucket
CREATE POLICY "Authenticated users can upload flow media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'flow-media');

-- Allow public read access to flow media
CREATE POLICY "Public read access for flow media"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'flow-media');

-- Allow authenticated users to update their uploads
CREATE POLICY "Authenticated users can update flow media"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'flow-media');

-- Allow authenticated users to delete their uploads
CREATE POLICY "Authenticated users can delete flow media"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'flow-media');