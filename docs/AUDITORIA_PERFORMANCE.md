# Relatório de Auditoria de Performance — Wizzy

**Data:** 2026-06-12 · **Escopo:** banco (181 migrations, ~120 tabelas), 106 Edge Functions, frontend React/TanStack Query.
**Natureza:** diagnóstico apenas — nenhuma alteração foi aplicada.

> Achados centrais verificados na fonte: (1) realtime de `messages` sem filtro de org; (2) `auto-close-conversations` sem `.limit()`; (3) 290 políticas RLS usam `auth.uid()` direto; (4) ~19 tabelas de log/auditoria sem retenção/particionamento; (5) dashboard com polling de 15–60 s e N+1.

---

## 1. Políticas RLS — `auth.uid()` reavaliado por linha  · **CRÍTICA**
- **Motivo técnico:** das 290 políticas (`CREATE POLICY`) e 347 chamadas de `auth.uid()`, **nenhuma** usa o padrão `(select auth.uid())`. "Nu" no predicado, o Postgres reavalia a função STABLE (e os helpers `SECURITY DEFINER` que fazem SELECT interno) **uma vez por linha varrida**.
- **Impacto:** numa listagem de 10.000 mensagens/contatos, são 10.000 chamadas de função + SELECT interno em `profiles`/`organization_members` em vez de 1. CPU e latência crescem linearmente; domina o custo das telas de chat/feed. Ganho típico documentado pela Supabase: 90–99 %.
- **Solução:** varredura mecânica em ~72 arquivos trocando `auth.uid()` → `(select auth.uid())`.
```sql
-- ANTES
USING (organization_id = public.get_user_org_id(auth.uid()))
-- DEPOIS
USING (organization_id = public.get_user_org_id((select auth.uid())))
```

## 2. Realtime de `messages` sem filtro de organização  · **CRÍTICA**
- **Local:** `src/hooks/useNewMessageNotifications.ts:167-176` (montado global em `NotificationProvider`).
- **Motivo técnico:** o canal escuta INSERT em `messages` com `filter: 'direction=eq.inbound'` — **sem `organization_id`**. Todo cliente logado recebe evento de qualquer mensagem inbound de **qualquer tenant**, e para cada evento dispara um `SELECT` em `conversations` (linha 188).
- **Impacto:** conexões/banco/CPU escalam com o volume **global** da plataforma, não com a org. Vazamento parcial de metadados multi-tenant. Maior risco de escalabilidade do projeto.
- **Solução:** adicionar `organization_id=eq.${orgId}` ao filtro e ao nome do canal; enriquecer o payload para eliminar o SELECT pós-evento.

## 3. `auto-close-conversations` carrega histórico inteiro de mensagens  · **CRÍTICA**
- **Local:** `supabase/functions/auto-close-conversations/index.ts:48-52`.
- **Motivo técnico:** para descobrir a direção da **última** mensagem, faz `messages.select(...).in('conversation_id', ids)` (até 500 conversas) `.order('created_at', desc)` **sem `.limit()`**, e deduplica em JS via `Map`. Repetido **por organização**.
- **Impacto:** risco real de OOM no worker; leitura pesada repetida; ordenação de centenas de milhares de linhas.
- **Solução:** desnormalizar `last_message_direction` em `conversations` (atualizar no webhook) e fechar via `UPDATE ... WHERE status='open' AND last_message_at < cutoff AND last_message_direction='outbound'`, eliminando a leitura de `messages`. Alternativa: RPC `DISTINCT ON (conversation_id) ... ORDER BY conversation_id, created_at DESC`.

## 4. Dashboard — N+1 + polling agressivo (15–60 s)  · **CRÍTICA (efeito cumulativo)**
- **Locais:** `src/hooks/useDashboardData.ts` (intervalos 15s/30s/60s nas linhas 216, 303, 403, 480, 562, 654, 727, 785, 847) e `usePipelineStats.ts` (48, 103). Montados juntos em `src/pages/Index.tsx`.
- **Motivo técnico:** com o dashboard aberto há ~7 queries em polling; várias internamente fazem N+1:
  - `useRecentConversations` (`useDashboardData.ts:449`): 1 SELECT de última mensagem **por conversa** (20×) a cada **15 s**.
  - `useReportsAgentPerformance` (`:820`) e `useTeamPerformanceByPipeline` (`usePipelineStats.ts:79`): 1 `count` **por membro** da equipe, em loop serial, a cada 60 s.
  - Métricas (`:137-199`, `264-283`): `select('id')` de todas as conversas → `.in('conversation_id', [milhares de UUIDs])` em `messages`, com dedup no cliente.
- **Impacto:** dezenas de round-trips por tick, multiplicado por nº de usuários com a aba aberta; banco/conexões/CPU constantes mesmo ociosos.
- **Solução:** consolidar em 1–2 RPCs server-side (`get_dashboard_metrics`, `get_pipeline_stats` com `GROUP BY`); elevar piso de polling para 60 s; pausar quando `document.visibilityState !== 'visible'`.

## 5. `zapi-cleanup` — full-table scans + ação cross-org  · **ALTA**
- **Local:** `supabase/functions/zapi-cleanup/index.ts` (106, 518, 467).
- **Motivo técnico:** `contacts.select('*').eq('organization_id', org)` sem limite; `messages.select(...).not('zapi_message_id','is',null)` **sem limite** (dedup em `Map` no JS); modo `forceCleanup` itera **todas** as organizações.
- **Impacto:** OOM em orgs grandes; varredura full-table + milhares de DELETE/UPDATE; risco de lock e execução para toda a plataforma.
- **Solução:** mover dedup para SQL (`DELETE ... USING` com `row_number() OVER (PARTITION BY zapi_message_id)`); paginar; restringir o modo emergência e rodar org-a-org em background.

## 6. `process-scheduled-messages` — N+1 de envio em cron de 1 min  · **ALTA**
- **Local:** `supabase/functions/process-scheduled-messages/index.ts:88, 252, 385`.
- **Motivo técnico:** por contato faz SELECT/INSERT em `conversations`, INSERT em `messages`, UPDATE em `conversations` e `scheduled_message_contacts`, com `setTimeout(delayMs)` segurando a conexão. Campanha de tag → milhares de contatos → ~25.000 queries sequenciais num único invoke, a cada minuto.
- **Impacto:** 1 conexão presa por minutos/horas; risco de estourar o wall-time do Edge e deixar mensagens órfãs em `processing`.
- **Solução:** carregar conversas em lote (`.in('contact_id', ids)`), inserir `messages` em lote, e mover o delay para reagendamento via `campaign_queue` em vez de `setTimeout`. Limitar contatos por invoke (ex.: 200) com paginação.

## 7. `import-whatsapp-history` + RPC de auditoria por mensagem  · **ALTA**
- **Local:** `import-whatsapp-history/index.ts:214, 345`; RPC `record_conversation_origin_audit` (`migrations/20260612143000_*.sql`).
- **Motivo técnico:** mensagens são upsertadas em lote (bom), mas em seguida há `for (const message of inserted)` chamando a RPC **1× por mensagem** — e a RPC faz 2-3 queries internas. 10 chats × 1.000 msgs = 10.000 RPCs sequenciais. A mesma RPC é chamada em loop por `zapi-sync-messages` e `zapi-sync-chats`.
- **Impacto:** explosão de RPCs, quase garantido estourar timeout; `conversation_origin_audit` cresce 1 linha por mensagem (append-only ilimitado).
- **Solução:** auditar **por conversa**, não por mensagem; variante batch da RPC; retenção/partição para `conversation_origin_audit`.

## 8. `process-flow-timeouts` — varreduras múltiplas + N subqueries  · **ALTA**
- **Local:** `process-flow-timeouts/index.ts` (306, 350 `limit 200`, 392, 418).
- **Motivo técnico:** 3 varreduras de `flow_executions` por invoke; no loop, 2-3 SELECTs em `messages` por execução (`contactRespondedAfterLastFollowUp`) + `conversations`/`contacts`/`whatsapp_instances`. ~300+ queries/min. Falta índice `flow_executions(status, remarketing_step, timeout_at)`.
- **Impacto:** QPS alto, conexão presa, risco de timeout.
- **Solução:** pré-carregar conversas/contatos/instâncias em lote; unificar `contactRespondedAfterLastFollowUp` em 1 query; criar o índice composto.

## 9. `agent-orchestrator` — caminho quente com `select('*')` e polling  · **ALTA**
- **Local:** `agent-orchestrator/index.ts` (170-186, 325, 496).
- **Motivo técnico:** (a) polling `while` de até 5×`setTimeout(1000)` em `media_transcriptions` (5 s de conexão presa por mídia); (b) `Promise.all` de 13 queries **por mensagem**, incluindo `messages.select('*').limit(80)` (traz `metadata`/mídia de 80 msgs); (c) INSERT em `agent_execution_logs` a cada execução; (d) encadeia fetch Edge→Edge.
- **Impacto:** é o caminho mais quente do produto — alto consumo de conexões, CPU e memória por turno de IA.
- **Solução:** trocar polling por trigger/realtime ou payload; restringir colunas do `messages.select`; cachear tags/pipelines/agents por org com TTL curto.

## 10. Tabelas de log/auditoria sem retenção nem particionamento  · **ALTA**
- **Motivo técnico:** só existem 2 `cron.schedule` (ambos de processamento, não limpeza). **Nenhum** `DELETE ... WHERE created_at <`, nenhuma `PARTITION`. Crescem monotonicamente: `messages`, `agent_execution_logs`, `flow_node_logs`, `whatsapp_connection_logs`, `billing_events`, `governance_*`, `admin_audit_logs`, `conversation_stage_history`, `conversation_origin_audit`, `entry_flow_events`, `campaign_webhook_logs`, `case_activity_log`, `drive_backup_logs`, `campaign_queue` (processados nunca apagados), `media_transcriptions`, `widget_submissions`, `quiz_submissions`.
- **Impacto:** índices inflados, vacuum caro, cache degradado, custo de disco/backup crescente; `messages` está em `supabase_realtime` (replica cada INSERT).
- **Solução:** retenção via `pg_cron` (extensão já habilitada) para logs puros; particionar `messages` por `RANGE (created_at)` mensal (permite `DROP PARTITION` instantâneo). Não apagar auditoria legal (`billing_events`, `admin_audit_logs`, `conversation_origin_audit`, `signature_evidence`) — arquivar.
```sql
SELECT cron.schedule('purge-flow-node-logs','0 3 * * *',
  $$DELETE FROM public.flow_node_logs WHERE created_at < now() - interval '90 days';$$);
SELECT cron.schedule('purge-wa-conn-logs','0 3 * * *',
  $$DELETE FROM public.whatsapp_connection_logs WHERE created_at < now() - interval '90 days';$$);
SELECT cron.schedule('purge-campaign-queue-done','0 4 * * *',
  $$DELETE FROM public.campaign_queue WHERE status IN ('sent','failed') AND processed_at < now() - interval '30 days';$$);
SELECT cron.schedule('purge-contact-presence','*/15 * * * *',
  $$DELETE FROM public.contact_presence WHERE expires_at < now();$$);
```

## 11. FK columns sem índice  · **ALTA**
- **Motivo técnico:** Postgres não cria índice para FK. Sem índice na coluna filha, todo `ON DELETE CASCADE` e JOIN faz seq scan. Deletar uma org varre dezenas de tabelas inteiras.
- **Lacunas:** `conversations(contact_id, assigned_to, whatsapp_instance_id)`, `messages(sent_by)`, `profiles(organization_id)`, `user_roles(organization_id)`, `campaign_queue(organization_id, campaign_id, conversation_id, contact_id)`, `calendar_bookings(organization_id, contact_id)`, `billing_events(organization_id)`, `flow_node_logs(organization_id)`, `case_activity_log(organization_id)`, `entry_flow_events(organization_id)`.
- **Solução:** (não duplicar os já criados em `20260610213000`)
```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_contact_id ON public.conversations(contact_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_assigned_to ON public.conversations(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_sent_by ON public.messages(sent_by) WHERE sent_by IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_organization_id ON public.profiles(organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_campaign_queue_org ON public.campaign_queue(organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_calendar_bookings_org_starts ON public.calendar_bookings(organization_id, starts_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_billing_events_org_created ON public.billing_events(organization_id, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_org_members_user ON public.organization_members(user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workspace_members_user_ws ON public.workspace_members(user_id, workspace_id);
```
> `CREATE INDEX CONCURRENTLY` não roda em bloco transacional — uma migração por índice.

## 12. RLS com `EXISTS`+JOIN por linha (tasks/cases)  · **ALTA**
- **Local:** políticas de `subtasks`, `task_assignees`, `task_processes`, `task_attachments`, `task_external_assignees` (`20260610184500`), `case_tasks` (`20260420163618`), `messages`.
- **Motivo técnico:** cada linha avalia `EXISTS (SELECT 1 FROM tasks t LEFT JOIN projects p ... WHERE ... user_has_workspace_access(auth.uid(), ...))` — JOIN + 2 helpers `SECURITY DEFINER` por linha, somado ao item 1.
- **Solução:** após o item 1, **denormalizar `workspace_id`/`organization_id`** nas tabelas filhas e comparar direto, sem JOIN.

## 13. `useMessageSearch` — `ILIKE '%termo%'` em `messages`  · **ALTA**
- **Local:** `src/hooks/useMessageSearch.ts:19-24`.
- **Motivo técnico:** curinga à esquerda não usa B-tree → sequential scan na maior tabela, a cada tecla (sem debounce).
- **Solução:** FTS (`tsvector` + GIN) ou `pg_trgm` via RPC; debounce no input.
```sql
ALTER TABLE public.messages ADD COLUMN content_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('portuguese', coalesce(content,''))) STORED;
CREATE INDEX CONCURRENTLY idx_messages_content_tsv ON public.messages USING gin(content_tsv);
```

## 14. Over-fetching no frontend (sem `.limit()`/paginação)  · **ALTA**
- `useMessages` (`useConversations.ts:183`): `select('*')` de **todas** as mensagens da conversa, sem limite, re-trazidas a cada evento realtime. → paginação por cursor `.limit(50)`.
- `useContacts` (`useContacts.ts:37`): `select('*', tags...)` da tabela inteira de contatos, sem `.limit()`/`.range()`. → paginação server-side + virtualização.
- `useConversations` (limite fixo 1000): `select('*')` + joins; esconde conversas além de 1000. → infinite scroll + colunas explícitas.
- `useFlowFolders.ts:348`: `select('*')` em `flows` (JSON `nodes/edges` grandes) sem filtro de org visível. → listar só metadados.

## 15. Realtime mal escopado (além do item 2)  · **ALTA/MÉDIA**
- `usePipelineRealtime.ts:43-75`: UPDATE de `conversations` **sem filtro** → cada update de qualquer org dispara `refetchQueries(['conversations'])` (1000 linhas). Filtrar por org + debounce.
- `useContactPresence.ts:42,68`: 1 canal websocket **+ `setInterval(5000)` por contato**. Em listas, churn alto. → canal único por workspace.
- `useFollowUpStatus.ts:14-52`: realtime `*` em `flow_executions` sem filtro de org **+** `refetchInterval:30000` redundante. → filtrar org, remover polling.

## 16. Agregação no cliente / oportunidades de RPC e cache  · **MÉDIA/ALTA**
- `getWorkspaceConversationIds` (`useDashboardData.ts:41`) re-executada ~9× por ciclo de polling. → cachear como query própria ou resolver dentro da RPC.
- `usePipelineStageDistribution` (`usePipelineStats.ts:30`): conta posições em JS. → `GROUP BY column_id` no banco.
- QueryClient global com `staleTime` 30 s (`App.tsx:70`): dados de config (tags, pipelines, statuses, workspaces) revalidam à toa. → `staleTime` de 5–30 min por hook estático.

## 17. Índices compostos de feed ausentes  · **MÉDIA**
```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contacts_org_created ON public.contacts(organization_id, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_case_activity_org_created ON public.case_activity_log(organization_id, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stage_history_conv_created ON public.conversation_stage_history(conversation_id, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_flow_executions_timeout ON public.flow_executions(status, remarketing_step, timeout_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_entry_flow_events_name_user ON public.entry_flow_events(event_name, user_id, created_at);
```

## 18. Demais achados  · **MÉDIA/BAIXA**
- `case-notifications`: N+1 de `profiles` em 4 loops + janela de 30 dias filtrada em JS → 1 `profiles.in(ids)` + filtro de data no SQL.
- `backfill-contact-avatars`: SELECT de 2000 contatos para processar 60 → `.limit(batchSize)` + cursor.
- `zapi-sync-messages`: SELECT de checagem + INSERT por mensagem → `upsert(onConflict, ignoreDuplicates)`.
- `process-checkout-recovery`: `entry_flow_events.select('*')` + Auth/Resend sequencial por evento → colunas específicas + concorrência limitada.
- `createClient` por request em todas as functions → instanciar o client `service_role` em escopo de módulo.
- Geração de PDF/carrossel (`generate-document-pdf`, `signature-stamp-pdf`, `carousel-*`): buffers grandes em memória → revisar limites e streaming.

---

# 🏆 Top 10 maiores vilões de performance

| # | Vilão | Gravidade | Por que dói |
|---|-------|-----------|-------------|
| 1 | **RLS com `auth.uid()` reavaliado por linha** (290 políticas) | Crítica | Multiplica CPU por nº de linhas em TODA query autenticada — afeta o sistema inteiro. |
| 2 | **Realtime de `messages` sem filtro de org** (`useNewMessageNotifications`) | Crítica | Cada cliente recebe eventos de todos os tenants + 1 SELECT por evento; escala com o volume global. |
| 3 | **`auto-close-conversations` sem `.limit()`** | Crítica | Carrega histórico inteiro de até 500 conversas/org na memória do worker — OOM. |
| 4 | **Dashboard: N+1 + polling 15–60 s** (`useDashboardData`) | Crítica | Dezenas de round-trips por tick × nº de usuários com a aba aberta. |
| 5 | **`zapi-cleanup` full-table scan cross-org** | Alta | Varre `messages`/`contacts` inteiros sem limite; modo emergência roda para toda a plataforma. |
| 6 | **`process-scheduled-messages` N+1 (cron 1 min)** | Alta | ~25k queries sequenciais por campanha grande, conexão presa por `setTimeout`. |
| 7 | **`import-whatsapp-history` + RPC de auditoria por mensagem** | Alta | 1 RPC (2-3 queries) por mensagem importada → 10k+ RPCs, timeout. |
| 8 | **Tabelas de log/auditoria sem retenção/partição** (~19) | Alta | Crescimento infinito infla índices, vacuum e disco; degrada tudo com o tempo. |
| 9 | **FK columns sem índice** (conversations, campaign_queue, etc.) | Alta | Seq scan em cascade-delete e JOINs; deletar org varre dezenas de tabelas. |
| 10 | **`agent-orchestrator`: `select('*')` de 80 msgs + polling** (caminho mais quente) | Alta | Consome conexões/CPU/memória em cada turno de IA do produto. |

---

## Plano de execução sugerido (ordem de risco × esforço)
1. **Quick wins de baixo risco:** filtro de org no realtime (itens 2, 15); reescrever RLS para `(select auth.uid())` (item 1); índices de FK via `CREATE INDEX CONCURRENTLY` (itens 11, 17).
2. **Edge Functions:** desnormalizar `last_message_direction` (item 3); auditoria por conversa (item 7); batch em `process-scheduled-messages` (item 6).
3. **Dashboard:** consolidar em RPCs `GROUP BY` + reduzir polling (item 4).
4. **Retenção/limpeza:** jobs `pg_cron` (item 10); FTS para busca (item 13).
5. **Estrutural (janela):** particionar `messages`; denormalizar workspace nas tabelas filhas de tasks (item 12).
