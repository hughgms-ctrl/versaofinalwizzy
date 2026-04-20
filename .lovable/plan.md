

# Operacional: Cards Elegantes + Colunas por Categoria

## 1. Redesign dos Cards (visual mais elegante)

Substituir o `CaseCard.tsx` atual por um design mais limpo, inspirado em Linear/Notion:

- **Header compacto**: avatar (32px) + nome do contato + menu de 3-pontos no topo direito
- **Título do caso** em destaque (peso médio, 1 linha truncada com tooltip)
- **Linha de metadados sutil**: ícone da categoria com cor da borda esquerda mais fina (3px) + chip pequeno de prioridade (apenas se urgente/alta) + badge de prazo arredondado
- **Barra de progresso**: linha fininha (2px) integrada ao card, sem texto redundante "X/Y tarefas" (movido para hover/tooltip)
- **Footer minimalista**: apenas avatar do responsável (sem nome — vai em tooltip) + data relativa ("há 2d") em texto muito sutil
- **Hover state**: leve elevação + revelar botão "Abrir" que hoje está sempre visível
- **Inline tasks (expandir)**: apenas ícone-botão sem texto "Ver tarefas" — abre painel limpo abaixo
- **Espaçamento**: padding consistente (p-4), bordas arredondadas (rounded-xl), sombra muito sutil ao invés de bordas grossas
- **Densidade**: card mais alto e respirável ao invés de empilhado

Resultado: cards com cara de produto profissional, não de protótipo.

## 2. Colunas (Status) por Categoria

Hoje as colunas (`case_statuses`) são globais por organização. Vamos torná-las **vinculadas a uma categoria** (INSS, Judicial Cível, Trabalhista, etc.), permitindo fluxos diferentes por tipo de processo.

### Mudança no banco

Adicionar coluna `category_id` (uuid, nullable) em `case_statuses`:
- Se `category_id` for `NULL` → status global (compatibilidade com o atual)
- Se `category_id` for definido → status só aparece para casos daquela categoria

```text
case_statuses
├── id
├── organization_id
├── category_id (NEW, nullable, FK → case_categories)
├── name, color, order, is_default, is_closed
```

### Lógica do board

- Filtro por categoria já existe em `OperationsPage.tsx` — quando o usuário selecionar uma categoria específica (ex: "INSS"), o board mostra apenas as colunas daquela categoria + as globais
- Quando selecionar "Todas as categorias", mostra apenas as colunas globais (evita confusão)
- Atualizar `useCaseStatuses` para aceitar `categoryId` opcional como filtro

### UI de gestão de colunas

Nova aba **"Colunas"** dentro de `/operations/templates` (ou nova página `/operations/columns`):

- Seletor no topo: "Aplicar a: [Todas as categorias ▾]"
- Lista de colunas da categoria selecionada com:
  - Drag handle para reordenar
  - Nome editável inline
  - Color picker
  - Toggle "É status final (fecha o caso)"
  - Toggle "É status padrão (caso novo entra aqui)"
  - Botão "Excluir"
- Botão "+ Nova coluna"
- Botão "Copiar de outra categoria" (clona estrutura existente)

### Exemplo prático

```text
INSS:        [Documentação] → [Protocolado] → [Em análise] → [Deferido] → [Indeferido]
Trabalhista: [Petição inicial] → [Audiência] → [Sentença] → [Recurso] → [Trânsito julgado]
Cível:       [Inicial] → [Contestação] → [Instrução] → [Sentença] → [Encerrado]
```

## 3. Detalhes técnicos

**Arquivos a editar:**
- `src/components/operations/CaseCard.tsx` — redesign completo
- `src/components/operations/OperationsBoard.tsx` — passar `categoryId` para `useCaseStatuses` e filtrar status visíveis
- `src/hooks/useOperationsCases.ts` — `useCaseStatuses(categoryId?)` aceitar filtro
- `src/pages/OperationsPage.tsx` — passar categoria ativa ao board
- `src/pages/CaseTemplatesPage.tsx` — adicionar aba "Colunas" OU criar página separada
- **Novo**: `src/components/operations/CaseStatusManager.tsx` — UI de CRUD de colunas por categoria
- **Novo**: `src/hooks/useCaseStatusMutations.ts` — create/update/delete/reorder de status

**Migration:**
- `ALTER TABLE case_statuses ADD COLUMN category_id uuid REFERENCES case_categories(id) ON DELETE CASCADE;`
- Index em `(organization_id, category_id, "order")`
- RLS policies já existentes continuam válidas (filtram por `organization_id`)

**Compatibilidade:** todos os status atuais ficam com `category_id = NULL` (globais), nada quebra. Usuário pode migrar manualmente para específicos se quiser.

