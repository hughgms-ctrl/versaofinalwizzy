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
    OR NULLIF(_phone_number, '') IS NOT NULL;
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
  IF NEW.organization_id IS NULL OR NOT (
    COALESCE(NEW.status::text, '') = 'connected'
    OR COALESCE(NEW.is_active, false)
    OR NEW.connected_at IS NOT NULL
    OR NULLIF(NEW.phone_number, '') IS NOT NULL
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
    AND (
      COALESCE(status::text, '') = 'connected'
      OR COALESCE(is_active, false)
      OR connected_at IS NOT NULL
      OR NULLIF(phone_number, '') IS NOT NULL
    )
    AND (TG_OP = 'INSERT' OR id <> NEW.id);

  IF _current >= _limit THEN
    RAISE EXCEPTION 'Limite de numeros WhatsApp atingido neste plano (%/%). Faca upgrade para conectar mais numeros.', _current, _limit
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_whatsapp_plan_limit_trigger ON public.whatsapp_instances;
CREATE TRIGGER enforce_whatsapp_plan_limit_trigger
BEFORE INSERT OR UPDATE OF organization_id, status, phone_number, is_active, connected_at
ON public.whatsapp_instances
FOR EACH ROW
EXECUTE FUNCTION public.enforce_whatsapp_plan_limit();
