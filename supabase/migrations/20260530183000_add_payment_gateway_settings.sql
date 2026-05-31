INSERT INTO public.platform_settings (key, value)
VALUES (
  'payment_gateway_strategy',
  '{
    "active_provider": "asaas",
    "asaas_enabled": true,
    "stripe_enabled": false,
    "test_mode": true
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.platform_settings (key, value)
VALUES (
  'payment_gateway_connection_settings',
  '{
    "asaas_base_url": "https://sandbox.asaas.com/api/v3",
    "asaas_api_key": "",
    "asaas_webhook_token": "",
    "stripe_secret_key": "",
    "stripe_publishable_key": "",
    "stripe_webhook_secret": "",
    "checkout_success_url": "",
    "checkout_cancel_url": ""
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;
