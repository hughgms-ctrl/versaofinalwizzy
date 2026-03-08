

# Remarketing em Todos os Blocos que Aguardam Resposta

## O que será feito

Extrair o editor de remarketing (sequência de follow-ups + geração IA) para um componente reutilizável e adicioná-lo em todos os blocos que pausam o fluxo esperando resposta do usuário.

## Blocos afetados

| Bloco | Comportamento |
|-------|--------------|
| `content-block` | Já tem remarketing (toggle "Aguardar resposta") |
| `user-input` | Sempre aguarda — adicionar remarketing direto |
| `action-flow` | Já tem toggle "Aguardar resposta" — adicionar remarketing quando ativo |
| `message-buttons` | Sempre aguarda clique — adicionar remarketing direto |
| `message-list` | Sempre aguarda seleção — adicionar remarketing direto |

## Arquivos

| Arquivo | Mudança |
|---------|---------|
| **NOVO** `src/components/flow/RemarketingStepsEditor.tsx` | Componente extraído: lista de steps, seletor de tempo, textarea, botão IA |
| `src/components/flow/NodePropertiesPanel.tsx` | Substituir bloco inline do content-block pelo componente; adicionar nos cases `user-input`, `action-flow`, `message-buttons`, `message-list` |
| `src/components/flow/nodes/MessageNodes.tsx` | Saídas verde/vermelha + indicador de follow-ups nos nós Botões e Lista |
| `src/components/flow/nodes/ActionNodes.tsx` | Saídas verde/vermelha + indicador no nó FlowAction quando `waitForResponse=true` |

## Detalhes

- O componente `RemarketingStepsEditor` recebe `localData`, `handleChange`, `isGenerating`, `setIsGenerating` como props
- Para `message-buttons` e `message-list`, os nós visuais ganham handles duplos (responded/timeout) pois sempre aguardam resposta
- Para `action-flow`, os handles duplos só aparecem quando `waitForResponse=true`
- Para `user-input`, sempre mostra handles duplos
- Backend não precisa de mudança — o `process-flow-timeouts` já lê `remarketingSteps` de qualquer nó em `waiting_input`

