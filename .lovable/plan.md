
# Plano de Implementacao - Fase 2: Modulo de Documentos e Templates

Seguindo a ordem solicitada: Fase 2 -> Fase 3 -> Fase 1 -> Fase 4. Vamos comecar pelo modulo de documentos.

---

## O que sera construido nesta fase

Uma pagina `/documents` com 3 abas: **Templates**, **Documentos Gerados** e **Packs**. O usuario podera fazer upload de um contrato modelo, a IA vai analisar e extrair os campos variaveis (nome, endereco, CPF, etc.), criando um template reutilizavel com marcadores `{{campo}}`. Tambem sera possivel agrupar templates em packs para gerar multiplos documentos de uma vez.

---

## Funcionalidades

### 1. Aba Templates
- Lista de templates salvos (nome, categoria, quantidade de campos, data)
- Botao "Novo Template" com duas opcoes:
  - **Upload de modelo**: envia PDF/DOCX, IA analisa e gera template com `{{campos}}`
  - **Criar manualmente**: editor de texto com insercao de campos variaveis
- Ao clicar em um template: abre editor para visualizar/editar o texto e os campos
- Opcoes: editar, duplicar, excluir

### 2. Aba Packs
- Agrupar multiplos templates (ex: "Pack Auxilio Reclusao" = Procuracao + Contrato + Declaracao)
- Criar pack: selecionar templates existentes, dar nome
- Ao gerar documentos de um pack, os mesmos dados preenchem todos os templates

### 3. Aba Documentos Gerados
- Historico de documentos gerados a partir de templates/packs
- Status: gerado, enviado, assinado
- Link para download do PDF
- Vinculo com contato (quando gerado via agente)

---

## Detalhes Tecnicos

### Novas tabelas (migracao SQL)

```text
document_templates
  - id (uuid, PK)
  - organization_id (uuid, FK)
  - name (text)
  - description (text, nullable)
  - category (text, nullable) -- ex: "contrato", "procuracao", "declaracao"
  - content (text) -- texto com marcadores {{campo}}
  - fields (jsonb) -- lista de campos detectados: [{name, label, type, required}]
  - original_file_url (text, nullable) -- URL do arquivo modelo original
  - workspace_id (uuid, nullable)
  - created_by (uuid, nullable)
  - created_at, updated_at (timestamps)

document_packs
  - id (uuid, PK)
  - organization_id (uuid, FK)
  - name (text)
  - description (text, nullable)
  - template_ids (uuid[]) -- array de IDs de templates
  - workspace_id (uuid, nullable)
  - created_by (uuid, nullable)
  - created_at, updated_at (timestamps)

generated_documents
  - id (uuid, PK)
  - organization_id (uuid, FK)
  - template_id (uuid, nullable)
  - pack_id (uuid, nullable)
  - contact_id (uuid, nullable)
  - conversation_id (uuid, nullable)
  - name (text)
  - filled_data (jsonb) -- dados preenchidos nos campos
  - pdf_url (text, nullable) -- URL do PDF gerado no storage
  - status (text) -- 'draft', 'generated', 'sent', 'signed'
  - signing_method (text, nullable) -- 'manual', 'govbr', 'zapsign' (para Fase 3)
  - signing_status (text, nullable)
  - created_by (uuid, nullable)
  - created_at, updated_at (timestamps)
```

RLS: todas as tabelas com politicas baseadas em `organization_id = get_user_org_id(auth.uid())`.

### Nova edge function

**`process-document-template`**: recebe arquivo (via URL do storage), usa IA para:
1. Ler e interpretar o conteudo do documento
2. Identificar campos variaveis (nomes, enderecos, CPFs, datas, etc.)
3. Retornar texto reestruturado com `{{campo}}` e lista de campos detectados

**`generate-document-pdf`**: recebe template + dados preenchidos, gera PDF e salva no storage bucket `contact-files`.

### Novos arquivos frontend

```text
src/pages/DocumentsPage.tsx -- pagina principal com abas
src/components/documents/TemplatesList.tsx -- lista de templates
src/components/documents/TemplateEditor.tsx -- editor de template
src/components/documents/PacksList.tsx -- lista de packs
src/components/documents/PackEditor.tsx -- criar/editar pack
src/components/documents/GeneratedDocumentsList.tsx -- historico
src/components/documents/UploadTemplateDialog.tsx -- dialog de upload + processamento IA
src/hooks/useDocumentTemplates.ts -- CRUD templates
src/hooks/useDocumentPacks.ts -- CRUD packs
src/hooks/useGeneratedDocuments.ts -- consulta documentos gerados
```

### Alteracoes em arquivos existentes

- **App.tsx**: adicionar rotas `/documents`
- **Sidebar.tsx**: adicionar item "Documentos" com icone FileText, abaixo de Widgets
- **Sidebar.tsx**: adicionar permissao `module: 'flows'` (mesmo grupo de automacoes)

---

## Fluxo de uso principal

```text
1. Usuario acessa /documents
2. Clica em "Novo Template"
3. Faz upload de um PDF de contrato
4. Sistema envia para edge function que usa IA para analisar
5. IA retorna texto com {{nome_responsavel}}, {{cpf}}, {{endereco}}, etc.
6. Usuario revisa e salva o template
7. Pode criar um Pack agrupando templates
8. Documentos gerados ficam no historico (aba "Gerados")
```

A geracao automatica via agente e assinatura serao implementados na Fase 3.

---

## Ordem de implementacao

1. Migracoes SQL (tabelas + RLS)
2. Edge function `process-document-template`
3. Hooks de dados (useDocumentTemplates, useDocumentPacks, useGeneratedDocuments)
4. Pagina DocumentsPage com abas
5. Componentes de templates (lista, editor, upload)
6. Componentes de packs
7. Sidebar + rotas
8. Edge function `generate-document-pdf` (geracao de PDF basica)
