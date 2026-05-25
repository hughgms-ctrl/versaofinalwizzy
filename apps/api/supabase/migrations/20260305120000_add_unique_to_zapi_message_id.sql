-- Add UNIQUE constraint to zapi_message_id in messages table to prevent duplication
DO $$
BEGIN
    -- First, remove any existing duplicates if they exist, keeping the oldest one
    DELETE FROM public.messages
    WHERE id IN (
        SELECT id
        FROM (
            SELECT id,
                   ROW_NUMBER() OVER (PARTITION BY zapi_message_id ORDER BY created_at ASC) as row_num
            FROM public.messages
            WHERE zapi_message_id IS NOT NULL
        ) t
        WHERE t.row_num > 1
    );

    -- Then add the unique constraint
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'messages_zapi_message_id_key'
    ) THEN
        ALTER TABLE public.messages ADD CONSTRAINT messages_zapi_message_id_key UNIQUE (zapi_message_id);
    END IF;
END $$;
