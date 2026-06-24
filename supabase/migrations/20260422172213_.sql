UPDATE storage.buckets
SET 
  file_size_limit = 104857600, -- 100MB
  allowed_mime_types = ARRAY[
    -- Images
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 
    'image/heic', 'image/heif', 'image/svg+xml', 'image/bmp', 'image/tiff',
    -- Audio
    'audio/ogg', 'audio/mpeg', 'audio/mp3', 'audio/webm', 'audio/mp4', 
    'audio/wav', 'audio/x-wav', 'audio/aac', 'audio/x-m4a', 'audio/m4a',
    'audio/opus', 'audio/flac',
    -- Video
    'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo',
    'video/x-matroska', 'video/3gpp', 'video/mpeg',
    -- Documents
    'application/pdf', 
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip', 'application/x-zip-compressed',
    'application/x-rar-compressed', 'application/vnd.rar',
    'application/json', 'application/xml',
    -- Text
    'text/plain', 'text/csv', 'text/html', 'text/xml',
    -- Generic fallback
    'application/octet-stream'
  ]
WHERE id = 'chat-media';;
