

# Simplificar Condições: Tipo + Toggle "É / Não É"

## Conceito
Reduzir os 9 tipos de condição para 6 tipos únicos, cada um com um toggle "é / não é":

| Antes (9 itens) | Depois (6 itens + toggle) |
|---|---|
| Tem tag / Não tem tag | **Tag** → é / não é |
| Está no pipeline / Não está no pipeline | **Pipeline** → é / não é |
| Responsável é / Sem responsável | **Responsável** → é / não é |
| Variável | **Variável** (mantém operadores próprios) |
| Campo do contato | **Campo do contato** (mantém operadores próprios) |
| Modo de atendimento | **Modo de atendimento** → é / não é |

## Mudanças

### 1. `src/types/flow.ts`
- Simplificar `ConditionRuleType` para 6 valores: `'tag' | 'pipeline' | 'assigned' | 'variable' | 'contact_field' | 'service_mode'`
- Adicionar campo `negate?: boolean` ao `ConditionRule` (quando true = "não é")

### 2. `src/components/flow/NodePropertiesPanel.tsx`
- Reduzir `conditionRuleTypes` para 6 entradas
- Adicionar toggle "É / Não é" ao lado do select de tipo em cada regra
- Atualizar `renderConditionRuleFields` para usar os novos tipos unificados
- Para `variable` e `contact_field`, o toggle não aparece (usam seus próprios operadores como `equals`, `not_equals`, etc.)
- Migrar compatibilidade: ao carregar regras com tipos antigos (`has_tag`, `not_has_tag`, etc.), converter automaticamente para novo formato

### 3. `src/components/flow/nodes/LogicNodes.tsx`
- Atualizar o resumo visual das condições para refletir os novos tipos

