

## Plano: Módulo de Documentos Completo

### Situação Atual
- Templates com campos variáveis `{{campo}}`
- Packs agrupam templates mas NÃO identificam campos duplicados automaticamente
- Assinaturas: manual, Gov.br, ZapSign (apenas labels, sem integração real)
- Bloco `action-document` no flow builder existe mas é básico
- Não há exclusão de documentos gerados

---

## 1. Packs com Identificação Automática de Campos (Estilo Lotes ZapSign)

**Conceito:** Ao selecionar 2+ templates em um pack, sistema detecta campos com mesmo nome e consolida o preenchimento.

**Implementação:**
```
┌───────────────────────────────────────────────┐
│ Pack: Auxílio Reclusão                        │
├───────────────────────────────────────────────┤
│ Templates selecionados:                       │
│  ☑ Procuração                                 │
│  ☑ Declaração de Dependência                  │
│  ☑ Requerimento INSS                          │
├───────────────────────────────────────────────┤
│ Campos detectados automaticamente:            │
│                                               │
│  🟢 nome_cliente (3 docs)                     │
│  🟢 cpf_cliente (3 docs)                      │
│  🟡 endereco (2 docs)                         │
│  🔵 numero_processo (1 doc)                   │
└───────────────────────────────────────────────┘
```

**Técnico:**
- No `PackEditor.tsx`, ao mudar `selectedIds`, calcular a interseção de campos
- Mostrar painel lateral com "Campos comuns" vs "Campos únicos por template"
- Salvar no pack um campo `merged_fields` com mapeamento

**Formulário de preenchimento unificado:**
- `PackFillForm.tsx` (novo): formulário único que gera N documentos
- Campos compartilhados aparecem 1 vez, campos únicos agrupados por template

---

## 2. Coleta de Assinatura — Fluxo Completo

**Métodos suportados:**

| Método | Descrição | Implementação |
|--------|-----------|---------------|
| **Manual** | PDF enviado, usuário devolve assinado ou clica "Já assinou" | Já existe |
| **Desenho** | Tela para desenhar assinatura com dedo/mouse | Nova tela pública |
| **Gov.br** | Integração futura (API do governo) | Placeholder |
| **ZapSign** | Webhook para criar documento no ZapSign | Futura |

**Fluxo "Desenho" (prioritário):**

```
1. Sistema gera PDF → salva em `generated_documents`
2. Cria registro em `document_signatures` com `status: pending`
3. Gera link único: `/sign/{token}`
4. Envia link pelo WhatsApp

Página pública /sign/{token}:
┌──────────────────────────────────────┐
│ Documento: Procuração João Silva     │
│ ──────────────────────────────────── │
│ [Preview do PDF]                     │
│                                      │
│ Assine abaixo:                       │
│ ┌────────────────────────────────┐   │
│ │                                │   │
│ │   (área de desenho com canvas) │   │
│ │                                │   │
│ └────────────────────────────────┘   │
│ [Limpar]  [Confirmar Assinatura]     │
└──────────────────────────────────────┘
```

**Técnico:**
- Nova página: `src/pages/PublicSignaturePage.tsx`
- Canvas para desenho (usar `canvas` nativo ou lib `signature_pad`)
- Edge function `capture-signature`: recebe imagem base64, aplica no PDF, salva versão assinada
- Atualiza `document_signatures.signed_at`, `signed_pdf_url`, `status: signed`

---

## 3. Bloco de Documentos no Flow Builder

**Comportamento atual:** Seleciona 1 template, define método de assinatura.

**Melhorias propostas:**

```
┌─────────────────────────────────────────────┐
│ 📄 Gerar Documento                          │
├─────────────────────────────────────────────┤
│ Tipo:                                       │
│  ○ Template único                           │
│  ● Pack (múltiplos documentos)              │
│                                             │
│ Pack/Template: [Auxílio Reclusão     ▼]     │
│                                             │
│ Mapeamento de campos:                       │
│  nome_cliente ← {{contact.name}}            │
│  cpf_cliente  ← {{cpf}} (variável fluxo)    │
│  endereco     ← [coletar via pergunta]      │
│                                             │
│ Assinatura:                                 │
│  ● Enviar link de assinatura (desenho)      │
│  ○ Apenas enviar PDF                        │
│  ○ Gov.br / ZapSign                         │
│                                             │
│ ☑ Aguardar assinatura para continuar        │
│ ☐ Enviar cópia para email do contato        │
└─────────────────────────────────────────────┘
```

**Fluxo de execução:**
1. Motor coleta dados faltantes via perguntas (se `coletar via pergunta`)
2. Gera os PDFs (template ou pack)
3. Salva em `generated_documents`
4. Se assinatura necessária: cria entrada em `document_signatures`, envia link
5. Se "Aguardar assinatura": fluxo pausa com `status: waiting_signature`
6. Webhook de assinatura completa → retoma fluxo

**Técnico:**
- Adicionar suporte a Pack no `NodePropertiesPanel.tsx` case `action-document`
- Novo status de execução: `waiting_signature`
- Edge function `flow-execute` deve tratar este status

---

## 4. Exclusão de Documentos Gerados

**Implementação simples:**
- Adicionar botão "Excluir" no `GeneratedDocumentsList.tsx`
- Hook `useDeleteGeneratedDocument` em `useGeneratedDocuments.ts`
- Também deletar assinaturas relacionadas (`CASCADE` ou manual)
- Opcionalmente remover arquivo do Storage

---

## Arquivos Afetados

| Arquivo | Mudança |
|---------|---------|
| `src/components/documents/PackEditor.tsx` | Adicionar análise de campos duplicados |
| `src/components/documents/PackFillForm.tsx` | Novo — formulário unificado para packs |
| `src/components/documents/GeneratedDocumentsList.tsx` | Botão excluir |
| `src/hooks/useGeneratedDocuments.ts` | Mutation `useDeleteGeneratedDocument` |
| `src/pages/PublicSignaturePage.tsx` | Novo — página pública de assinatura |
| `supabase/functions/capture-signature/index.ts` | Novo — aplica assinatura desenhada no PDF |
| `src/components/flow/NodePropertiesPanel.tsx` | Suporte a Packs, mapeamento de campos, aguardar assinatura |
| `supabase/functions/flow-execute/index.ts` | Novo status `waiting_signature` |
| `src/components/documents/PacksList.tsx` | Botão "Preencher Pack" |
| Migração SQL | Campo `signature_token` em `document_signatures` |

---

## Ordem de Implementação Sugerida

1. **Exclusão de documentos gerados** (rápido, já pedido)
2. **Campos duplicados em Packs** + `PackFillForm`
3. **Página pública de assinatura com desenho**
4. **Atualizar bloco `action-document`** para suportar packs e aguardar assinatura

