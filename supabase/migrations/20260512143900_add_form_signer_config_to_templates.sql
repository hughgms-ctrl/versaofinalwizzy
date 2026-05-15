-- Add form_signer_config column to document_templates
-- This stores the pre-configured field mapping and auth methods
-- for the form signer (the person who fills the public form).
--
-- Structure:
-- {
--   "name_field":  "nome_completo_responsavel",
--   "email_field": "email_responsavel",
--   "cpf_field":   "cpf_responsavel",
--   "phone_field": "telefone_responsavel",
--   "auth_methods": ["handwritten", "email_otp", "whatsapp_otp", "selfie", "cpf_validation"]
-- }

ALTER TABLE document_templates
  ADD COLUMN IF NOT EXISTS form_signer_config jsonb DEFAULT NULL;

COMMENT ON COLUMN document_templates.form_signer_config IS
  'Pre-configured identity field mapping and auth methods for the public-form signer. '
  'Used to pre-populate the "Quem irá assinar?" step when generating a document.';
