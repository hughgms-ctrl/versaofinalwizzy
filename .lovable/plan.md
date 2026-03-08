

# Plano: Corrigir Erros de Build

## Correção 1: `supabase/functions/zapi-webhook/index.ts`

**Problema:** `handleReadReceipt` (linha 778) e `handlePresence` (linha 806) estão definidas DENTRO de `handleMessage` (aberta na linha 168). Por isso não são encontradas nas linhas 129/134.

**Correção:** Adicionar `}` na linha 777 para fechar `handleMessage` antes de `handleReadReceipt`. As funções `handleReadReceipt`, `handlePresence` e os helpers passam a ser funções de nível superior.

Concretamente, entre as linhas 776 e 778, trocar:
```
    return respond({ success: true, messageId: savedMessage.id });
  }

  async function handleReadReceipt(...) {
```
Por:
```
    return respond({ success: true, messageId: savedMessage.id });
  }
}

async function handleReadReceipt(...) {
```

---

## Correção 2: `src/components/flow/FlowTestPanel.tsx`

**Problema:** Linhas 393-394 e 542-543 consultam tabela `'agents'` (não existe) com campo `prompt` (não existe).

**Correção (2 locais):**
- Linha 394: `.from('agents' as any)` → `.from('ai_agents')`
- Linha 395: `.select('prompt, name')` → `.select('prompt_base, name')`
- Linha 399: `agentData?.prompt` → `agentData?.prompt_base`
- Linha 401: `agentData.prompt` → `agentData.prompt_base`
- Linha 543: `.from('agents' as any)` → `.from('ai_agents')`
- Linha 544: `.select('prompt')` → `.select('prompt_base')`
- Linha 548: `agentData?.prompt` → `agentData?.prompt_base`
- Linha 549: `agentData.prompt` → `agentData.prompt_base`

---

Ambas são correções cirúrgicas que resolvem os 4 erros de build sem alterar lógica.

