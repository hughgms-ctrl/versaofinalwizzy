## Plano de Mudanças

### 1. Editar dados do documento antes de assinar
- Em `SignaturesList` (e na nova página de detalhe do documento), adicionar botão **"Editar dados"** disponível somente quando `signing_status != 'completed'` e nenhum signatário tem `signed_at`.
- Abrir modal `EditFilledDataDialog` que mostra os campos do template com os valores atuais (`generated_documents.filled_data`) e também permite editar nome/telefone/email/CPF dos signatários (`document_signers`).
- Ao salvar:
  - Update em `generated_documents.filled_data`
  - Chamar edge function `regenerate-document-pdf` (já existe ou criar) para regenerar o PDF com os novos dados
  - Update em `document_signers` (nome, telefone, email, cpf, auth_methods)
  - Update espelhado em `document_signatures` correspondentes
- Bloquear edição se algum signatário já assinou (mostrar aviso).

### 2. Configuração de signatários no template
- No `TemplateEditor`, adicionar nova aba/seção **"Assinaturas"** com:
  - **Quem preenche o formulário**: toggle "vai assinar?" + métodos OTP (email/whatsapp), exigir selfie (sim/não), exigir manuscrita.
  - **Mapeamento de campos do filler**: dropdowns para indicar qual campo do formulário corresponde a `nome`, `email`, `telefone`, `cpf` (substitui o `pickValue` heurístico atual).
  - **Signatários fixos**: já existe (`TemplateFixedSignersCard`) — manter, mas garantir que aparecem nessa mesma seção "Assinaturas" com os mesmos controles de OTP/selfie por signatário.
- Adicionar colunas em `document_templates`:
  - `filler_signs boolean default true`
  - `filler_auth_methods jsonb` (manuscrita/otp_email/otp_whatsapp/selfie)
  - `filler_field_mapping jsonb` (`{ name, email, phone, cpf }` → nomes de campos do form)

### 3. Mesma configuração para Packs
- Fazer o mesmo em `PackEditor`:
  - Nova seção **"Assinaturas"** com filler config e signatários fixos do pack.
- Criar tabela `pack_fixed_signers` (estrutura espelhando `template_fixed_signers`, mas com `pack_id`).
- Adicionar em `document_packs`: `filler_signs`, `filler_auth_methods`, `filler_field_mapping`.
- Atualizar `public-pack-form-submit` (ou equivalente) para clonar pack signers e usar o mapping.

### 4. Mostrar nome do filler na lista de Assinaturas
- Em `SignaturesList`, no card de cada documento gerado, mostrar:
  - **Título**: nome do documento + " — " + nome de quem preencheu
  - Buscar de `generated_documents.submitted_by.name` (já gravado em `public-form-submit`) ou do primeiro `document_signer` com `data_source='form'`.

### 5. Form público mais limpo
- Em `PublicFormPage` (e `PublicPackFormPage`):
  - **Remover preview lateral do PDF** quando acessado pelo link público.
  - **Remover seletor de logo** — o filler nunca configura logo. Logo vem sempre do template/organização.
  - Layout: apenas o formulário centralizado (mobile-friendly).

### 6. Edge function `public-form-submit`
- Usar `template.filler_field_mapping` quando presente em vez de `pickValue` heurístico.
- Usar `template.filler_signs` para decidir se cria signer do filler.
- Usar `template.filler_auth_methods` para os métodos do filler.

### Arquivos principais a alterar
- Migration: novas colunas em `document_templates`/`document_packs`, nova tabela `pack_fixed_signers`.
- `src/components/documents/TemplateEditor.tsx` — nova seção "Assinaturas".
- `src/components/documents/PackEditor.tsx` — nova seção "Assinaturas".
- `src/components/documents/SignaturesList.tsx` — botão "Editar dados", exibir nome do filler.
- Novo: `src/components/documents/EditFilledDataDialog.tsx`.
- `src/pages/PublicFormPage.tsx` — remover preview e logo selector.
- `src/pages/PublicPackFormPage.tsx` — idem.
- `supabase/functions/public-form-submit/index.ts` — usar mapping/auth do template.
- Novos hooks: `usePackFixedSigners.ts`.

Confirmar antes de implementar?
