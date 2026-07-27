-- Notification bell / invite flow (src/fluzz/components/notifications/*,
-- InviteMemberDialog.tsx) and PWA install tracking
-- (src/fluzz/hooks/usePushNotifications.ts, usePWAInstall.ts) all query
-- tables that were never created by a migration: notifications,
-- push_subscriptions, pwa_installations.

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  link text,
  data jsonb,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint)
);

CREATE TABLE IF NOT EXISTS public.pwa_installations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  installed_at timestamptz,
  device_info text,
  last_install_reminder_at timestamptz,
  last_profile_reminder_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pwa_installations ENABLE ROW LEVEL SECURITY;

-- Notifications can be created for other users (e.g. workspace invites), but
-- can only be read/updated/deleted by their owner. The inserting user must
-- belong to the target workspace (or the notification is workspace-less).
DROP POLICY IF EXISTS "Wizzy Flow notifications select own" ON public.notifications;
CREATE POLICY "Wizzy Flow notifications select own"
  ON public.notifications
  FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Wizzy Flow notifications insert" ON public.notifications;
CREATE POLICY "Wizzy Flow notifications insert"
  ON public.notifications
  FOR INSERT
  WITH CHECK (
    workspace_id IS NULL
    OR public.user_has_workspace_access(auth.uid(), workspace_id)
  );

DROP POLICY IF EXISTS "Wizzy Flow notifications update own" ON public.notifications;
CREATE POLICY "Wizzy Flow notifications update own"
  ON public.notifications
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Wizzy Flow notifications delete own" ON public.notifications;
CREATE POLICY "Wizzy Flow notifications delete own"
  ON public.notifications
  FOR DELETE
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Wizzy Flow push subscriptions own" ON public.push_subscriptions;
CREATE POLICY "Wizzy Flow push subscriptions own"
  ON public.push_subscriptions
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Wizzy Flow pwa installations own" ON public.pwa_installations;
CREATE POLICY "Wizzy Flow pwa installations own"
  ON public.pwa_installations
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP TRIGGER IF EXISTS update_notifications_updated_at ON public.notifications;
CREATE TRIGGER update_notifications_updated_at
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_push_subscriptions_updated_at ON public.push_subscriptions;
CREATE TRIGGER update_push_subscriptions_updated_at
  BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_pwa_installations_updated_at ON public.pwa_installations;
CREATE TRIGGER update_pwa_installations_updated_at
  BEFORE UPDATE ON public.pwa_installations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications(user_id, created_at DESC);

NOTIFY pgrst, 'reload schema';
