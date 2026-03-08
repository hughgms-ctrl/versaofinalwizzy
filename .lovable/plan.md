

# Remarketing Sequencial com IA no Bloco de Conteúdo

## O que muda

Hoje o "Aguardar resposta" tem apenas 1 timeout simples. A proposta é substituir isso por uma **sequência de follow-ups** configurável, onde cada tentativa tem seu próprio intervalo e mensagem gerada por IA, mais uma ação final (ex: marcar como perdido).

## Como funciona

```text
┌──────────────────────────────┐
│  Bloco de Conteúdo           │
│  [items...]                  │
│  ☑ Aguardar resposta         │
│  Variável: {{nome}}          │
│                              │
│  Sequência de Follow-up:     │
│  ┌────────────────────────┐  │
│  │ 1. Após 4m33s          │  │
│  │ 2. Após 10min          │  │
│  │ 3. Após 30min          │  │
│  │ 4. Após 1h             │  │
│  │ 5. Após 1 dia          │  │
│  │ 6. Após 3 dias         │  │
│  └────────────────────────┘  │
│                              │
│  [🤖 Gerar mensagens com IA] │
│                              │
│  Contexto p/ IA: "Estou     │
│  perguntando o nome do       │
│  cliente para cadastro"      │
│                              │
│  Após esgotar tentativas:    │
│  → Saída vermelha (timeout)  │
├──────────────────────────────┤
│  ● Verde  → Respondeu        │
│  ● Vermelho → Esgotou        │
└──────────────────────────────┘
```

### Modelo de dados (remarketing steps)

```typescript
interface RemarketingStep {
  id: string;
  delayMinutes: number;    // 4.55, 10, 30, 60, 1440, etc.
  message: string;         // Gerado pela IA ou manual
}

// No node data do content-block:
{
  waitForResponse: true,
  saveVariable: 'nome',
  remarketingSteps: RemarketingStep[],  // substitui timeoutMinutes
  remarketingContext: string,           // contexto para IA gerar mensagens
  remarketingFinalAction: 'timeout' | 'none',  // o que fazer no final
}
```

### Motor (process-flow-timeouts)

Hoje o cron verifica `timeout_at` e redireciona pela saída vermelha. A mudança:

1. `flow_executions` ganha campo `remarketing_step` (int, default 0) — qual step está no momento
2. Quando o cron detecta timeout:
   - Lê o `remarketing_step` atual e os `remarketingSteps` do nó
   - Se ainda há steps restantes: **envia a mensagem do step**, incrementa `remarketing_step`, seta novo `timeout_at` para o próximo intervalo, **mantém status `waiting_input`**
   - Se esgotou todos os steps: segue pela saída vermelha (timeout)
3. A qualquer momento, se o usuário responde, o fluxo segue pela saída verde normalmente (ignora remarketing restante)

### Botão "Gerar mensagens com IA"

- Chama uma edge function `generate-remarketing-messages` que recebe:
  - `context`: o que está sendo perguntado
  - `steps`: array com os intervalos configurados
- A IA gera mensagens naturais e variadas para cada intervalo, adaptando o tom (mais casual no curto prazo, mais formal/urgente nos intervalos longos)
- Preenche automaticamente o campo `message` de cada step

### UI do editor (NodePropertiesPanel)

Quando "Aguardar resposta" está ativo:
- Lista de steps com: seletor de tempo (presets: 4m33s, 10min, 30min, 1h, 2h, 1d, 3d, 5d, 10d + custom) + textarea da mensagem
- Botão "+ Adicionar tentativa" 
- Textarea "Contexto para IA" + botão "🤖 Gerar mensagens"
- O campo `timeoutMinutes` simples desaparece, substituído pelos steps

## Arquivos a modificar

| Arquivo | Mudança |
|---------|---------|
| `src/types/flow.ts` | Adicionar `RemarketingStep` interface |
| `src/components/flow/NodePropertiesPanel.tsx` | Editor de remarketing steps + botão gerar com IA |
| `src/components/flow/nodes/ContentBlockNode.tsx` | Mostrar quantidade de steps no nó visual |
| `supabase/functions/process-flow-timeouts/index.ts` | Lógica de multi-step: enviar mensagem, avançar step ou finalizar |
| `supabase/functions/generate-remarketing-messages/index.ts` | **NOVA** — IA gera mensagens para cada step |
| Migration | Adicionar coluna `remarketing_step` (int default 0) em `flow_executions` |

## Retrocompatibilidade

- Blocos com `timeoutMinutes` antigo (sem `remarketingSteps`) continuam funcionando — o cron trata como step único
- Blocos sem "aguardar resposta" não são afetados
- A saída verde/vermelha continua idêntica

