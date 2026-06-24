ALTER TABLE public.document_signers
  ADD COLUMN IF NOT EXISTS data_source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS field_mapping jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.document_signers.data_source IS 'manual = digitado pelo dono; form = preenchido pelo cliente via formulário público';
COMMENT ON COLUMN public.document_signers.field_mapping IS 'Mapeia atributos do signatário (name, email, cpf, phone) para nomes de campos do template quando data_source = form';;
