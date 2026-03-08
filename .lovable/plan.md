

# Bloco de Condição Avançado + Novos Blocos (estilo BotConversa)

## Problema Atual
O bloco de condição atual é primitivo: aceita apenas uma variável, um operador e um valor. Não permite verificar tags, pipeline, campos do contato, nem combinar múltiplas condições. Faltam também blocos como Randomizador e Atraso Inteligente.

## 1. Bloco de Condição Reformulado

### Modelo de dados (condições múltiplas com AND/OR)
Substituir a config simples `{variable, operator, value}` por:

```text
conditions: [
  { type: 'has_tag', tagId: 'xxx' },
  { type: 'in_pipeline', pipelineId: 'xxx', columnId?: 'xxx' },
  { type: 'variable', variable: 'nome', operator: 'equals', value: 'João' },
  { type: 'assigned_to', userId: 'xxx' },
  ...
]
matchType: 'all' | 'any'   // AND ou OR
```

### Tipos de condição disponíveis (como BotConversa):
| Tipo | Descrição |
|------|-----------|
| `has_tag` | Contato possui a tag X |
| `not_has_tag` | Contato NÃO possui a tag X |
| `in_pipeline` | Conversa está no pipeline X (opcionalmente na coluna Y) |
| `not_in_pipeline` | Conversa NÃO está no pipeline X |
| `assigned_to` | Responsável é o usuário X |
| `not_assigned` | Sem responsável atribuído |
| `variable` | Variável do fluxo (operadores: igual, diferente, contém, maior, menor, existe, não existe) |
| `contact_field` | Campo do contato (nome, email, phone) com operadores |
| `service_mode` | Modo de atendimento (pendente, bot, humano) |

### UI do Properties Panel
- Dropdown "Corresponder a" → Todas / Qualquer uma
- Lista de condições com botão "+ Adicionar condição"
- Cada condição: Select de tipo → campos dinâmicos (tag picker, pipeline picker, input de variável, etc.)
- Botão de remover por condição

### Nó visual (LogicNodes.tsx)
- Mostra resumo das condições (ex: "2 condições (TODAS)")
- Mantém saídas Sim/Não

## 2. Bloco Randomizador (novo)

### Conceito
Divide o tráfego aleatoriamente entre N saídas com pesos configuráveis (%, somando 100%).

### Modelo de dados:
```text
type: 'randomizer'
variants: [
  { id: 'A', label: 'Variante A', weight: 50 },
  { id: 'B', label: 'Variante B', weight: 50 },
]
```

### Nó visual
- Header roxo com ícone Shuffle/Dice
- Mostra as variantes e seus pesos
- Múltiplos handles de saída (um por variante), cada um com label

### Properties Panel
- Lista de variantes editáveis (label + peso %)
- Botão "+ Variante" (máx 5)
- Indicador visual do total (deve ser 100%)

## 3. Bloco Atraso Inteligente (novo)

### Conceito
Pausa o fluxo até uma condição temporal: horário comercial, dia específico, data/hora exata.

### Modelo de dados:
```text
type: 'smart-delay'
delayType: 'until_time' | 'until_business_hours' | 'until_date' | 'fixed'
config: {
  time?: '09:00',
  businessHoursStart?: '08:00',
  businessHoursEnd?: '18:00',
  weekdaysOnly?: true,
  date?: '2026-03-15',
  fixedMinutes?: 30
}
```

## Arquivos a Modificar/Criar

| Ação | Arquivo |
|------|---------|
| Reescrever | `src/types/flow.ts` — novos tipos de nó + interface ConditionRule |
| Reescrever | `src/components/flow/nodes/LogicNodes.tsx` — ConditionNode, RandomizerNode, SmartDelayNode |
| Editar (grande) | `src/components/flow/NodePropertiesPanel.tsx` — novo editor de condições com múltiplas regras + editores dos novos blocos |
| Editar | `src/data/flowComponents.ts` — adicionar Randomizador e Atraso Inteligente na sidebar |
| Editar | `src/components/flow/FlowCanvas.tsx` — registrar novos nodeTypes |

## Detalhes Técnicos

- O editor de condições usará os hooks existentes (`useTags`, `usePipelines`, `usePipelineColumns`, `useTeamMembers`) para popular os selects dinâmicos
- Compatibilidade: condições antigas (formato simples) serão migradas automaticamente para o novo formato no `useEffect` do panel
- Os novos nós (randomizer, smart-delay) terão handles dinâmicos gerados via array

