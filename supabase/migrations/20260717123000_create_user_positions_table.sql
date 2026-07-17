-- A tabela user_positions (vínculo usuário <-> setor/cargo) nunca existia no banco,
-- mas 9 componentes do Wizzy Flow já dependiam dela (atribuir responsável por setor,
-- filtrar membros por setor ao criar tarefa, gerar tarefas recorrentes por cargo).
-- Toda tentativa de usá-la falhava com "Could not find the table 'public.user_positions'".
CREATE TABLE IF NOT EXISTS public.user_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  position_id uuid NOT NULL REFERENCES public.positions(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, position_id)
);

CREATE INDEX IF NOT EXISTS idx_user_positions_position_id ON public.user_positions(position_id);
CREATE INDEX IF NOT EXISTS idx_user_positions_user_id ON public.user_positions(user_id);

ALTER TABLE public.user_positions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Wizzy Flow workspace row access" ON public.user_positions;
CREATE POLICY "Wizzy Flow workspace row access" ON public.user_positions
  FOR ALL TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.positions p
      WHERE p.id = user_positions.position_id
        AND p.workspace_id IS NOT NULL
        AND public.user_has_workspace_access(auth.uid(), p.workspace_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.positions p
      WHERE p.id = user_positions.position_id
        AND p.workspace_id IS NOT NULL
        AND public.user_has_workspace_access(auth.uid(), p.workspace_id)
    )
  );
