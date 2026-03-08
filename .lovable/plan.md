

# Workspace Direto: Flow Builder, Campanha, Card e Perfil

## Resumo

Implementar workspace_id direto em contacts/conversations (substituindo tags), adicionar nó de workspace no flow builder, campo workspace na campanha, indicador visual no card de conversa, e exibição no painel de atributos.

## 1. Banco de Dados

**Migration:**
- ADD `workspace_id` (uuid, nullable, FK workspaces) em `contacts` e `conversations`
- ADD `workspace_id` (uuid, nullable) em `campaigns` (para filtrar qual workspace a campanha aplica)
- Manter `filter_tag_ids` temporariamente para migração futura

## 2. Flow Builder — Novo nó `action-workspace`

**Tipo:** Ação que atribui um workspace ao contato/conversa.

- Adicionar `'action-workspace'` ao `FlowNodeType` em `src/types/flow.ts`
- Adicionar componente em `src/data/flowComponents.ts` na seção "Ações":
  ```
  type: 'action-workspace', label: 'Atribuir Workspace',
  icon: 'Building2', color: 'bg-sky-500'
  ```
- Criar nó visual em `src/components/flow/nodes/ActionNodes.tsx`
- Adicionar config no `NodePropertiesPanel.tsx`: select de workspace
- No `flow-execute`: ao processar `action-workspace`, fazer UPDATE em contacts e conversations

## 3. Campanha — Campo workspace

- Em `CampaignDialog.tsx`: adicionar select de workspace (opcional)
- Salvar `workspace_id` na tabela `campaigns`
- Quando campanha dispara, atribuir workspace ao contato/conversa automaticamente

## 4. Card de Conversa — Indicador visual

Adicionar uma **barra lateral fina colorida** (3px) no lado esquerdo do card, usando a cor do workspace. Discreto e informativo.

```text
┌─────────────────────────┐
│▌ João Silva        2min │   ← barra colorida = workspace "Trabalhista" (azul)
│▌ Olá, preciso de ajuda  │
└─────────────────────────┘
```

- Em `ConversationList.tsx`: buscar workspace do contato, renderizar `div` absoluta com `style={{ backgroundColor: workspace.color }}` no lado esquerdo (similar ao selection indicator já existente)
- Só aparece se o contato tem workspace

## 5. Painel de Atributos — Workspace visível

- Em `ConversationAttributesPanel.tsx`: adicionar badge/select de workspace junto aos campos de pipeline, status e departamento
- Permitir trocar workspace direto do painel (atualiza contact + conversation)

## Arquivos Impactados

| Arquivo | Mudança |
|---------|---------|
| Migration SQL | ADD workspace_id em contacts, conversations, campaigns |
| `src/types/flow.ts` | Add `action-workspace` type + config interface |
| `src/data/flowComponents.ts` | Add componente workspace |
| `src/components/flow/nodes/ActionNodes.tsx` | Nó visual workspace |
| `src/components/flow/NodePropertiesPanel.tsx` | Config panel workspace |
| `src/components/campaigns/CampaignDialog.tsx` | Select workspace |
| `src/components/conversations/ConversationList.tsx` | Barra colorida lateral |
| `src/components/conversations/ConversationAttributesPanel.tsx` | Badge/select workspace |
| `src/hooks/useWorkspaces.ts` | Tipo atualizado |
| `src/hooks/useContacts.ts` | Incluir workspace_id |
| `src/hooks/useConversations.ts` | Incluir workspace_id |
| `supabase/functions/flow-execute/index.ts` | Handler action-workspace |

