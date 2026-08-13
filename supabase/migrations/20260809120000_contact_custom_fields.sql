-- Campos customizados de contato, por organização.
--
-- Motivação: a importação de contatos por planilha (ImportContactsDialog) precisa
-- guardar colunas que não têm coluna própria em `contacts` — por exemplo uma
-- mensagem diferente para cada contato, que depois é usada como {{variavel}} no
-- fluxo. Antes disso só existia `contacts.metadata` (jsonb livre), sem catálogo,
-- sem tipo e sem como a UI descobrir quais chaves existem.
--
-- Esta tabela é só a DEFINIÇÃO do campo. Os VALORES continuam em
-- `contacts.metadata`, sob a chave reservada `custom_fields` (um objeto
-- key -> valor), para não colidir com o que já mora ali hoje:
--   - metadata.note / metadata.description (ContactListItem.tsx)
--   - metadata.phone_aliases / metadata.canonical_phone (campaign-webhook)

CREATE TABLE IF NOT EXISTS public.contact_custom_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- `key` é o nome usado como {{key}} no fluxo. O motor (flow-execute) só
  -- reconhece \w+ no replace de variáveis, então a chave é restrita ao mesmo
  -- alfabeto: começa com letra minúscula, depois letras/números/underscore.
  -- Sem isso, um campo "Mensagem Personalizada" nunca seria substituído.
  key text NOT NULL,
  label text NOT NULL,
  -- Tipo é informativo (usado para validar/formatar na UI). Mantido como texto
  -- com CHECK em vez de enum para não exigir nova migration a cada tipo novo.
  type text NOT NULL DEFAULT 'text',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contact_custom_fields_key_format CHECK (key ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT contact_custom_fields_type_valid CHECK (type IN ('text', 'number', 'date', 'boolean')),
  CONSTRAINT contact_custom_fields_org_key_unique UNIQUE (organization_id, key)
);

CREATE INDEX IF NOT EXISTS idx_contact_custom_fields_org
  ON public.contact_custom_fields (organization_id);

ALTER TABLE public.contact_custom_fields ENABLE ROW LEVEL SECURITY;

-- Mesmo padrão das outras tabelas por organização: acesso restrito à org do
-- usuário autenticado. `get_user_org_id` já é usada pelas policies de contacts.
DROP POLICY IF EXISTS "Users can manage contact custom fields by org" ON public.contact_custom_fields;
CREATE POLICY "Users can manage contact custom fields by org"
  ON public.contact_custom_fields
  FOR ALL
  USING (organization_id = public.get_user_org_id((select auth.uid())))
  WITH CHECK (organization_id = public.get_user_org_id((select auth.uid())));

DROP TRIGGER IF EXISTS update_contact_custom_fields_updated_at ON public.contact_custom_fields;
CREATE TRIGGER update_contact_custom_fields_updated_at
  BEFORE UPDATE ON public.contact_custom_fields
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- contact_tags.added_by_type ganha a origem 'import' (tag aplicada na importação
-- por planilha). Sem isto o CHECK de 20260806120000_whatsapp_labels_sync.sql
-- rejeitaria a gravação das tags do lote.
ALTER TABLE public.contact_tags DROP CONSTRAINT IF EXISTS contact_tags_added_by_type_check;
ALTER TABLE public.contact_tags ADD CONSTRAINT contact_tags_added_by_type_check
  CHECK (added_by_type IN ('manual', 'flow', 'ai', 'whatsapp', 'import'));

NOTIFY pgrst, 'reload schema';
