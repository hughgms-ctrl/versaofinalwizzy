

# Plano: data atual no contexto + roteamento correto de rejeição

Aplicar 4 alterações cirúrgicas em `supabase/functions/agent-orchestrator/index.ts`. **Nenhum prompt do usuário será alterado** — apenas blocos novos serão *anexados* ao `systemPrompt` montado pelo sistema. Persona, prompt base, prompt do nó (`additionalPrompt`/`additionalContext`) e regras de treinamento permanecem 100% intactos.

## 1. Helper de contexto temporal (novo)

Criar função utilitária que recebe a timezone da organização e devolve um bloco pronto:

```text
# CONTEXTO TEMPORAL (CRÍTICO):
- Data e hora atual: terça-feira, 22/04/2026 14:37 (fuso America/Sao_Paulo)
- Ano atual: 2026
- Use estas informações para calcular datas relativas ("ano passado",
  "mês passado", "semana passada") SEMPRE em relação à data atual acima,
  nunca em relação a outras datas mencionadas na conversa.
- Quando o cliente disser apenas "DD de MMMM" sem ano:
  • Se a data resultante já passou ou é hoje → mantenha o ano atual.
  • Se a data ainda não chegou neste ano e o contexto sugere passado → use o ano anterior.
  • Em dúvida, PERGUNTE o ano explicitamente em vez de assumir.
```

A timezone vem de `organizations.timezone` (já existe no contexto, default `America/Sao_Paulo`). Formatado via `Intl.DateTimeFormat('pt-BR', { timeZone })`.

## 2. Injetar o bloco temporal em 3 pontos

Anexar (`+=`) o bloco em:
- **`invokeAgentAI`** (~linha 1212, antes do `# INSTRUÇÕES ESPECÍFICAS`)
- **`buildLegacySystemPrompt`** (~linha 2667, antes do bloco `INSTRUÇÕES ESPECÍFICAS`)
- **Simulação** (~linha 491, mesma posição)

Nenhuma string existente é removida — só adição de um bloco novo entre seções.

## 3. Corrigir roteamento de rejeição (itens 3, 4, 5)

**a)** Em `inferOutcomeFromReply` (linha 2592), adicionar sentinela:
```typescript
// Se há cue negativo claro mas o nó não tem outcome negativo configurado,
// sinalizar para o caller NÃO cair no default (que é qualificado).
if (hasNegativeCue && !negativeOutcome) return '__NEGATIVE_NO_HANDLE__';
```

**b)** Nos 3 pontos de roteamento (linhas ~872, ~2231, ~2387), tratar o sentinela:
- Se `outcome === '__NEGATIVE_NO_HANDLE__'`: **NÃO** procurar `outcome-default`. Em vez disso:
  - Marcar `flow_executions.status = 'completed'` com `ai_resultado: 'desqualificado'`
  - Limpar `ai_handoff_context` da conversa
  - `service_mode = 'humano'` (sem disparar próximo nó)
- Se há `negativeOutcome` configurado, fluxo segue normalmente pelo handle de desqualificação.

**c)** Adicionar instrução curta no bloco `INSTRUÇÕES IMPORTANTES` do prompt do sistema (linha ~1267 e equivalentes), também por anexação:
```text
- Se você está REJEITANDO ou DESQUALIFICANDO o cliente, ao chamar
  finalizar_interacao, use resultado="desqualificado" (ou termo equivalente
  que apareça nos outcomes do nó). NUNCA use resultado positivo quando a
  mensagem enviada é uma rejeição/encerramento negativo.
```

## 4. Validação

- `deno check` no arquivo modificado.
- `curl` ao orquestrador em modo simulação com 2 cenários: cliente diz "ano passado" (verifica cálculo correto) e cliente diz "já tenho advogado" (verifica que NÃO segue para fluxo de qualificado).

## Arquivos afetados

- `supabase/functions/agent-orchestrator/index.ts` (única edição)

## Garantias

- **Prompt base do agente, persona, prompt do nó e regras de treinamento ficam intocados.** As mudanças só ADICIONAM blocos do sistema antes/depois do conteúdo do usuário.
- Nenhum comportamento existente é removido — fluxos com outcome negativo configurado continuam funcionando exatamente igual.
- Nenhuma alteração de schema, nenhuma migração necessária.

