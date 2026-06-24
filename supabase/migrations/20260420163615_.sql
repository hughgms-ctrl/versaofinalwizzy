-- =====================================================
-- PAINEL OPERACIONAL JURÍDICO — ESTRUTURA COMPLETA
-- =====================================================

-- 0. Adicionar campo em workspaces
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS default_operations_assignee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 0.1 Adicionar permissão
ALTER TABLE public.user_permissions
  ADD COLUMN IF NOT EXISTS can_access_operations boolean NOT NULL DEFAULT false;

-- =====================================================
-- 1. case_categories
-- =====================================================
CREATE TABLE IF NOT EXISTS public.case_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('judicial','administrative')),
  name text NOT NULL,
  slug text NOT NULL,
  icon text,
  color text DEFAULT '#6366f1',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, kind, slug)
);
CREATE INDEX IF NOT EXISTS idx_case_categories_org ON public.case_categories(organization_id);

ALTER TABLE public.case_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "case_categories_org_access" ON public.case_categories
  FOR ALL TO authenticated
  USING (organization_id = public.get_user_org_id(auth.uid()))
  WITH CHECK (organization_id = public.get_user_org_id(auth.uid()));

CREATE TRIGGER trg_case_categories_updated
  BEFORE UPDATE ON public.case_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- 2. case_statuses
-- =====================================================
CREATE TABLE IF NOT EXISTS public.case_statuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#6366f1',
  "order" integer NOT NULL DEFAULT 0,
  is_default boolean NOT NULL DEFAULT false,
  is_closed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_case_statuses_org ON public.case_statuses(organization_id);

ALTER TABLE public.case_statuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "case_statuses_org_access" ON public.case_statuses
  FOR ALL TO authenticated
  USING (organization_id = public.get_user_org_id(auth.uid()))
  WITH CHECK (organization_id = public.get_user_org_id(auth.uid()));

CREATE TRIGGER trg_case_statuses_updated
  BEFORE UPDATE ON public.case_statuses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- 3. case_templates
-- =====================================================
CREATE TABLE IF NOT EXISTS public.case_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  kind text NOT NULL CHECK (kind IN ('judicial','administrative')),
  category_id uuid REFERENCES public.case_categories(id) ON DELETE SET NULL,
  default_assignee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  default_status_id uuid REFERENCES public.case_statuses(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_case_templates_org ON public.case_templates(organization_id);

ALTER TABLE public.case_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "case_templates_org_access" ON public.case_templates
  FOR ALL TO authenticated
  USING (organization_id = public.get_user_org_id(auth.uid()))
  WITH CHECK (organization_id = public.get_user_org_id(auth.uid()));

CREATE TRIGGER trg_case_templates_updated
  BEFORE UPDATE ON public.case_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- 4. case_template_tasks
-- =====================================================
CREATE TABLE IF NOT EXISTS public.case_template_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.case_templates(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  days_to_due integer NOT NULL DEFAULT 7,
  "order" integer NOT NULL DEFAULT 0,
  is_mandatory boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_case_template_tasks_template ON public.case_template_tasks(template_id);

ALTER TABLE public.case_template_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "case_template_tasks_org_access" ON public.case_template_tasks
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.case_templates t
                 WHERE t.id = template_id AND t.organization_id = public.get_user_org_id(auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.case_templates t
                      WHERE t.id = template_id AND t.organization_id = public.get_user_org_id(auth.uid())));

-- =====================================================
-- 5. case_triggers
-- =====================================================
CREATE TABLE IF NOT EXISTS public.case_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  pipeline_id uuid NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  column_id uuid NOT NULL REFERENCES public.pipeline_columns(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.case_templates(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(column_id, template_id)
);
CREATE INDEX IF NOT EXISTS idx_case_triggers_column ON public.case_triggers(column_id) WHERE is_active = true;

ALTER TABLE public.case_triggers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "case_triggers_org_access" ON public.case_triggers
  FOR ALL TO authenticated
  USING (organization_id = public.get_user_org_id(auth.uid()))
  WITH CHECK (organization_id = public.get_user_org_id(auth.uid()));

CREATE TRIGGER trg_case_triggers_updated
  BEFORE UPDATE ON public.case_triggers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- 6. cases
-- =====================================================
CREATE TABLE IF NOT EXISTS public.cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  template_id uuid REFERENCES public.case_templates(id) ON DELETE SET NULL,
  status_id uuid REFERENCES public.case_statuses(id) ON DELETE SET NULL,
  assignee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('judicial','administrative')),
  category_id uuid REFERENCES public.case_categories(id) ON DELETE SET NULL,
  title text NOT NULL,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  judicial_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  administrative_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cases_org ON public.cases(organization_id);
CREATE INDEX IF NOT EXISTS idx_cases_workspace ON public.cases(workspace_id);
CREATE INDEX IF NOT EXISTS idx_cases_status ON public.cases(status_id);
CREATE INDEX IF NOT EXISTS idx_cases_assignee ON public.cases(assignee_id);
CREATE INDEX IF NOT EXISTS idx_cases_contact ON public.cases(contact_id);

ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cases_admin_full_access" ON public.cases
  FOR ALL TO authenticated
  USING (
    organization_id = public.get_user_org_id(auth.uid())
    AND (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'))
  )
  WITH CHECK (
    organization_id = public.get_user_org_id(auth.uid())
    AND (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'))
  );

CREATE POLICY "cases_member_workspace_access" ON public.cases
  FOR ALL TO authenticated
  USING (
    organization_id = public.get_user_org_id(auth.uid())
    AND (workspace_id IS NULL OR public.user_has_workspace_access(auth.uid(), workspace_id))
  )
  WITH CHECK (
    organization_id = public.get_user_org_id(auth.uid())
    AND (workspace_id IS NULL OR public.user_has_workspace_access(auth.uid(), workspace_id))
  );

CREATE TRIGGER trg_cases_updated
  BEFORE UPDATE ON public.cases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- 7. case_tasks
-- =====================================================
CREATE TABLE IF NOT EXISTS public.case_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  assignee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  due_date timestamptz,
  completed_at timestamptz,
  completed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  "order" integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','doing','done','blocked')),
  is_mandatory boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_case_tasks_case ON public.case_tasks(case_id);
CREATE INDEX IF NOT EXISTS idx_case_tasks_assignee ON public.case_tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_case_tasks_due ON public.case_tasks(due_date) WHERE completed_at IS NULL;

ALTER TABLE public.case_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "case_tasks_org_access" ON public.case_tasks
  FOR ALL TO authenticated
  USING (
    organization_id = public.get_user_org_id(auth.uid())
    AND EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id
                AND (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin')
                     OR c.workspace_id IS NULL OR public.user_has_workspace_access(auth.uid(), c.workspace_id)))
  )
  WITH CHECK (organization_id = public.get_user_org_id(auth.uid()));

CREATE TRIGGER trg_case_tasks_updated
  BEFORE UPDATE ON public.case_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- 8. case_deadlines
-- =====================================================
CREATE TABLE IF NOT EXISTS public.case_deadlines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  due_date timestamptz NOT NULL,
  is_fatal boolean NOT NULL DEFAULT false,
  notify_days_before integer NOT NULL DEFAULT 3,
  completed_at timestamptz,
  completed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_case_deadlines_case ON public.case_deadlines(case_id);
CREATE INDEX IF NOT EXISTS idx_case_deadlines_due ON public.case_deadlines(due_date) WHERE completed_at IS NULL;

ALTER TABLE public.case_deadlines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "case_deadlines_org_access" ON public.case_deadlines
  FOR ALL TO authenticated
  USING (organization_id = public.get_user_org_id(auth.uid()))
  WITH CHECK (organization_id = public.get_user_org_id(auth.uid()));

CREATE TRIGGER trg_case_deadlines_updated
  BEFORE UPDATE ON public.case_deadlines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- 9. case_activity_log
-- =====================================================
CREATE TABLE IF NOT EXISTS public.case_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_case_activity_case ON public.case_activity_log(case_id, created_at DESC);

ALTER TABLE public.case_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "case_activity_select" ON public.case_activity_log
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "case_activity_insert" ON public.case_activity_log
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_org_id(auth.uid()));

-- =====================================================
-- 10. SEED DEFAULTS por organização
-- =====================================================
CREATE OR REPLACE FUNCTION public.seed_operations_defaults(_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Status padrão
  INSERT INTO public.case_statuses (organization_id, name, color, "order", is_default, is_closed)
  SELECT _org_id, x.name, x.color, x.ord, x.def, x.closed
  FROM (VALUES
    ('A fazer',           '#94a3b8', 0, true,  false),
    ('Em andamento',      '#3b82f6', 1, false, false),
    ('Aguardando cliente','#f59e0b', 2, false, false),
    ('Concluído',         '#10b981', 3, false, true)
  ) AS x(name, color, ord, def, closed)
  WHERE NOT EXISTS (SELECT 1 FROM public.case_statuses WHERE organization_id = _org_id);

  -- Categorias judiciais
  INSERT INTO public.case_categories (organization_id, kind, name, slug, icon, color)
  SELECT _org_id, 'judicial', x.name, x.slug, x.icon, x.color
  FROM (VALUES
    ('Trabalhista',     'trabalhista',     'Scale',    '#3b82f6'),
    ('Cível',           'civel',           'Scale',    '#8b5cf6'),
    ('Previdenciário',  'previdenciario',  'Scale',    '#06b6d4'),
    ('Tributário',      'tributario',      'Scale',    '#f59e0b'),
    ('Família',         'familia',         'Scale',    '#ec4899'),
    ('Criminal',        'criminal',        'Scale',    '#ef4444')
  ) AS x(name, slug, icon, color)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.case_categories
    WHERE organization_id = _org_id AND kind = 'judicial' AND slug = x.slug
  );

  -- Categorias administrativas
  INSERT INTO public.case_categories (organization_id, kind, name, slug, icon, color)
  SELECT _org_id, 'administrative', x.name, x.slug, x.icon, x.color
  FROM (VALUES
    ('INSS',                  'inss',                  'Building2', '#10b981'),
    ('Receita Federal',       'receita-federal',       'Building2', '#f59e0b'),
    ('Detran',                'detran',                'Building2', '#3b82f6'),
    ('Prefeitura',            'prefeitura',            'Building2', '#8b5cf6'),
    ('Recurso Administrativo','recurso-administrativo','Building2', '#06b6d4')
  ) AS x(name, slug, icon, color)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.case_categories
    WHERE organization_id = _org_id AND kind = 'administrative' AND slug = x.slug
  );
END;
$$;

-- Roda seed para organizações existentes
DO $$
DECLARE
  _org record;
BEGIN
  FOR _org IN SELECT id FROM public.organizations LOOP
    PERFORM public.seed_operations_defaults(_org.id);
  END LOOP;
END $$;

-- Trigger para novas organizações
CREATE OR REPLACE FUNCTION public.trg_seed_operations_on_new_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.seed_operations_defaults(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_operations_after_org_insert ON public.organizations;
CREATE TRIGGER trg_seed_operations_after_org_insert
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.trg_seed_operations_on_new_org();

-- =====================================================
-- 11. create_case_from_template()
-- =====================================================
CREATE OR REPLACE FUNCTION public.create_case_from_template(
  _template_id uuid,
  _contact_id uuid,
  _conversation_id uuid,
  _created_by uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tpl public.case_templates%ROWTYPE;
  _case_id uuid;
  _assignee uuid;
  _status_id uuid;
  _workspace_id uuid;
  _ws_default uuid;
  _contact_name text;
  _contact_phone text;
BEGIN
  SELECT * INTO _tpl FROM public.case_templates WHERE id = _template_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- workspace: do conversation > contact > template
  SELECT workspace_id INTO _workspace_id FROM public.conversations WHERE id = _conversation_id;
  IF _workspace_id IS NULL THEN
    SELECT workspace_id INTO _workspace_id FROM public.contacts WHERE id = _contact_id;
  END IF;
  IF _workspace_id IS NULL THEN
    _workspace_id := _tpl.workspace_id;
  END IF;

  -- responsável: template > workspace default > criador
  _assignee := _tpl.default_assignee_id;
  IF _assignee IS NULL AND _workspace_id IS NOT NULL THEN
    SELECT default_operations_assignee_id INTO _ws_default FROM public.workspaces WHERE id = _workspace_id;
    _assignee := _ws_default;
  END IF;
  IF _assignee IS NULL THEN
    _assignee := _created_by;
  END IF;

  -- status: template > status default da org
  _status_id := _tpl.default_status_id;
  IF _status_id IS NULL THEN
    SELECT id INTO _status_id FROM public.case_statuses
    WHERE organization_id = _tpl.organization_id AND is_default = true
    ORDER BY "order" LIMIT 1;
  END IF;

  -- título
  SELECT name, phone INTO _contact_name, _contact_phone FROM public.contacts WHERE id = _contact_id;

  INSERT INTO public.cases (
    organization_id, workspace_id, contact_id, conversation_id,
    template_id, status_id, assignee_id, created_by,
    kind, category_id, title, priority
  ) VALUES (
    _tpl.organization_id, _workspace_id, _contact_id, _conversation_id,
    _tpl.id, _status_id, _assignee, _created_by,
    _tpl.kind, _tpl.category_id,
    COALESCE(_contact_name, _contact_phone, 'Novo caso') || ' — ' || _tpl.name,
    'medium'
  )
  RETURNING id INTO _case_id;

  -- Materializa tarefas
  INSERT INTO public.case_tasks (
    case_id, organization_id, title, description, assignee_id,
    due_date, "order", is_mandatory, created_by
  )
  SELECT
    _case_id, _tpl.organization_id, t.title, t.description, _assignee,
    now() + (t.days_to_due || ' days')::interval, t."order", t.is_mandatory, _created_by
  FROM public.case_template_tasks t
  WHERE t.template_id = _template_id
  ORDER BY t."order";

  -- Log
  INSERT INTO public.case_activity_log (case_id, organization_id, actor_id, action, payload)
  VALUES (_case_id, _tpl.organization_id, _created_by, 'case_created',
          jsonb_build_object('template_id', _template_id, 'source', 'pipeline_trigger'));

  RETURN _case_id;
END;
$$;

-- =====================================================
-- 12. Trigger: pipeline → caso
-- =====================================================
CREATE OR REPLACE FUNCTION public.trg_case_from_pipeline_move()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _trigger record;
  _conv record;
  _existing uuid;
BEGIN
  -- Só age quando muda de coluna (ou insere novo)
  IF TG_OP = 'UPDATE' AND NEW.column_id = OLD.column_id THEN
    RETURN NEW;
  END IF;

  SELECT contact_id, organization_id INTO _conv
  FROM public.conversations WHERE id = NEW.conversation_id;

  IF _conv.contact_id IS NULL THEN RETURN NEW; END IF;

  FOR _trigger IN
    SELECT t.template_id
    FROM public.case_triggers t
    WHERE t.column_id = NEW.column_id AND t.is_active = true
  LOOP
    -- Evita duplicatas: já existe caso aberto desse template para esse contato?
    SELECT id INTO _existing FROM public.cases
    WHERE template_id = _trigger.template_id
      AND contact_id = _conv.contact_id
      AND closed_at IS NULL
    LIMIT 1;

    IF _existing IS NULL THEN
      PERFORM public.create_case_from_template(
        _trigger.template_id,
        _conv.contact_id,
        NEW.conversation_id,
        NULL
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_case_from_pipeline_move ON public.conversation_pipeline_positions;
CREATE TRIGGER trg_case_from_pipeline_move
  AFTER INSERT OR UPDATE ON public.conversation_pipeline_positions
  FOR EACH ROW EXECUTE FUNCTION public.trg_case_from_pipeline_move();

-- =====================================================
-- 13. Auto-set closed_at quando status_id é "closed"
-- =====================================================
CREATE OR REPLACE FUNCTION public.trg_cases_auto_close()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _is_closed boolean;
BEGIN
  IF NEW.status_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.status_id IS DISTINCT FROM OLD.status_id) THEN
    SELECT is_closed INTO _is_closed FROM public.case_statuses WHERE id = NEW.status_id;
    IF _is_closed THEN
      NEW.closed_at := COALESCE(NEW.closed_at, now());
    ELSE
      NEW.closed_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cases_auto_close ON public.cases;
CREATE TRIGGER trg_cases_auto_close
  BEFORE INSERT OR UPDATE OF status_id ON public.cases
  FOR EACH ROW EXECUTE FUNCTION public.trg_cases_auto_close();;
