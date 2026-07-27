-- Inventory feature (src/fluzz/pages/Inventory.tsx and
-- src/fluzz/components/inventory/*) queries inventory_items, inventory_events
-- and inventory_movements, none of which were ever created by a migration.

CREATE TABLE IF NOT EXISTS public.inventory_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  date date,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.inventory_events(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  quantity numeric NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'un',
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  type text NOT NULL,
  quantity numeric NOT NULL,
  date date,
  notes text,
  created_by uuid,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.inventory_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Wizzy Flow workspace inventory events access" ON public.inventory_events;
CREATE POLICY "Wizzy Flow workspace inventory events access"
  ON public.inventory_events
  FOR ALL
  USING (public.user_has_workspace_access(auth.uid(), workspace_id))
  WITH CHECK (public.user_has_workspace_access(auth.uid(), workspace_id));

DROP POLICY IF EXISTS "Wizzy Flow workspace inventory items access" ON public.inventory_items;
CREATE POLICY "Wizzy Flow workspace inventory items access"
  ON public.inventory_items
  FOR ALL
  USING (public.user_has_workspace_access(auth.uid(), workspace_id))
  WITH CHECK (public.user_has_workspace_access(auth.uid(), workspace_id));

DROP POLICY IF EXISTS "Wizzy Flow inventory movements access" ON public.inventory_movements;
CREATE POLICY "Wizzy Flow inventory movements access"
  ON public.inventory_movements
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.inventory_items i
      WHERE i.id = inventory_movements.item_id
        AND public.user_has_workspace_access(auth.uid(), i.workspace_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.inventory_items i
      WHERE i.id = inventory_movements.item_id
        AND public.user_has_workspace_access(auth.uid(), i.workspace_id)
    )
  );

DROP TRIGGER IF EXISTS update_inventory_events_updated_at ON public.inventory_events;
CREATE TRIGGER update_inventory_events_updated_at
  BEFORE UPDATE ON public.inventory_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_inventory_items_updated_at ON public.inventory_items;
CREATE TRIGGER update_inventory_items_updated_at
  BEFORE UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_inventory_events_workspace ON public.inventory_events(workspace_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_workspace ON public.inventory_items(workspace_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_event ON public.inventory_items(event_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_item ON public.inventory_movements(item_id);

NOTIFY pgrst, 'reload schema';
