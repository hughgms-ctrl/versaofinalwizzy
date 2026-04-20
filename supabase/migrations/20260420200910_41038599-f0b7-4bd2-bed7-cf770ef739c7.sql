ALTER TABLE public.case_statuses
ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.case_categories(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_case_statuses_org_category_order
ON public.case_statuses (organization_id, category_id, "order");