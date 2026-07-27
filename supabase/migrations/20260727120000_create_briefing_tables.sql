-- Briefings/Debriefings feature (src/fluzz/pages/BriefingRepository.tsx,
-- BriefingDocument.tsx, src/fluzz/components/briefing/*) queries briefings,
-- debriefings, debriefing_extras and debriefing_vendedores, none of which
-- were ever created by a migration.

CREATE TABLE IF NOT EXISTS public.briefings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  data date NOT NULL,
  local text NOT NULL,
  participantes_pagantes integer NOT NULL,
  investimento_trafego numeric NOT NULL,
  currency text NOT NULL DEFAULT 'BRL',
  precos jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.debriefings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  briefing_id uuid NOT NULL REFERENCES public.briefings(id) ON DELETE CASCADE,
  total_participantes integer NOT NULL,
  leads integer NOT NULL,
  vendas_ingressos integer NOT NULL,
  retorno_vendas_ingressos numeric NOT NULL,
  mentorias_vendidas integer NOT NULL,
  valor_vendas_mentorias numeric NOT NULL,
  participantes_outras_estrategias integer NOT NULL,
  valor_outras_estrategias numeric NOT NULL,
  investimento_trafego numeric NOT NULL,
  currency text NOT NULL DEFAULT 'BRL',
  observacoes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.debriefing_extras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debriefing_id uuid NOT NULL REFERENCES public.debriefings(id) ON DELETE CASCADE,
  nome text NOT NULL,
  tipo text NOT NULL,
  valor numeric NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.debriefing_vendedores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debriefing_id uuid NOT NULL REFERENCES public.debriefings(id) ON DELETE CASCADE,
  vendedor_nome text NOT NULL,
  leads_recebidos integer NOT NULL,
  vendas_realizadas integer NOT NULL,
  vendas_outras_estrategias integer DEFAULT 0,
  ingressos_gratuitos integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.briefings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debriefings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debriefing_extras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debriefing_vendedores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Wizzy Flow workspace briefings access" ON public.briefings;
CREATE POLICY "Wizzy Flow workspace briefings access"
  ON public.briefings
  FOR ALL
  USING (
    (workspace_id IS NOT NULL AND public.user_has_workspace_access(auth.uid(), workspace_id))
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = briefings.project_id
        AND p.workspace_id IS NOT NULL
        AND public.user_has_workspace_access(auth.uid(), p.workspace_id)
    )
  )
  WITH CHECK (
    (workspace_id IS NOT NULL AND public.user_has_workspace_access(auth.uid(), workspace_id))
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = briefings.project_id
        AND p.workspace_id IS NOT NULL
        AND public.user_has_workspace_access(auth.uid(), p.workspace_id)
    )
  );

DROP POLICY IF EXISTS "Wizzy Flow workspace debriefings access" ON public.debriefings;
CREATE POLICY "Wizzy Flow workspace debriefings access"
  ON public.debriefings
  FOR ALL
  USING (
    (workspace_id IS NOT NULL AND public.user_has_workspace_access(auth.uid(), workspace_id))
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = debriefings.project_id
        AND p.workspace_id IS NOT NULL
        AND public.user_has_workspace_access(auth.uid(), p.workspace_id)
    )
  )
  WITH CHECK (
    (workspace_id IS NOT NULL AND public.user_has_workspace_access(auth.uid(), workspace_id))
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = debriefings.project_id
        AND p.workspace_id IS NOT NULL
        AND public.user_has_workspace_access(auth.uid(), p.workspace_id)
    )
  );

DROP POLICY IF EXISTS "Wizzy Flow debriefing extras access" ON public.debriefing_extras;
CREATE POLICY "Wizzy Flow debriefing extras access"
  ON public.debriefing_extras
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.debriefings d
      WHERE d.id = debriefing_extras.debriefing_id
        AND (
          (d.workspace_id IS NOT NULL AND public.user_has_workspace_access(auth.uid(), d.workspace_id))
          OR EXISTS (
            SELECT 1 FROM public.projects p
            WHERE p.id = d.project_id
              AND p.workspace_id IS NOT NULL
              AND public.user_has_workspace_access(auth.uid(), p.workspace_id)
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.debriefings d
      WHERE d.id = debriefing_extras.debriefing_id
        AND (
          (d.workspace_id IS NOT NULL AND public.user_has_workspace_access(auth.uid(), d.workspace_id))
          OR EXISTS (
            SELECT 1 FROM public.projects p
            WHERE p.id = d.project_id
              AND p.workspace_id IS NOT NULL
              AND public.user_has_workspace_access(auth.uid(), p.workspace_id)
          )
        )
    )
  );

DROP POLICY IF EXISTS "Wizzy Flow debriefing vendedores access" ON public.debriefing_vendedores;
CREATE POLICY "Wizzy Flow debriefing vendedores access"
  ON public.debriefing_vendedores
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.debriefings d
      WHERE d.id = debriefing_vendedores.debriefing_id
        AND (
          (d.workspace_id IS NOT NULL AND public.user_has_workspace_access(auth.uid(), d.workspace_id))
          OR EXISTS (
            SELECT 1 FROM public.projects p
            WHERE p.id = d.project_id
              AND p.workspace_id IS NOT NULL
              AND public.user_has_workspace_access(auth.uid(), p.workspace_id)
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.debriefings d
      WHERE d.id = debriefing_vendedores.debriefing_id
        AND (
          (d.workspace_id IS NOT NULL AND public.user_has_workspace_access(auth.uid(), d.workspace_id))
          OR EXISTS (
            SELECT 1 FROM public.projects p
            WHERE p.id = d.project_id
              AND p.workspace_id IS NOT NULL
              AND public.user_has_workspace_access(auth.uid(), p.workspace_id)
          )
        )
    )
  );

DROP TRIGGER IF EXISTS update_briefings_updated_at ON public.briefings;
CREATE TRIGGER update_briefings_updated_at
  BEFORE UPDATE ON public.briefings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_debriefings_updated_at ON public.debriefings;
CREATE TRIGGER update_debriefings_updated_at
  BEFORE UPDATE ON public.debriefings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_briefings_project ON public.briefings(project_id);
CREATE INDEX IF NOT EXISTS idx_debriefings_project ON public.debriefings(project_id);
CREATE INDEX IF NOT EXISTS idx_debriefings_briefing ON public.debriefings(briefing_id);
CREATE INDEX IF NOT EXISTS idx_debriefing_extras_debriefing ON public.debriefing_extras(debriefing_id);
CREATE INDEX IF NOT EXISTS idx_debriefing_vendedores_debriefing ON public.debriefing_vendedores(debriefing_id);

NOTIFY pgrst, 'reload schema';
