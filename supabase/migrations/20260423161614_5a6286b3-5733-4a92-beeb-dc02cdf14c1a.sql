-- 1) Base de Conhecimento da Empresa
CREATE TABLE public.organization_knowledge (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_name text,
  website text,
  phone text,
  email text,
  address text,
  hours text,
  payment_methods text,
  tone_of_voice text,
  differentials text,
  about text,
  faqs jsonb NOT NULL DEFAULT '[]'::jsonb,
  custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.organization_knowledge ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their organization knowledge"
ON public.organization_knowledge FOR SELECT
USING (public.user_belongs_to_org(auth.uid(), organization_id));

CREATE POLICY "Admins/Owners can insert organization knowledge"
ON public.organization_knowledge FOR INSERT
WITH CHECK (
  public.user_belongs_to_org(auth.uid(), organization_id)
  AND (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'))
);

CREATE POLICY "Admins/Owners can update organization knowledge"
ON public.organization_knowledge FOR UPDATE
USING (
  public.user_belongs_to_org(auth.uid(), organization_id)
  AND (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'))
);

CREATE POLICY "Admins/Owners can delete organization knowledge"
ON public.organization_knowledge FOR DELETE
USING (
  public.user_belongs_to_org(auth.uid(), organization_id)
  AND (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'))
);

CREATE TRIGGER trg_org_knowledge_updated_at
BEFORE UPDATE ON public.organization_knowledge
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Pacotes da plataforma (catálogo mantido pelo admin)
CREATE TABLE public.platform_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('area','objective')),
  parent_package_id uuid REFERENCES public.platform_packages(id) ON DELETE SET NULL,
  name text NOT NULL,
  slug text NOT NULL,
  icon text,
  color text,
  description text,
  master_prompt text,
  agents_template jsonb NOT NULL DEFAULT '[]'::jsonb,
  flows_template jsonb NOT NULL DEFAULT '[]'::jsonb,
  tags_template jsonb NOT NULL DEFAULT '[]'::jsonb,
  pipeline_template jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_published boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(kind, slug)
);

CREATE INDEX idx_platform_packages_kind ON public.platform_packages(kind);
CREATE INDEX idx_platform_packages_parent ON public.platform_packages(parent_package_id);
CREATE INDEX idx_platform_packages_published ON public.platform_packages(is_published) WHERE is_published = true;

ALTER TABLE public.platform_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view published packages"
ON public.platform_packages FOR SELECT
USING (
  is_published = true
  OR public.is_platform_admin(auth.uid())
);

CREATE POLICY "Platform admins can insert packages"
ON public.platform_packages FOR INSERT
WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "Platform admins can update packages"
ON public.platform_packages FOR UPDATE
USING (public.is_platform_admin(auth.uid()));

CREATE POLICY "Platform admins can delete packages"
ON public.platform_packages FOR DELETE
USING (public.is_platform_admin(auth.uid()));

CREATE TRIGGER trg_platform_packages_updated_at
BEFORE UPDATE ON public.platform_packages
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Pacotes ativados por organização
CREATE TABLE public.activated_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  package_id uuid NOT NULL REFERENCES public.platform_packages(id) ON DELETE CASCADE,
  activated_version integer NOT NULL DEFAULT 1,
  activated_at timestamptz NOT NULL DEFAULT now(),
  activated_by uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(organization_id, package_id)
);

CREATE INDEX idx_activated_packages_org ON public.activated_packages(organization_id);

ALTER TABLE public.activated_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view activated packages"
ON public.activated_packages FOR SELECT
USING (
  public.user_belongs_to_org(auth.uid(), organization_id)
  OR public.is_platform_admin(auth.uid())
);

CREATE POLICY "Admins/Owners can insert activated packages"
ON public.activated_packages FOR INSERT
WITH CHECK (
  public.user_belongs_to_org(auth.uid(), organization_id)
  AND (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'))
);

CREATE POLICY "Admins/Owners can update activated packages"
ON public.activated_packages FOR UPDATE
USING (
  public.user_belongs_to_org(auth.uid(), organization_id)
  AND (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'))
);

CREATE POLICY "Admins/Owners can delete activated packages"
ON public.activated_packages FOR DELETE
USING (
  public.user_belongs_to_org(auth.uid(), organization_id)
  AND (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'))
);

-- 4) Marca de onboarding na organização
ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS onboarded_at timestamptz;