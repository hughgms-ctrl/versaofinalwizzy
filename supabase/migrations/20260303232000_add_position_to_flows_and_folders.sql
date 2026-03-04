-- Add position column to flows
ALTER TABLE public.flows ADD COLUMN IF NOT EXISTS position INTEGER DEFAULT 0;

-- Add position column to flow_folders
ALTER TABLE public.flow_folders ADD COLUMN IF NOT EXISTS position INTEGER DEFAULT 0;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_flows_position ON public.flows(position);
CREATE INDEX IF NOT EXISTS idx_flow_folders_position ON public.flow_folders(position);
