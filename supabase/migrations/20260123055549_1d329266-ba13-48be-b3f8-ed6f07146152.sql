-- Table for custom pipelines
CREATE TABLE public.pipelines (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table for pipeline columns
CREATE TABLE public.pipeline_columns (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pipeline_id uuid NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#6366f1',
  "order" integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table for conversation position in each pipeline
CREATE TABLE public.conversation_pipeline_positions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  pipeline_id uuid NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  column_id uuid NOT NULL REFERENCES public.pipeline_columns(id) ON DELETE CASCADE,
  "order" integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(conversation_id, pipeline_id)
);

-- Enable RLS
ALTER TABLE public.pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_pipeline_positions ENABLE ROW LEVEL SECURITY;

-- RLS policies for pipelines
CREATE POLICY "Users can view pipelines in their organization"
  ON public.pipelines FOR SELECT
  USING (organization_id = get_user_org_id(auth.uid()));

CREATE POLICY "Users can manage pipelines in their organization"
  ON public.pipelines FOR ALL
  USING (organization_id = get_user_org_id(auth.uid()));

-- RLS policies for pipeline_columns
CREATE POLICY "Users can view columns in their org pipelines"
  ON public.pipeline_columns FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.pipelines p
    WHERE p.id = pipeline_columns.pipeline_id
    AND p.organization_id = get_user_org_id(auth.uid())
  ));

CREATE POLICY "Users can manage columns in their org pipelines"
  ON public.pipeline_columns FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.pipelines p
    WHERE p.id = pipeline_columns.pipeline_id
    AND p.organization_id = get_user_org_id(auth.uid())
  ));

-- RLS policies for conversation_pipeline_positions
CREATE POLICY "Users can view positions in their org"
  ON public.conversation_pipeline_positions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_pipeline_positions.conversation_id
    AND c.organization_id = get_user_org_id(auth.uid())
  ));

CREATE POLICY "Users can manage positions in their org"
  ON public.conversation_pipeline_positions FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_pipeline_positions.conversation_id
    AND c.organization_id = get_user_org_id(auth.uid())
  ));

-- Triggers for updated_at
CREATE TRIGGER update_pipelines_updated_at
  BEFORE UPDATE ON public.pipelines
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pipeline_columns_updated_at
  BEFORE UPDATE ON public.pipeline_columns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversation_pipeline_positions_updated_at
  BEFORE UPDATE ON public.conversation_pipeline_positions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Indexes for performance
CREATE INDEX idx_pipeline_columns_pipeline ON public.pipeline_columns(pipeline_id);
CREATE INDEX idx_pipeline_columns_order ON public.pipeline_columns(pipeline_id, "order");
CREATE INDEX idx_conv_positions_pipeline ON public.conversation_pipeline_positions(pipeline_id);
CREATE INDEX idx_conv_positions_conv ON public.conversation_pipeline_positions(conversation_id);