
# Correção da contagem de documentos e unificação de campos

## Problemas identificados

1. **Badge "8 docs" com apenas 5 documentos**: A IA está listando cada *ocorrência* de um campo no template (ex: "cidade" aparece no endereço E na assinatura do mesmo documento = 2 entradas). O badge mostra `mappedFields.length` (total de mapeamentos) em vez de contar **templates únicos**.

2. **Campo "CPF do segurado preso" sumiu**: O prompt da IA está instruindo a unificar campos demais — campos que se referem a **entidades diferentes** (segurado preso vs. responsável) estão sendo mesclados incorretamente.

3. **Campos duplicados dentro do mesmo template**: A IA precisa ser instruída explicitamente que se um campo aparece 2x no mesmo documento, é uma única entrada.

## Plano de implementação

### 1. Corrigir o prompt da IA (`unify-pack-fields/index.ts`)

- Adicionar instrução clara: **deduplicar campos dentro do mesmo template** — se "cidade" aparece 2x no template X, gerar apenas 1 entrada `{fieldName: "cidade", templateId: X}`.
- Adicionar regra: **NÃO unificar campos que se referem a entidades/pessoas diferentes**. "CPF do segurado preso" ≠ "CPF do responsável". Apenas unificar quando o dado é literalmente o mesmo.
- Adicionar regra: **todo campo original deve aparecer em pelo menos um grupo** — nenhum campo pode ser descartado.

### 2. Corrigir badge de contagem no `PackEditor.tsx`

Mudar a lógica do badge de `mappedFields.length` para contar **templateIds únicos**:

```
const uniqueDocCount = new Set(mappedFields.map(mf => mf.templateId)).size;
```

### 3. Corrigir classificação shared vs unique

Atualmente usa `mappedFields.length > 1` para decidir se é compartilhado. Deve usar **templateIds únicos > 1** — um campo que mapeia 3 nomes diferentes no mesmo template é "unique", não "shared".

### Arquivos alterados
- `supabase/functions/unify-pack-fields/index.ts` — prompt refinado
- `src/components/documents/PackEditor.tsx` — lógica de contagem e classificação
