-- 1) Novos campos no template
ALTER TABLE public.case_templates
  ADD COLUMN IF NOT EXISTS default_judicial_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS default_administrative_data jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2) Atualiza a função para copiar os dados padrão do template para o caso
CREATE OR REPLACE FUNCTION public.create_case_from_template(
  _template_id uuid,
  _contact_id uuid,
  _conversation_id uuid,
  _created_by uuid DEFAULT NULL::uuid,
  _override_assignee_id uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _tpl public.case_templates%ROWTYPE;
  _case_id uuid;
  _assignee uuid;
  _status_id uuid;
  _workspace_id uuid;
  _ws_default uuid;
  _contact_name text;
  _contact_phone text;
  _t record;
  _due timestamptz;
  _hh int;
  _mm int;
  _jd jsonb;
  _ad jsonb;
BEGIN
  SELECT * INTO _tpl FROM public.case_templates WHERE id = _template_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- workspace
  SELECT workspace_id INTO _workspace_id FROM public.conversations WHERE id = _conversation_id;
  IF _workspace_id IS NULL THEN
    SELECT workspace_id INTO _workspace_id FROM public.contacts WHERE id = _contact_id;
  END IF;
  IF _workspace_id IS NULL THEN
    _workspace_id := _tpl.workspace_id;
  END IF;

  -- responsável
  _assignee := COALESCE(_override_assignee_id, _tpl.default_assignee_id);
  IF _assignee IS NULL AND _workspace_id IS NOT NULL THEN
    SELECT default_operations_assignee_id INTO _ws_default FROM public.workspaces WHERE id = _workspace_id;
    _assignee := _ws_default;
  END IF;
  IF _assignee IS NULL THEN
    _assignee := _created_by;
  END IF;

  -- status
  _status_id := _tpl.default_status_id;
  IF _status_id IS NULL THEN
    SELECT id INTO _status_id FROM public.case_statuses
    WHERE organization_id = _tpl.organization_id AND is_default = true
    ORDER BY "order" LIMIT 1;
  END IF;

  SELECT name, phone INTO _contact_name, _contact_phone FROM public.contacts WHERE id = _contact_id;

  -- copia dados do resumo (apenas o do tipo correspondente)
  _jd := COALESCE(_tpl.default_judicial_data, '{}'::jsonb);
  _ad := COALESCE(_tpl.default_administrative_data, '{}'::jsonb);

  INSERT INTO public.cases (
    organization_id, workspace_id, contact_id, conversation_id,
    template_id, status_id, assignee_id, created_by,
    kind, category_id, title, priority,
    judicial_data, administrative_data
  ) VALUES (
    _tpl.organization_id, _workspace_id, _contact_id, _conversation_id,
    _tpl.id, _status_id, _assignee, _created_by,
    _tpl.kind, _tpl.category_id,
    COALESCE(_contact_name, _contact_phone, 'Novo caso') || ' — ' || _tpl.name,
    'medium',
    CASE WHEN _tpl.kind = 'judicial' THEN _jd ELSE '{}'::jsonb END,
    CASE WHEN _tpl.kind = 'administrative' THEN _ad ELSE '{}'::jsonb END
  )
  RETURNING id INTO _case_id;

  -- Materializa tarefas
  FOR _t IN
    SELECT * FROM public.case_template_tasks
    WHERE template_id = _template_id
    ORDER BY "order"
  LOOP
    BEGIN
      _hh := COALESCE(NULLIF(split_part(COALESCE(_t.default_time, '09:00'), ':', 1), '')::int, 9);
      _mm := COALESCE(NULLIF(split_part(COALESCE(_t.default_time, '09:00'), ':', 2), '')::int, 0);
    EXCEPTION WHEN others THEN
      _hh := 9; _mm := 0;
    END;

    _due := date_trunc('day', now() + (_t.days_to_due || ' days')::interval)
            + make_interval(hours => _hh, mins => _mm);

    INSERT INTO public.case_tasks (
      case_id, organization_id, title, description, assignee_id,
      due_date, "order", is_mandatory, created_by
    ) VALUES (
      _case_id, _tpl.organization_id, _t.title, _t.description, _assignee,
      _due, _t."order", _t.is_mandatory, _created_by
    );
  END LOOP;

  INSERT INTO public.case_activity_log (case_id, organization_id, actor_id, action, payload)
  VALUES (_case_id, _tpl.organization_id, _created_by, 'case_created',
          jsonb_build_object('template_id', _template_id));

  RETURN _case_id;
END;
$function$;