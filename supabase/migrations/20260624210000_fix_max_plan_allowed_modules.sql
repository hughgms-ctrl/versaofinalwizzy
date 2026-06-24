-- Fix: plano Max estava com allowed_modules incompleto (apenas ferramentas extras).
-- A migration 20260531120000 sobrescreveu os módulos CRM via ON CONFLICT DO UPDATE.
-- Este script restaura o conjunto completo de módulos para o plano Max.

UPDATE public.platform_plans
SET
  allowed_modules = '[
    "crm",
    "dashboard",
    "conversations",
    "contacts",
    "groups",
    "calendar",
    "pipeline",
    "flows",
    "campaigns",
    "scheduled",
    "agents",
    "reports",
    "integrations",
    "settings",
    "team",
    "orchestrator",
    "ai",
    "tools",
    "documents",
    "widgets",
    "quiz",
    "wizzy_flow",
    "carousel",
    "cnis"
  ]'::jsonb,
  updated_at = now()
WHERE slug = 'max';
