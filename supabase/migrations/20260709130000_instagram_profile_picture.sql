-- Store the connected Instagram account's display name and profile picture,
-- so the "Connected account" UI can show them — Meta's App Review for
-- instagram_business_basic explicitly asks to see profile info (username,
-- profile picture) displayed inside the app after connecting.

ALTER TABLE public.instagram_accounts
  ADD COLUMN IF NOT EXISTS ig_name TEXT,
  ADD COLUMN IF NOT EXISTS ig_profile_pic_url TEXT;
