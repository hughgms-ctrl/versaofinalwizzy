

# Plano: extrair regras de qualificação do prompt do nó com IA

## O problema

Hoje o usuário precisa:
1. Escrever todas as regras de qualificação **dentro do prompt do nó** (campo "Instruções")
2. **Repetir** essas mesmas regras no painel de "Regras de Qualificação"

Isso é trabalho duplicado e gera inconsistência (regra muda no prompt mas não no checklist, ou vice-versa).

## Solução: botão "Extrair regras com IA"

Adicionar no `QualificationRulesPanel.tsx` (quando aberto dentro do nó do flow) um botão **"✨ Extrair regras do prompt"** que:

1. Lê o `prompt` do nó atual (campo `node.data.prompt`)
2. Envia para uma nova edge function `extract-qualification-rules`
3. A IA analisa o prompt e retorna uma lista estruturada de critérios de qualificação
4. Mostra preview das regras extraídas em um dialog
5. Usuário marca quais quer importar (todas selecionadas por padrão)
6. Ao confirmar, cria as regras no banco vinculadas ao `flow_id` + `node_id`

## Como a IA identifica regras

O prompt do sistema da edge function vai instruir a IA a procurar por:
- Critérios numéricos (idade mínima, tempo de contribuição, valor)
- Condições obrigatórias ("precisa ter", "deve possuir", "é necessário")
- Listas de qualificação ("aceita se", "qualifica quando")
- Requisitos legais (CPF válido, documento X, condição Y)

E retornar via **tool calling** (saída estruturada) no formato:
```json
{
  "rules": [
    { "label": "Idade mínima", "criteria": "Cliente deve ter 60+ anos" },
    { "label": "Tempo de contribuição", "criteria": "Mínimo 15 anos de INSS" }
  ]
}
```

## Mudanças

### Nova edge function
- `supabase/functions/extract-qualification-rules/index.ts` — recebe `{ prompt, organizationId }`, usa Lovable AI Gateway com `google/gemini-3-flash-preview` e tool calling para retornar regras estruturadas. Reaproveita o padrão `resolveAIConfig` já usado em `generate-agent-prompt`.

### Frontend
- `src/components/agents/QualificationRulesPanel.tsx`:
  - Aceitar nova prop `sourcePrompt?: string`
  - Botão "✨ Extrair do prompt" (só aparece quando `sourcePrompt` existe e não está vazio)
  - Dialog de preview com checkboxes para confirmar quais regras importar
  - Loading state durante extração
- `src/components/flow/NodePropertiesPanel.tsx`:
  - Passar `sourcePrompt={node.data.prompt}` ao `QualificationRulesPanel`

### Resposta direta à dúvida do usuário

**"Preciso colocar as regras no painel se já estão no prompt?"**
- **Recomendado sim**, porque o checklist é o que **força a IA a validar item por item antes de rejeitar**. As regras no prompt são prosa (fáceis de pular); o checklist é estruturado (obrigatório marcar ✓/✗/?).
- Mas com o botão "Extrair com IA" isso vira **1 clique** em vez de redigitar tudo.

## Resumo do fluxo de uso

```text
[Nó "Agente de IA" no flow]
  → aba "Regras de Qualificação"
  → clica "✨ Extrair do prompt"
  → IA lê o prompt do nó
  → mostra preview: [✓] Idade 60+  [✓] 15 anos INSS  [✓] Doença grave
  → usuário desmarca o que não quer e clica "Importar"
  → regras criadas no banco vinculadas ao node_id
```

