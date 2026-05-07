# Plano de implementação

## 1. Notificações por workspace (CRM)

**Mudanças:**
- Migração: adicionar coluna `workspace_id uuid` em `stage_notifications` (nullable). Trocar a unique key de `(pipeline_id, column_id)` para `(pipeline_id, column_id, workspace_id)` (com `NULL` permitido representando "global / sem workspace").
- Edge function `stage-notification`: receber `workspaceId` (vindo da conversa) e priorizar config específica do workspace; cair no global apenas se não houver específica.
- Onde a notificação é disparada (mover lead): buscar `conversation.workspace_id` e passar ao edge.
- UI `PipelineSettingsDialog.tsx`: na aba "Notificações", para cada coluna, mostrar um seletor de workspace (multi-tab/seletor) e configurar os usuários a notificar **por workspace**. Opção "Padrão (todos)" = `workspace_id NULL`.

## 2. IA parando de responder (estabilidade)

**Diagnóstico provável** (com base no código atual do `agent-orchestrator`):
- AbortController de 25s pode cortar antes da resposta em respostas longas → vou subir para 40s onde apropriado e adicionar retry simples (1 tentativa) em caso de timeout/5xx.
- Falhas silenciosas em `runBackground` no webhook → adicionar `.catch()` com log estruturado.
- Em casos de `flow_ended_at` sem reset adequado, conversa fica em modo IA mas sem nó atual → já tem mitigação parcial; vou reforçar invariantes ao final de qualquer execução.

**Mudanças:**
- `agent-orchestrator`: helper `callAIWithRetry()` (1 retry com backoff curto em 408/429/5xx/AbortError).
- Reduzir chance de loop preso: log + early-return se faltar `current_node_id` esperado.

## 3. Mensagens fragmentadas (debounce de 8s)

**Estratégia (sem necessidade de cron novo):**
- No `zapi-webhook`, ao receber inbound de IA, em vez de chamar `agent-orchestrator` imediatamente:
  1. Gravar `conversation.metadata.pending_ai_trigger = { token: <uuid>, scheduled_at: ISO, last_message_id }`.
  2. Iniciar `setTimeout(8000)` em `runBackground`.
  3. Após 8s, reler conversa. Se `metadata.pending_ai_trigger.token` ainda for o mesmo token, disparar o orchestrator passando **as últimas N mensagens inbound não processadas concatenadas** como `messageContent`. Senão, abortar (outra invocação mais recente assume).
- Cada nova mensagem que chegar dentro da janela substitui o token, "estendendo" a janela.
- Marcar mensagens incluídas com `metadata.ai_batched_at` para evitar reprocessamento.

## 4. Desqualificação não roteia pela seta correta

**Causa observada:** o agente envia mensagem de despedida, mas (a) não chama `finalizar_interacao`, ou (b) chama com `resultado="concluido"`. Já existe safety net, mas falha quando o nó tem outcome negativo configurado e o agente passa o nome errado.

**Mudanças:**
- `agent-orchestrator`: ao processar `finalizar_interacao`, se `resultado` não casar com nenhum handle E houver cue de rejeição, tentar mapear automaticamente para o outcome negativo configurado (em vez de cair em `outcome-default`).
- Reforçar `inferOutcomeFromReply` para listar sinônimos: "desqualificado", "reprovado", "negado", "inapto", "não atende", "não se enquadra", "não preenche os requisitos", "infelizmente".
- Adicionar bloco no system prompt listando explicitamente: "Os handles de saída deste nó são X, Y, Z. Use EXATAMENTE um destes valores no campo `resultado`."

## 5. Tag automática ao entrar numa coluna

**Mudanças:**
- Migração: adicionar `auto_add_tag_ids uuid[]` (default `'{}'`) em `pipeline_columns`.
- `PipelineSettingsDialog.tsx`: para cada coluna, novo campo "Tags ao entrar nesta coluna" (multi-select de tags da org).
- `PipelineBoardV2.tsx` (handler de drop) e qualquer outro mover-coluna: ao mover, chamar `INSERT` em `contact_tags` para cada tag em `auto_add_tag_ids` (sem remover existentes; usa `ON CONFLICT DO NOTHING`).
- Mesmo comportamento quando o orquestrador/flow move a coluna automaticamente — usar trigger DB para garantir consistência (recomendado): `AFTER UPDATE OF column_id ON conversations` que insere tags da nova coluna no contato.

## Ordem de execução
1. Migrações DB (notificações, coluna de tags) — uma única migração.
2. Backend: edge functions (`stage-notification`, `zapi-webhook`, `agent-orchestrator`).
3. Frontend: `PipelineSettingsDialog` (notificações por workspace + tags por coluna), board (chamada com workspaceId).
4. Sugestões de prompt (texto para você colar nos agentes/master prompts) entregue na resposta final.
