

# Saídas Múltiplas: Content Block, User Input e Agente IA

## Contexto Atual

Hoje o motor funciona assim:
- `content-block` → envia conteúdo → **1 saída** → próximo nó
- `user-input` → pausa (`waitForInput`) → webhook retoma → **1 saída**
- `ai-handoff` → pausa (`waitForInput`) → webhook envia ao orquestrador → `finalizar_interacao(resultado)` → **1 saída**

O que você quer é que esses nós tenham **múltiplas saídas condicionais**, sem quebrar o fluxo básico que já funciona.

---

## Proposta: "Aguardar Resposta" como modo do Content Block + Saídas do AI Handoff

### 1. Content Block com modo "Aguardar Resposta"

Adicionar um toggle **"Aguardar resposta"** no Content Block. Quando ativado:

```text
┌──────────────────────┐
│  Bloco de Conteúdo   │
│  [items...]          │
│  ☑ Aguardar resposta │
│  Variável: {{nome}}  │
│  Timeout: 2h         │
├──────────────────────┤
│  ● Verde  → Respondeu (continua fluxo)
│  ● Vermelho → Não respondeu (remarketing)
└──────────────────────┘
```

**Como funciona no motor:**
- Envia o conteúdo normalmente
- Se "aguardar resposta" está ativo, retorna `waitForInput: true` (igual ao user-input hoje)
- Quando o webhook recebe a resposta, salva na variável configurada e segue pela **saída verde**
- Um **cron job / scheduled function** verifica execuções em `waiting_input` que passaram do timeout → segue pela **saída vermelha**

**Sobre a saída amarela (só ações):** Sugiro simplificar para apenas 2 saídas (respondeu / não respondeu). A restrição "só aceita ações" adicionaria complexidade sem ganho real — o bloco de condição já resolve isso. Se quiser filtrar resposta válida vs inválida, um nó de condição logo após a saída verde faz o mesmo.

### 2. Agente IA com Saídas por Resultado

O `finalizar_interacao(resultado)` do orquestrador já retorna um resultado. Hoje esse resultado é ignorado — o fluxo simplesmente segue pela única saída.

Proposta: configurar **resultados esperados** no nó de AI Handoff, cada um gerando uma saída:

```text
┌──────────────────────────┐
│  Agente IA               │
│  Agente: Vendas          │
│  Prompt adicional: ...   │
├──────────────────────────┤
│  Resultados:             │
│  ● interessado    →  ○   │
│  ● não_interessado →  ○  │
│  ● agendou        →  ○   │
│  ● padrão         →  ○   │
└──────────────────────────┘
```

**Como funciona:**
- O agente recebe os resultados possíveis no prompt: "Ao finalizar, use `finalizar_interacao('interessado')`, `finalizar_interacao('não_interessado')`, etc."
- O `agent-orchestrator`, ao receber o `finalizar_interacao`, salva o resultado na `flow_execution.variables`
- O `flow-execute`, ao retomar, lê o resultado e escolhe a saída correspondente via `outputHandle`
- Se o resultado não bater com nenhuma saída configurada, usa a saída **"padrão"**

### 3. Timeout / Remarketing (saída vermelha)

Para o timeout funcionar, precisamos de:
- Campo `timeout_minutes` na config do nó (ex: 120 = 2h)
- Campo `timeout_at` salvo na `flow_executions` quando o nó entra em `waiting_input`
- Uma **scheduled function** (`process-flow-timeouts`) que roda a cada 5 min:
  - Busca execuções em `waiting_input` onde `timeout_at < now()`
  - Retoma o fluxo pela saída vermelha (`outputHandle: 'timeout'`)

---

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `src/types/flow.ts` | Adicionar `waitForResponse`, `saveVariable`, `timeoutMinutes` ao ContentBlockConfig; `outcomes` ao AIHandoffConfig |
| `src/components/flow/nodes/ContentBlockNode.tsx` | Handles múltiplos (verde + vermelho) quando `waitForResponse=true` |
| `src/components/flow/nodes/AINodes.tsx` | Handles dinâmicos por outcome |
| `src/components/flow/NodePropertiesPanel.tsx` | Editor de "aguardar resposta" + editor de outcomes |
| `supabase/functions/flow-execute/index.ts` | Content block retorna `waitForInput` quando configurado; AI handoff lê resultado e escolhe handle |
| `supabase/functions/zapi-webhook/index.ts` | Ao retomar content-block com aguardar resposta, salva variável |
| **NOVO** `supabase/functions/process-flow-timeouts/index.ts` | Cron que retoma fluxos expirados pela saída de timeout |

## Garantia de Retrocompatibilidade

- Content blocks sem "aguardar resposta" continuam funcionando igual (1 saída, sem pausa)
- AI Handoff sem outcomes configurados continua funcionando igual (1 saída padrão)
- Nenhuma tabela nova — usa campos existentes (`variables`, `current_node_id`, metadata)
- O campo `timeout_at` seria adicionado à tabela `flow_executions` (1 coluna nullable)

## Ordem de Implementação Sugerida

1. **Fase 1 — AI Handoff com outcomes** (menor risco, já tem o `finalizar_interacao`)
2. **Fase 2 — Content Block com aguardar resposta** (2 saídas: respondeu/não respondeu)
3. **Fase 3 — Timeout/remarketing** (cron job)

Cada fase é independente e entregável. A fase 1 já te dá o roteamento por resultado do agente sem tocar no que funciona hoje.

