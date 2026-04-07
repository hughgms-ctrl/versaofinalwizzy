UPDATE public.platform_plans SET 
  price_yearly = 970, 
  allowed_modules = '["conversations","pipeline","contacts","flows","documents","widgets","settings","team"]'::jsonb 
WHERE slug = 'basic';

UPDATE public.platform_plans SET 
  price_yearly = 1970, 
  allowed_modules = '["conversations","pipeline","contacts","flows","documents","widgets","settings","team","agents","reports","campaigns","calendar","scheduled","integrations"]'::jsonb 
WHERE slug = 'pro';

UPDATE public.platform_plans SET 
  price_yearly = 4970, 
  allowed_modules = '["conversations","pipeline","contacts","flows","documents","widgets","settings","team","agents","reports","campaigns","calendar","scheduled","integrations","orchestrator"]'::jsonb 
WHERE slug = 'enterprise';