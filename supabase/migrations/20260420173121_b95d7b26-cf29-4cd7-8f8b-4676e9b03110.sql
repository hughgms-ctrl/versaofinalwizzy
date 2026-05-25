
-- 1) Coluna phone em profiles (se não existir)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text;

-- 2) Tabela de configuração de notificações por tarefa de template
CREATE TABLE IF NOT EXISTS public.case_task_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  template_task_id uuid REFERENCES public.case_template_tasks(id) ON DELETE CASCADE,
  case_task_id uuid REFERENCES public.case_tasks(id) ON DELETE CASCADE,
  notify_on_create boolean NOT NULL DEFAULT true,
  notify_days_before integer NOT NULL DEFAULT 1,
  notify_on_overdue boolean NOT NULL DEFAULT true,
  notify_channel text NOT NULL DEFAULT 'whatsapp',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT case_task_notifications_target_check CHECK (
    (template_task_id IS NOT NULL AND case_task_id IS NULL) OR
    (template_task_id IS NULL AND case_task_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_case_task_notifications_template_task ON public.case_task_notifications(template_task_id);
CREATE INDEX IF NOT EXISTS idx_case_task_notifications_case_task ON public.case_task_notifications(case_task_id);
CREATE INDEX IF NOT EXISTS idx_case_task_notifications_org ON public.case_task_notifications(organization_id);

ALTER TABLE public.case_task_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view task notifications"
  ON public.case_task_notifications FOR SELECT
  USING (user_belongs_to_org(auth.uid(), organization_id));

CREATE POLICY "Org members can insert task notifications"
  ON public.case_task_notifications FOR INSERT
  WITH CHECK (user_belongs_to_org(auth.uid(), organization_id));

CREATE POLICY "Org members can update task notifications"
  ON public.case_task_notifications FOR UPDATE
  USING (user_belongs_to_org(auth.uid(), organization_id));

CREATE POLICY "Org members can delete task notifications"
  ON public.case_task_notifications FOR DELETE
  USING (user_belongs_to_org(auth.uid(), organization_id));

CREATE TRIGGER update_case_task_notifications_updated_at
  BEFORE UPDATE ON public.case_task_notifications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Função para copiar config de notificação do template-task ao criar a case_task
CREATE OR REPLACE FUNCTION public.copy_task_notifications_from_template()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _template_task_id uuid;
  _notif record;
BEGIN
  -- Busca o template_task correspondente (mesmo título e ordem)
  SELECT t.id INTO _template_task_id
  FROM public.case_template_tasks t
  JOIN public.cases c ON c.template_id = t.template_id
  WHERE c.id = NEW.case_id
    AND t.title = NEW.title
    AND t."order" = NEW."order"
  LIMIT 1;

  IF _template_task_id IS NOT NULL THEN
    FOR _notif IN
      SELECT * FROM public.case_task_notifications WHERE template_task_id = _template_task_id
    LOOP
      INSERT INTO public.case_task_notifications (
        organization_id, case_task_id,
        notify_on_create, notify_days_before, notify_on_overdue, notify_channel
      ) VALUES (
        _notif.organization_id, NEW.id,
        _notif.notify_on_create, _notif.notify_days_before, _notif.notify_on_overdue, _notif.notify_channel
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_copy_task_notifications ON public.case_tasks;
CREATE TRIGGER trg_copy_task_notifications
  AFTER INSERT ON public.case_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.copy_task_notifications_from_template();
