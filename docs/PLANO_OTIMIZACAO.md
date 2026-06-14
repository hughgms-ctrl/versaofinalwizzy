# Plano de Execução — Otimização de Performance Wizzy

> **Como usar este documento:** o trabalho está dividido em **7 fases** ordenadas por risco × impacto. Cada fase é **autossuficiente** — pode ser executada após um `/clear`, bastando abrir este arquivo e o `docs/AUDITORIA_PERFORMANCE.md`. Marque `[x]` ao concluir. Faça **uma fase por vez**, valide, e só então avance.
>
> **Diagnóstico de origem:** `docs/AUDITORIA_PERFORMANCE.md`.
> **Regra de ouro:** trabalhar sempre em branch, validar cada item, nunca rodar duas fases de risco juntas.

> ## ⚠️ MECANISMO DE DEPLOY (lido na Fase 0 — vale para TODAS as fases de banco)
> `supabase migration list --linked` mostra a coluna **Remote vazia** para as 181 migrations: o histórico de migrations **não** está populado no banco remoto. As migrations são aplicadas via **Lovable sync** (não via `supabase db push`).
> - **NÃO rodar `supabase db push`** — ele tentaria replicar as 181 migrations do zero no banco de produção (destrutivo).
> - Mudanças de banco (índices, RLS, RPCs, cron, ALTER) devem ser aplicadas **manualmente no SQL Editor do Supabase** OU pelo fluxo Lovable usado hoje. O arquivo de migration em `supabase/migrations/` serve como registro/versionamento, mas a aplicação é manual/Lovable.
> - `psql` não está instalado na máquina e o `.env` só tem chaves anon — então toda query/DDL de banco roda no **SQL Editor**.

---

## Prompt para retomar após `/clear`

Cole isto após limpar o contexto:

```
Estou executando o plano em docs/PLANO_OTIMIZACAO.md (diagnóstico em docs/AUDITORIA_PERFORMANCE.md).
Vamos para a FASE <N>. Leia a fase no documento, execute os itens marcados como pendentes,
valide conforme a seção "Validação" e marque [x] os concluídos. Não avance de fase sem eu confirmar.
```

---

## Estado geral (atualize ao concluir cada fase)

- [~] **Fase 0** — Preparação e baseline *(branch + mecanismo de deploy OK; baseline SQL aguardando colar resultados em `docs/baseline_perf.md`)*
- [~] **Fase 1** — Quick wins: filtros de Realtime + RLS `(select auth.uid())` *(1A frontend ✅ feito e typecheck OK; 1B Lote 1 ✅ migration criada, aguardando aplicação manual no SQL Editor + smoke test. Lotes 2/3 pendentes.)*
- [ ] **Fase 2** — Índices (FK + compostos)
- [ ] **Fase 3** — Edge Functions críticas (OOM / N+1)
- [ ] **Fase 4** — Dashboard: RPCs + redução de polling
- [ ] **Fase 5** — Retenção/limpeza (pg_cron) + busca (FTS)
- [ ] **Fase 6** — Estrutural: particionamento e denormalização

---

# FASE 0 — Preparação e baseline

**Objetivo:** criar rede de segurança e medir o "antes" para comprovar ganho.

- [x] Criar branch: `git checkout -b perf/otimizacao` ✅ (branch ativa)
- [x] Confirmar acesso ao projeto Supabase (`project_id = zaobtetbjpuzibjymhzw`) ✅ — CLI linkado (v2.105). **Mecanismo: Lovable sync, NÃO `supabase db push`** (ver aviso no topo).
- [ ] **Baseline de queries lentas** — rodar no SQL Editor do Supabase e colar o resultado em `docs/baseline_perf.md` (scaffold já criado com as queries prontas):
```sql
-- Top 20 queries por tempo total (precisa de pg_stat_statements habilitado)
SELECT substr(query,1,120) AS query, calls, total_exec_time::int AS total_ms,
       mean_exec_time::int AS avg_ms, rows
FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 20;

-- Tamanho das tabelas (para priorizar partição/retenção)
SELECT relname, n_live_tup AS linhas, pg_size_pretty(pg_total_relation_size(relid)) AS tamanho
FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 25;

-- Seq scans em tabelas grandes (candidatas a índice)
SELECT relname, seq_scan, idx_scan, n_live_tup
FROM pg_stat_user_tables WHERE n_live_tup > 1000 ORDER BY seq_scan DESC LIMIT 20;
```
- [ ] Anotar nº de conexões em pico no painel Supabase (Database → Roles/Connections) para comparar depois.

**Validação:** `docs/baseline_perf.md` existe com os 3 resultados.

---

# FASE 1 — Quick wins: Realtime + RLS  ·  *baixo risco, impacto crítico*

**Contexto:** dois problemas sistêmicos de baixo risco e alto retorno. (1) Canais Realtime sem filtro de organização fazem cada cliente receber eventos de **todos os tenants**. (2) Todas as 290 políticas RLS usam `auth.uid()` "nu", reavaliado **por linha**.

## 1A — Escopar Realtime por organização

- [x] **`src/hooks/useNewMessageNotifications.ts`** (~linha 167): o canal escuta `messages` com `filter: 'direction=eq.inbound'`. Adicionar org e tornar o nome do canal único:
  > ✅ **Feito via fallback** — confirmado por Grep que `messages` **não tem coluna `organization_id`** (só `conversation_id`). Aplicado o caminho previsto: nome de canal único por org (`new-messages-notification:${selectedOrganizationId}`), `selectedOrganizationId` adicionado às deps (recria a inscrição ao trocar de org) e **validação explícita de `organization_id` no callback** (SELECT da conversa traz `organization_id`; ignora se ≠ org atual). Filtro de `direction=eq.inbound` mantido. Aberto TODO `perf/fase6` para adicionar `organization_id` em `messages` e filtrar no DB.
```ts
// obter orgId do contexto/auth antes do channel
.channel(`new-messages-notification:${organizationId}`)
.on('postgres_changes', {
  event: 'INSERT', schema: 'public', table: 'messages',
  filter: `organization_id=eq.${organizationId}`,  // <-- ADICIONAR (substitui direction)
}, async (payload) => { /* filtrar direction='inbound' no callback */ })
```
  > Pré-requisito: `messages` precisa ter `organization_id` populado. Confirmar com `Grep "organization_id" supabase/migrations` na tabela messages; se não existir a coluna no filtro realtime, usar `conversation_id` não resolve (não há lista) — nesse caso manter `direction` no filtro **e** validar `organizationId` no callback antes do SELECT, e abrir item de migração para adicionar `organization_id` em messages (já existe via scoping de instância — verificar).
- [x] **`src/hooks/usePipelineRealtime.ts`** (~43-75): adicionar `filter: organization_id=eq.${orgId}` ao UPDATE de `conversations`; trocar `refetchQueries` imediato por invalidate com debounce.
  > ✅ `selectedOrganizationId` via `useWorkspaceContext`; filtro `organization_id=eq.${orgId}` aplicado ao UPDATE de `conversations` (condicional — só quando há org). `refetchConversations` (refetch imediato) trocado por `invalidateConversations` com **debounce de 500ms** (coalesce de rajadas); timer limpo no cleanup. Eventos de posição/cards seguem com refetch imediato.
- [x] **`src/hooks/useFollowUpStatus.ts`** (~14): adicionar filtro de org no canal de `flow_executions` **e remover** o `refetchInterval: 30000` (linha ~52) — realtime já cobre.
  > ✅ `flow_executions` tem `organization_id` (confirmado). Canal único por org (`follow-up-status:${orgId}`) + `filter: organization_id=eq.${orgId}`; `refetchInterval: 30000` removido.
- [x] **`src/hooks/useContactPresence.ts`** (~42, 68): de início, apenas garantir cleanup. Refator para canal único fica na Fase 6 (estrutural).
  > ✅ Cleanup já correto (`removeChannel` + `clearInterval` no return do effect). Nenhuma mudança necessária; refator de canal único permanece na Fase 6.

**Validação 1A:** abrir o app com 2 orgs diferentes; confirmar que org A não recebe notificação de mensagem da org B (logs do console). Conexões websocket no painel não crescem com volume de outras orgs.

## 1B — RLS `(select auth.uid())`

**Contexto:** envolver `auth.uid()` em subquery escalar faz o Postgres avaliar **uma vez por query** (InitPlan) em vez de por linha. Mudança mecânica, semanticamente idêntica.

- [x] Criar migration nova — **`supabase/migrations/20260614120000_rls_select_auth_uid_lote1.sql`** (Lote 1).
- [~] Estratégia: **recriar** as políticas trocando `auth.uid()` → `(select auth.uid())`. Priorizar as tabelas quentes primeiro (não precisa fazer as 290 de uma vez):
  - [x] **Lote 1 (quentes):** `messages`, `conversations`, `contacts`, `contact_tags`, `conversation_pipeline_positions`. — 12 políticas recriadas a partir das definições **vigentes** (nomes/cláusulas literais conferidos na fonte). Estrutura preservada (FOR ALL sem WITH CHECK mantidos sem WITH CHECK).
  - [ ] **Lote 2:** `tasks`, `subtasks`, `task_assignees`, `task_processes`, `task_attachments`, `case_tasks`, `cases`.
  - [ ] **Lote 3:** restante (documents, flows, carousels, configs).
- [ ] Para cada política, padrão:
```sql
DROP POLICY "<nome>" ON public.<tabela>;
CREATE POLICY "<nome>" ON public.<tabela>
  FOR <cmd> USING ( ...trocar todo auth.uid() por (select auth.uid())... )
  WITH CHECK ( ...idem... );
```
  > Localizar as definições atuais: `Grep "auth.uid()" supabase/migrations -l` e copiar a versão mais recente de cada política. **Atenção:** usar a definição vigente (última migration que a alterou), não a original.
- [x] Helpers SECURITY DEFINER (`get_user_org_id`, `user_has_workspace_access` etc.) **não** mudam — só a forma como recebem o uid. (Apenas `get_user_org_id` é usado no Lote 1; preservado, recebendo `(select auth.uid())`.)

**Validação 1B:** ⚠️ requer aplicação manual no banco — ver mecanismo de deploy.
- [ ] ~~`supabase db push`~~ **NÃO** rodar (regra de deploy). Aplicar `20260614120000_rls_select_auth_uid_lote1.sql` via **SQL Editor do Supabase** / fluxo Lovable. *(aguardando aplicação pelo usuário)*
- [ ] Smoke test: login normal, abrir chat/contatos/tasks — tudo carrega (RLS não quebrou acesso). *(pós-aplicação)*
- [ ] `EXPLAIN ANALYZE` numa listagem de mensagens antes/depois: o tempo deve cair e o plano não deve mostrar reavaliação de função por linha. *(pós-aplicação)*

---

# FASE 2 — Índices (FK + compostos)  ·  *baixo risco*

**Contexto:** FK no Postgres não cria índice; sem ele, cascade-delete e JOIN fazem seq scan. `CREATE INDEX CONCURRENTLY` **não bloqueia** escrita, mas **não roda em transação** — portanto **uma migration por índice** (ou desabilitar a transação do runner).

- [ ] Antes de criar, confirmar o que **já existe** (não duplicar): ler `supabase/migrations/20260610213000_add_performance_indexes.sql` e `20260610184500_fix_wizzy_flow_workspace_tasks.sql`.
- [ ] Criar migrations (uma por índice, nome `<timestamp>_idx_<n>.sql`):
```sql
-- FK sem índice
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_contact_id   ON public.conversations(contact_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_assigned_to  ON public.conversations(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_sent_by           ON public.messages(sent_by) WHERE sent_by IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_organization_id   ON public.profiles(organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_campaign_queue_org         ON public.campaign_queue(organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_campaign_queue_campaign    ON public.campaign_queue(campaign_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_calendar_bookings_org      ON public.calendar_bookings(organization_id, starts_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_billing_events_org_created ON public.billing_events(organization_id, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_flow_node_logs_org         ON public.flow_node_logs(organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_case_activity_org          ON public.case_activity_log(organization_id, created_at DESC);
-- helpers RLS (acelera corpo das funções de membership)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_org_members_user           ON public.organization_members(user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workspace_members_user_ws  ON public.workspace_members(user_id, workspace_id);
-- feeds e edge functions
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contacts_org_created       ON public.contacts(organization_id, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stage_history_conv_created ON public.conversation_stage_history(conversation_id, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_flow_executions_timeout    ON public.flow_executions(status, remarketing_step, timeout_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_entry_flow_events_name_user ON public.entry_flow_events(event_name, user_id, created_at);
```

**Validação:** após aplicar, repetir a query de "seq scans" da Fase 0 — `seq_scan` deve parar de crescer nessas tabelas e `idx_scan` aumentar. `EXPLAIN` de um cascade-delete de org não deve mostrar seq scan nas filhas.

---

# FASE 3 — Edge Functions críticas (OOM / N+1)  ·  *médio risco — testar cada uma*

**Contexto:** funções que carregam tabelas inteiras na memória do worker ou fazem 1 query por item em loop. Cada item abaixo é independente — fazer e testar isoladamente.

- [ ] **3A — `auto-close-conversations` (OOM, Crítica).** `index.ts:48-52` traz todas as mensagens de 500 conversas sem `.limit()`. Solução preferida: desnormalizar.
  1. Migration: `ALTER TABLE conversations ADD COLUMN last_message_direction text;`
  2. Popular no webhook de ingestão (`zapi-webhook`/`zapi-sync-messages`) ao inserir mensagem.
  3. Backfill único: `UPDATE conversations c SET last_message_direction = (SELECT direction FROM messages m WHERE m.conversation_id=c.id ORDER BY created_at DESC LIMIT 1);`
  4. Reescrever o fechamento: `UPDATE conversations SET status='closed' WHERE status='open' AND last_message_at < cutoff AND last_message_direction='outbound';` — remove totalmente a leitura de `messages`.
- [ ] **3B — `zapi-cleanup` (full-table cross-org, Alta).** Mover dedup para SQL e paginar:
  - dedup de mensagens: `DELETE FROM messages a USING messages b WHERE a.conversation_id=b.conversation_id AND a.zapi_message_id=b.zapi_message_id AND a.ctid > b.ctid;`
  - paginar `contacts` por cursor (`id`); proteger `forceCleanup` para nunca rodar síncrono cross-org.
- [ ] **3C — `process-scheduled-messages` (N+1, cron 1 min).** `index.ts:252,385`:
  - pré-carregar conversas: `conversations.select(...).in('contact_id', ids)` → `Map`.
  - inserir `messages` em lote.
  - substituir `setTimeout(delayMs)` por reagendamento (`campaign_queue.scheduled_for`); limitar a ~200 contatos/invoke.
- [ ] **3D — `import-whatsapp-history` + auditoria (Alta).** `index.ts:345`: a RPC `record_conversation_origin_audit` roda 1×/mensagem. Mudar para **1×/conversa** (chamar fora do loop de mensagens).
- [ ] **3E — `process-flow-timeouts` (Alta).** Pré-carregar `conversations`/`contacts`/`whatsapp_instances` das execuções em lote (`.in('id',...)`); unificar `contactRespondedAfterLastFollowUp` em 1 query. (Índice `flow_executions(status, remarketing_step, timeout_at)` já vem na Fase 2.)
- [ ] **3F — `agent-orchestrator` (caminho mais quente).** `index.ts:325`: trocar `messages.select('*').limit(80)` por colunas explícitas; substituir polling de transcrição (170-186) por payload/realtime; cachear tags/pipelines/agents por org.

**Validação Fase 3:** invocar cada função manualmente (curl/painel) com payload realista e conferir nos logs: sem timeout, memória estável, nº de queries reduzido. Para 3A, confirmar que conversas continuam fechando corretamente.

---

# FASE 4 — Dashboard: RPCs + polling  ·  *médio risco*

**Contexto:** `useDashboardData.ts`/`usePipelineStats.ts` fazem N+1 (count por membro, última msg por conversa) com polling de 15–60 s. Cada tick = dezenas de round-trips.

- [ ] **4A — Criar RPCs server-side** (migration com funções SQL `STABLE`):
  - `get_dashboard_metrics(org uuid, ws uuid, since timestamptz, until timestamptz)` — retorna todos os números num único JSON (substitui `:117-199`).
  - `get_team_performance(org uuid, ...)` — `GROUP BY assigned_to` (substitui o loop `:820` e `usePipelineStats.ts:79`).
  - `get_pipeline_stage_distribution(...)` — `GROUP BY column_id` (substitui `usePipelineStats.ts:30`).
- [ ] **4B — Trocar os hooks** para chamar `supabase.rpc(...)` em vez das sub-queries; remover o loop de última-mensagem (`:449`) usando join lateral `last_message:messages(...).order().limit(1)`.
- [ ] **4C — Reduzir polling:** elevar todos os `refetchInterval` para ≥ 60 s (o de 15 s em `:480` é o pior); adicionar pausa por `document.visibilityState`.
- [ ] **4D — `staleTime`:** dados de config (`usePipelines`, `useTags`, `useConversationStatuses`, `useWorkspaces`) → `staleTime: 10*60*1000`.

**Validação:** abrir o dashboard com a aba de rede aberta — nº de requests por minuto deve cair de dezenas para poucos; gráficos idênticos aos de antes.

---

# FASE 5 — Retenção/limpeza + busca  ·  *baixo risco*

**Contexto:** ~19 tabelas de log crescem sem limite; busca usa `ILIKE '%x%'` (seq scan).

- [ ] **5A — Jobs `pg_cron`** (extensão já habilitada). Migration:
```sql
SELECT cron.schedule('purge-flow-node-logs','0 3 * * *',
  $$DELETE FROM public.flow_node_logs WHERE created_at < now() - interval '90 days';$$);
SELECT cron.schedule('purge-wa-conn-logs','0 3 * * *',
  $$DELETE FROM public.whatsapp_connection_logs WHERE created_at < now() - interval '90 days';$$);
SELECT cron.schedule('purge-agent-exec-logs','0 3 * * *',
  $$DELETE FROM public.agent_execution_logs WHERE created_at < now() - interval '180 days';$$);
SELECT cron.schedule('purge-entry-flow-events','0 3 * * *',
  $$DELETE FROM public.entry_flow_events WHERE created_at < now() - interval '180 days';$$);
SELECT cron.schedule('purge-campaign-queue-done','0 4 * * *',
  $$DELETE FROM public.campaign_queue WHERE status IN ('sent','failed') AND processed_at < now() - interval '30 days';$$);
SELECT cron.schedule('purge-contact-presence','*/15 * * * *',
  $$DELETE FROM public.contact_presence WHERE expires_at < now();$$);
SELECT cron.schedule('purge-signature-otp','0 * * * *',
  $$DELETE FROM public.signature_otp_codes WHERE created_at < now() - interval '1 day';$$);
```
  > **NÃO** purgar auditoria legal: `billing_events`, `admin_audit_logs`, `conversation_origin_audit`, `signature_evidence` — apenas arquivar se necessário.
- [ ] **5B — Busca FTS** (substitui `useMessageSearch` `ILIKE`):
```sql
ALTER TABLE public.messages ADD COLUMN content_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('portuguese', coalesce(content,''))) STORED;
CREATE INDEX CONCURRENTLY idx_messages_content_tsv ON public.messages USING gin(content_tsv);
```
  - Criar RPC `search_messages(org uuid, q text)` usando `content_tsv @@ websearch_to_tsquery('portuguese', q)`.
  - `src/hooks/useMessageSearch.ts`: chamar a RPC + adicionar **debounce** (300 ms) no input.

**Validação:** confirmar jobs com `SELECT * FROM cron.job;`; rodar busca e ver no `EXPLAIN` o uso do índice GIN (não seq scan).

---

# FASE 6 — Estrutural: particionamento + denormalização  ·  *alto esforço — janela de manutenção*

**Contexto:** mudanças pesadas, fazer por último e em horário de baixo uso.

- [ ] **6A — Particionar `messages` por mês** (`RANGE (created_at)`). Requer recriação: nova tabela particionada → cópia dos dados → swap de nomes → criar partições futuras via cron. Permite `DROP PARTITION` instantâneo e índices menores. **Planejar downtime curto.**
- [ ] **6B — Denormalizar `workspace_id`/`organization_id`** nas filhas de tasks (`subtasks`, `task_assignees`, `task_processes`, `task_attachments`) e simplificar as políticas RLS para comparação direta (sem `EXISTS`+JOIN). Manter via trigger.
- [ ] **6C — `useContactPresence`** → canal único de presença por workspace (remove 1 websocket + timer 5 s por contato).
- [ ] **6D — Paginação real (keyset)** em `useMessages` (`.limit(50)` + cursor `created_at`) e `useContacts` (`.range()` + virtualização). Garantir que o frontend use **cursor**, não OFFSET.

**Validação:** carga de teste em `messages` particionada; smoke test completo de tasks/chat; medir RAM/CPU do banco vs baseline da Fase 0.

---

## Checklist final de comprovação de ganho
- [ ] Repetir as 3 queries da Fase 0 e comparar com `docs/baseline_perf.md`.
- [ ] Conexões em pico menores no painel Supabase.
- [ ] `pg_stat_statements`: queries do dashboard e de mensagens saíram do topo.
- [ ] Sem timeouts nas Edge Functions de cron nos logs.
