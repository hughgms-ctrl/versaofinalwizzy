CREATE OR REPLACE FUNCTION public.get_platform_plan_limit(_organization_id uuid, _limit_key text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _limit integer;
BEGIN
  SELECT NULLIF((pp.features->'limits'->>_limit_key), '')::integer
    INTO _limit
  FROM public.organization_plans op
  JOIN public.platform_plans pp ON pp.id = op.plan_id
  WHERE op.organization_id = _organization_id
  LIMIT 1;

  RETURN COALESCE(_limit, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_workspace_plan_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _limit integer;
  _current integer;
BEGIN
  IF NEW.organization_id IS NULL OR NEW.is_active IS FALSE THEN
    RETURN NEW;
  END IF;

  _limit := public.get_platform_plan_limit(NEW.organization_id, 'max_workspaces');
  IF _limit <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)
    INTO _current
  FROM public.workspaces
  WHERE organization_id = NEW.organization_id
    AND is_active IS NOT FALSE
    AND (TG_OP = 'INSERT' OR id <> NEW.id);

  IF _current >= _limit THEN
    RAISE EXCEPTION 'Limite de workspaces atingido neste plano (%/%). Faça upgrade para criar mais workspaces.', _current, _limit
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_workspace_plan_limit_trigger ON public.workspaces;
CREATE TRIGGER enforce_workspace_plan_limit_trigger
BEFORE INSERT OR UPDATE OF organization_id, is_active
ON public.workspaces
FOR EACH ROW
EXECUTE FUNCTION public.enforce_workspace_plan_limit();

CREATE OR REPLACE FUNCTION public.enforce_team_plan_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _limit integer;
  _current integer;
BEGIN
  IF NEW.organization_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(pp.max_team_members, 0)
    INTO _limit
  FROM public.organization_plans op
  JOIN public.platform_plans pp ON pp.id = op.plan_id
  WHERE op.organization_id = NEW.organization_id
  LIMIT 1;

  IF COALESCE(_limit, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)
    INTO _current
  FROM public.profiles
  WHERE organization_id = NEW.organization_id
    AND (TG_OP = 'INSERT' OR id <> NEW.id);

  IF _current >= _limit THEN
    RAISE EXCEPTION 'Limite de usuários atingido neste plano (%/%). Faça upgrade para adicionar mais membros.', _current, _limit
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_team_plan_limit_trigger ON public.profiles;
CREATE TRIGGER enforce_team_plan_limit_trigger
BEFORE INSERT OR UPDATE OF organization_id
ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_team_plan_limit();

CREATE OR REPLACE FUNCTION public.is_configured_whatsapp_instance(
  _status text,
  _phone_number text,
  _zapi_instance_id text,
  _zapi_token text,
  _evolution_instance_name text,
  _evolution_instance_id text,
  _evolution_api_key text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    COALESCE(_status, '') = 'connected'
    OR NULLIF(_phone_number, '') IS NOT NULL
    OR NULLIF(_zapi_instance_id, '') IS NOT NULL
    OR NULLIF(_zapi_token, '') IS NOT NULL
    OR NULLIF(_evolution_instance_name, '') IS NOT NULL
    OR NULLIF(_evolution_instance_id, '') IS NOT NULL
    OR NULLIF(_evolution_api_key, '') IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.enforce_whatsapp_plan_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _limit integer;
  _current integer;
BEGIN
  IF NEW.organization_id IS NULL OR NOT public.is_configured_whatsapp_instance(
    NEW.status::text,
    NEW.phone_number,
    NEW.zapi_instance_id,
    NEW.zapi_token,
    NEW.evolution_instance_name,
    NEW.evolution_instance_id,
    NEW.evolution_api_key
  ) THEN
    RETURN NEW;
  END IF;

  _limit := public.get_platform_plan_limit(NEW.organization_id, 'max_whatsapp_numbers');
  IF _limit <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)
    INTO _current
  FROM public.whatsapp_instances
  WHERE organization_id = NEW.organization_id
    AND public.is_configured_whatsapp_instance(
      status::text,
      phone_number,
      zapi_instance_id,
      zapi_token,
      evolution_instance_name,
      evolution_instance_id,
      evolution_api_key
    )
    AND (TG_OP = 'INSERT' OR id <> NEW.id);

  IF _current >= _limit THEN
    RAISE EXCEPTION 'Limite de números WhatsApp atingido neste plano (%/%). Faça upgrade para conectar mais números.', _current, _limit
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_whatsapp_plan_limit_trigger ON public.whatsapp_instances;
CREATE TRIGGER enforce_whatsapp_plan_limit_trigger
BEFORE INSERT OR UPDATE OF organization_id, status, phone_number, zapi_instance_id, zapi_token, evolution_instance_name, evolution_instance_id, evolution_api_key
ON public.whatsapp_instances
FOR EACH ROW
EXECUTE FUNCTION public.enforce_whatsapp_plan_limit();
