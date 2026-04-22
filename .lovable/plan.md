

# Plano: editor rich text + correção de formatação e datas para Documentos

## Diagnóstico do que está errado hoje

### 1. Editor é apenas `<Textarea>` mono-fonte
- `TemplateEditor.tsx` usa `<Textarea>` simples (texto puro). Não há **negrito, itálico, alinhamento, listas, títulos, tabelas, inserir imagem/logo no corpo, cores**, nada.
- O conteúdo é salvo como string crua (`content: string`) no banco.
- `generate-document-pdf` (edge function) faz `wrapText` linha por linha em fonte fixa Helvetica 11pt — qualquer formatação seria descartada de qualquer forma.
- Resultado: documentos saem "feios", sem identidade visual, sem hierarquia, sem alinhamento.

### 2. Logo só pode ser anexada na geração, não no template
- A logo é enviada apenas em `TemplateFillForm` (no momento de gerar). Não fica salva no template.
- Não há posição configurável (sempre topo esquerdo, fixo).

### 3. Data com placeholder "aaaa/mm/dd"
- Causa: campos `<Input type="date">` nativos do navegador. O placeholder mostrado depende do **locale do sistema do usuário**, e sem `lang="pt-BR"` definido, alguns navegadores mostram "aaaa/mm/dd" (PT-PT) em vez de "dd/mm/aaaa".
- Isso aparece em `TemplateFillForm.tsx`, `PublicFormPage.tsx`, `PackFillForm.tsx`, `PublicPackFormPage.tsx` para qualquer field do tipo `date`.
- Além disso, ao gravar a data e injetar no template, ela é salva no formato ISO (`2026-04-22`), e o PDF imprime literalmente "2026-04-22" no documento (péssimo para contratos PT-BR).

### 4. Preview no editor é `font-mono` cinza
- O preview do template/pack mostra texto em fonte monoespaçada com fundo cinza — não representa o que o cliente vai receber.

### 5. Modo escuro mantém o editor escuro
- O `<Textarea>` herda `bg-background` do tema; em dark mode fica preto, contra a expectativa do usuário (papel = branco).

---

## O que será implementado

### A) Editor rich text (TipTap) — branco mesmo em dark mode

Substituir `<Textarea>` em `TemplateEditor.tsx` por um editor TipTap configurado com toolbar visual estilo Word:

**Toolbar com botões para:**
- Negrito, itálico, sublinhado, tachado
- Títulos (H1, H2, H3) e parágrafo
- Alinhamento (esquerda, centro, direita, justificado)
- Listas (com marcadores e numerada)
- Cor do texto e cor de fundo (highlight)
- Família de fonte e tamanho de fonte
- Inserir tabela (linhas/colunas configuráveis)
- Inserir imagem (upload para `contact-files` ou URL)
- Inserir logo da organização (atalho)
- Inserir variável (`{{campo}}`) via menu suspenso já filtrado pelos campos definidos
- Quebra de página manual
- Desfazer/refazer

**Visual:**
- Container do editor sempre **branco com texto preto**, mesmo em dark mode (forçar `bg-white text-black` no `EditorContent`, com sombra simulando folha A4 e largura fixa de 21cm).
- Toolbar segue o tema (escura no dark, clara no light), só a "folha" é branca.
- Margens internas equivalentes a 2,5cm para se assemelhar a uma página A4 real.

**Armazenamento:**
- Salvar o conteúdo como **HTML** (string), em uma nova coluna `content_html` em `document_templates`, mantendo `content` (texto puro) por compatibilidade — o sistema escreve nas duas, mas a fonte da verdade passa a ser `content_html`.
- Migração: backfill de `content_html` para templates existentes envolvendo o texto atual em `<p>` por linha.

### B) Geração de PDF com formatação preservada

Reescrever `supabase/functions/generate-document-pdf/index.ts` para usar **Puppeteer/Chrome headless** via `https://esm.sh/puppeteer-core` ou, mais leve para edge functions Supabase, via **`https://deno.land/x/html2pdf`** ou serviço externo. Como a infra atual de edge usa Deno, a solução robusta é:

1. Receber `content_html` do template + `filled_data`.
2. Substituir `{{campos}}` no HTML.
3. **Formatar valores por tipo de campo** antes de injetar:
   - `date`: `dd/MM/yyyy` (ex: `22/04/2026`) usando date-fns com locale `ptBR`.
   - `cpf`: `000.000.000-00`.
   - `phone`: `(00) 00000-0000`.
   - `currency`: `R$ 1.234,56`.
4. Montar HTML completo com CSS embutido (fonte, margens A4, header com logo, footer com paginação).
5. Renderizar para PDF via **`https://esm.sh/@react-pdf/renderer`** OU manter pdf-lib mas usar **`https://esm.sh/html-to-pdfmake` + `pdfmake`** — pdfmake suporta negrito, listas, tabelas, alinhamento e imagens, e funciona em Deno.
6. Logo da organização buscada do `organizations.logo_url` automaticamente (não precisa o cliente subir toda vez no formulário público).

Decisão: **pdfmake** — já validado em Deno, suporta tudo o que o TipTap gera, mantém compatibilidade WinAnsi via fontes embutidas.

### C) Logo no template (não só na geração)

- Adicionar campo `logo_url` em `document_templates`.
- No `TemplateEditor`, adicionar um upload de logo no painel lateral ("Logo do template"). Se vazio, usa `organizations.logo_url` como fallback.
- Remover o upload de logo do `TemplateFillForm` e `PublicFormPage` (a logo já vem do template) — ou manter como override opcional.

### D) Datas formatadas corretamente — fim do "aaaa/mm/dd"

1. **Adicionar `lang="pt-BR"` na tag `<html>`** em `index.html` para forçar o navegador a exibir o placeholder nativo em PT-BR ("dd/mm/aaaa" em vez de "aaaa/mm/dd").
2. Substituir `<Input type="date">` por componente `<DatePicker>` baseado no `Calendar` do shadcn/ui (já existe `src/components/ui/calendar.tsx`) com formato visual `dd/MM/yyyy` em PT-BR. Aplica em:
   - `TemplateFillForm.tsx`
   - `PublicFormPage.tsx`
   - `PackFillForm.tsx`
   - `PublicPackFormPage.tsx`
3. Ao injetar no template (front e edge), converter ISO → `dd/MM/yyyy` antes da substituição.

### E) Preview "papel real"

Substituir o preview cinza monoespaçado por um div branco com a folha A4 simulada renderizando o HTML formatado (mesmo CSS do PDF), para o usuário ver exatamente o que o cliente receberá.

---

## Detalhes técnicos

### Dependências novas
- `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-text-align`, `@tiptap/extension-text-style`, `@tiptap/extension-color`, `@tiptap/extension-highlight`, `@tiptap/extension-underline`, `@tiptap/extension-image`, `@tiptap/extension-table`, `@tiptap/extension-table-row`, `@tiptap/extension-table-cell`, `@tiptap/extension-table-header`, `@tiptap/extension-font-family`
- Edge function: `pdfmake` via esm.sh + `html-to-pdfmake`
- `react-day-picker` (já vem com shadcn calendar) — só vamos compor o DatePicker

### Migração SQL
```sql
ALTER TABLE document_templates
  ADD COLUMN IF NOT EXISTS content_html text,
  ADD COLUMN IF NOT EXISTS logo_url text;

UPDATE document_templates
SET content_html = '<p>' || replace(coalesce(content,''), E'\n', '</p><p>') || '</p>'
WHERE content_html IS NULL;
```

### Arquivos novos
- `src/components/documents/RichTextEditor.tsx` — editor TipTap + toolbar
- `src/components/ui/date-picker.tsx` — componente DatePicker pt-BR

### Arquivos alterados
- `src/components/documents/TemplateEditor.tsx` — substituir Textarea por RichTextEditor + upload de logo
- `src/components/documents/TemplateFillForm.tsx` — DatePicker + remover upload logo
- `src/components/documents/PackFillForm.tsx` — DatePicker
- `src/pages/PublicFormPage.tsx` — DatePicker, preview HTML
- `src/pages/PublicPackFormPage.tsx` — DatePicker
- `src/hooks/useDocumentTemplates.ts` — incluir `content_html`, `logo_url` no tipo e mutations
- `supabase/functions/generate-document-pdf/index.ts` — reescrita com pdfmake
- `supabase/functions/public-form-submit/index.ts` — ler `content_html`
- `supabase/functions/public-template/index.ts` — retornar `content_html` e `logo_url`
- `index.html` — `<html lang="pt-BR">`

### Garantias
- **Templates antigos continuam funcionando** (backfill HTML + edge function aceita ambos).
- Datas no PDF saem em `dd/MM/yyyy` mesmo se o input vier em ISO.
- Logo da organização usado como fallback automático — cliente não precisa fazer upload em todo formulário.
- Editor sempre branco em dark mode (folha A4 simulada).

