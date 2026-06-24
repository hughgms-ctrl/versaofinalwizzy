
-- Drive configs table
CREATE TABLE public.drive_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  google_refresh_token text,
  google_access_token text,
  google_email text,
  folder_id text,
  backup_frequency text NOT NULL DEFAULT 'manual',
  last_backup_at timestamptz,
  backup_includes jsonb NOT NULL DEFAULT '{"conversations": true, "tags": true, "notes": true, "pipeline": true, "files": true}'::jsonb,
  is_connected boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id)
);

ALTER TABLE public.drive_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage drive configs" ON public.drive_configs
  FOR ALL TO authenticated
  USING (organization_id = get_user_org_id(auth.uid()) AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin')))
  WITH CHECK (organization_id = get_user_org_id(auth.uid()) AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin')));

CREATE POLICY "Users can view drive configs in their org" ON public.drive_configs
  FOR SELECT TO authenticated
  USING (organization_id = get_user_org_id(auth.uid()));

-- Drive backup logs table
CREATE TABLE public.drive_backup_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  file_count integer DEFAULT 0,
  data_size_bytes bigint DEFAULT 0,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.drive_backup_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage backup logs" ON public.drive_backup_logs
  FOR ALL TO authenticated
  USING (organization_id = get_user_org_id(auth.uid()) AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin')))
  WITH CHECK (organization_id = get_user_org_id(auth.uid()) AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin')));

CREATE POLICY "Users can view backup logs in their org" ON public.drive_backup_logs
  FOR SELECT TO authenticated
  USING (organization_id = get_user_org_id(auth.uid()));

-- Calendar configs table
CREATE TABLE public.calendar_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  google_refresh_token text,
  google_access_token text,
  google_email text,
  calendar_id text DEFAULT 'primary',
  availability_rules jsonb NOT NULL DEFAULT '[{"day":1,"start":"09:00","end":"18:00"},{"day":2,"start":"09:00","end":"18:00"},{"day":3,"start":"09:00","end":"18:00"},{"day":4,"start":"09:00","end":"18:00"},{"day":5,"start":"09:00","end":"18:00"}]'::jsonb,
  meeting_duration_minutes integer NOT NULL DEFAULT 30,
  booking_slug text,
  is_connected boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id),
  UNIQUE(booking_slug)
);

ALTER TABLE public.calendar_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage calendar configs" ON public.calendar_configs
  FOR ALL TO authenticated
  USING (organization_id = get_user_org_id(auth.uid()) AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin')))
  WITH CHECK (organization_id = get_user_org_id(auth.uid()) AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin')));

CREATE POLICY "Users can view calendar configs in their org" ON public.calendar_configs
  FOR SELECT TO authenticated
  USING (organization_id = get_user_org_id(auth.uid()));

-- Calendar bookings table
CREATE TABLE public.calendar_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  google_event_id text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  client_name text,
  client_phone text,
  client_email text,
  internal_summary text,
  status text NOT NULL DEFAULT 'confirmed',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.calendar_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage bookings in their org" ON public.calendar_bookings
  FOR ALL TO authenticated
  USING (organization_id = get_user_org_id(auth.uid()))
  WITH CHECK (organization_id = get_user_org_id(auth.uid()));

CREATE POLICY "Users can view bookings in their org" ON public.calendar_bookings
  FOR SELECT TO authenticated
  USING (organization_id = get_user_org_id(auth.uid()));

-- Triggers for updated_at
CREATE TRIGGER update_drive_configs_updated_at BEFORE UPDATE ON public.drive_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_calendar_configs_updated_at BEFORE UPDATE ON public.calendar_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_calendar_bookings_updated_at BEFORE UPDATE ON public.calendar_bookings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
;
