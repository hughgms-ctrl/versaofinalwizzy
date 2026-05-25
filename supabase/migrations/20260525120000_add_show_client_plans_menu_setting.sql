INSERT INTO public.platform_settings (key, value)
VALUES ('show_client_plans_menu', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;
