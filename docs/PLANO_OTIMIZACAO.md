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
- [x] **Fase 1** — Quick wins: filtros de Realtime + RLS `(select auth.uid())` *(1A frontend ✅; **1B Lote 1 ✅ (12) + Lote 2 ✅ (11) + Lote 3 ✅ (224 políticas / 116 tabelas) — todos aplicados e validados no SQL Editor em 2026-06-15; sweep de `pg_policies` retorna 0 políticas com `auth.uid()` nu**. Pendente só o `EXPLAIN ANALYZE` antes/depois (medição, não bloqueia).)*
- [x] **Fase 2** — Índices (FK + compostos) *(16 migrations criadas, verificadas na fonte, aplicadas no SQL Editor e confirmadas via `pg_indexes` — 16/16 presentes em 2026-06-15)*
- [x] **Fase 3** — Edge Functions críticas (OOM / N+1) *(3A,3B,3C,3E,3F validados em 2026-06-16/17; **3D** = código feito, smoke adiado (import é raro). Bônus: corrigido bug pré-existente que **perdia mensagens recebidas** — trigger `auto_assign_workspace` (uuid[]) + ativação do escopo de conversa por instância. Migrations aplicadas: `20260616120000` (3A), `20260616121000` (3B), `20260616122000` (fix trigger), `20260616124000` (escopo por instância).)*
- [~] **Fase 4** — Dashboard: RPCs + redução de polling *(4A RPCs aplicadas + isolamento validado; 4B/4C/4D código pronto e `tsc` limpo — aguardando deploy Lovable + validação no dashboard com aba de Rede)*
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
  - [x] **Lote 2:** `tasks`, `subtasks`, `task_assignees`, `task_processes`, `task_attachments`, `case_tasks`, `cases` **+ as 4 "by workspace" de contacts/conversations**. ✅ **Aplicado e validado em 2026-06-15** — `pg_policies` confirma as 11 políticas com `(select auth.uid())` (checagem por regex deu `false` para uid nu em todas).
    > ⚠️ **Descoberto na validação do Lote 1 (2026-06-15):** `contacts` e `conversations` têm políticas **paralelas "by workspace"** (`Users can manage/view contacts by workspace`, `Users can manage/view conversations by workspace`) que ainda usam `auth.uid()` nu. Como RLS é OR das permissivas, o ganho nessas duas tabelas quentes só é total quando essas 4 também forem convertidas. **Incluir no Lote 2.**
    >
    > **Progresso (2026-06-15):** migration **`20260615130000_rls_select_auth_uid_lote2.sql`** criada e **conferida contra o `pg_policies` VIVO** (não só a fonte). Inventário real (11 políticas convertidas):
    > - `tasks`: "Wizzy Flow tasks access" *(só 1 política viva — a "workspace tasks access" guardada por NOT EXISTS nunca foi criada no banco)*
    > - `subtasks`: "Wizzy Flow task child access"
    > - `task_assignees`: "Wizzy Flow task child access" *(idem: só 1 viva)*
    > - `task_processes`: "Wizzy Flow task child access" + "Wizzy Flow workspace task processes access" (ambas LEFT JOIN projects)
    > - `task_attachments`: "Wizzy Flow task child access"
    > - `cases`: "cases_admin_full_access" + "cases_member_workspace_access" (FOR ALL TO authenticated)
    > - `case_tasks`: "case_tasks_org_access" (FOR ALL TO authenticated)
    > - `contacts` (by workspace): "Users can manage contacts by workspace" (ALL) + "Users can view contacts by workspace" (SELECT) — role public
    > - `conversations` (by workspace): "Users can manage conversations by workspace" (ALL) + "Users can view conversations by workspace" (SELECT) — role public
    >
    > As "…in their organization" de contacts/conversations já tinham sido convertidas no Lote 1 (confirmado: aparecem como `(SELECT auth.uid())` no dump) — não são tocadas.
    >
    > **Smoke test (2026-06-15):** chat e contatos abrindo normal (exercita `contacts`/`conversations`, inclusive as "by workspace" convertidas). Tasks = ferramenta Wizzy Flow (`/tools/wizzy-flow`); "casos" não tem tela própria (criados por gatilho de pipeline, sem página que consulte `cases`/`case_tasks`) — nada a testar manualmente. RLS íntegro.
    >
    > **Lote 2 fechado.** Query de verificação usada (regex deu `false` para uid nu em todas):
    > ```sql
    > SELECT tablename, policyname, qual, with_check FROM pg_policies
    > WHERE schemaname='public' AND tablename IN
    >   ('tasks','subtasks','task_assignees','task_processes','task_attachments','case_tasks','cases','contacts','conversations')
    > ORDER BY tablename, policyname;
    > ```
  - [x] **Lote 3 (mop-up):** restante **completo**. ✅ **Aplicado e validado em 2026-06-15** — migration **`20260615140000_rls_select_auth_uid_lote3.sql`** (**224 políticas em 116 tabelas**), em `BEGIN/COMMIT`.
    > ⚠️ **Correção de premissa:** o "restante" **não** eram só as 4 famílias documents/flows/carousels/configs (~56 políticas). O sweep de `pg_policies` (banco vivo) revelou **224 políticas nuas em 116 tabelas** — incluindo tabelas quentes de cliente (`campaigns`, `crm_entries`, `pipelines`/`pipeline_columns`, `tags`, `profiles`, `whatsapp_*`, `contact_*`, `scheduled_message*`, `quiz*`, `widget*`, `case_*` fora do Lote 2), todas as Wizzy Flow (`projects`/`positions`/`routines`/`template_*`/`external_participants`) e admin/governança (`governance_*`, `platform_*`, `organization_*`, `*_fingerprints`).
    >
    > **Metodologia (divergência fonte×banco):** a migration **não** foi escrita da fonte versionada. Um gerador SQL leu o `pg_policies` VIVO e emitiu o DDL `DROP/CREATE` literal de cada política (preservando nome/cmd/roles/USING/WITH CHECK), trocando só `auth.uid()` → `(select auth.uid())` com proteção contra duplo-embrulho. Helpers (`get_user_org_id`, `has_role`, `is_platform_admin`, `user_belongs_to_org`, `user_has_workspace_access`, etc.) recebem `(select auth.uid())` — InitPlan vale igual.
    >
    > **Validação (2026-06-15):** arquivo conferido (DROP=CREATE=224, 0 nu, 0 duplo-embrulho); aplicado no SQL Editor; sweep pós-aplicação retornou **0 políticas nuas**. **Smoke test (2026-06-16): app abrindo normal** (chat, contatos, pipeline, tasks/Wizzy Flow, campanhas, documentos, carrosséis, configs) — RLS íntegro. **1B fechado.**
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
- [x] ~~`supabase db push`~~ **NÃO** rodar (regra de deploy). Aplicar `20260614120000_rls_select_auth_uid_lote1.sql` via **SQL Editor do Supabase** / fluxo Lovable. ✅ **Aplicado em 2026-06-15**; `pg_policies` confirma as **12 políticas do Lote 1 com `(select auth.uid())`**.
- [x] Smoke test: login normal, abrir chat/contatos/tasks — tudo carrega (RLS não quebrou acesso). ✅ **2026-06-15** — chat, contatos e pipeline carregando normalmente; RLS íntegro.
- [x] `EXPLAIN ANALYZE` numa listagem de mensagens: o plano não deve mostrar reavaliação de função por linha. ✅ **2026-06-15** — rodado como role `authenticated` (claim `sub` setado) numa conversa com 279 msgs. Plano confirma `(select auth.uid())` como **InitPlan (loops=1)** e a checagem de org como **One-Time Filter** (`get_user_org_id((InitPlan).col1)`), sem reavaliação por linha. `Execution Time: 5.47ms`. Obs.: nó é `Seq Scan on messages` (tabela ~9k, em cache) em vez do índice `(conversation_id, created_at)` — não dói agora, alvo da Fase 6A/6D quando `messages` crescer.

---

# FASE 2 — Índices (FK + compostos)  ·  *baixo risco*

**Contexto:** FK no Postgres não cria índice; sem ele, cascade-delete e JOIN fazem seq scan. `CREATE INDEX CONCURRENTLY` **não bloqueia** escrita, mas **não roda em transação** — portanto **uma migration por índice** (ou desabilitar a transação do runner).

- [x] Antes de criar, confirmar o que **já existe** (não duplicar): ler `supabase/migrations/20260610213000_add_performance_indexes.sql` e `20260610184500_fix_wizzy_flow_workspace_tasks.sql`.
  > ✅ Ambas lidas. Índices já existentes mapeados (conversations org/workspace/status/instance, messages(conversation_id,created_at), tasks/projects/subtasks/task_*, document_*, flows, contact_presence). **Nenhum dos 16 abaixo duplica** os existentes (ex.: `idx_conversations_org_instance_contact` lidera por org+instance, não serve lookup só por `contact_id`; os UNIQUE de `organization_members`/`workspace_members` lideram pela coluna errada para os helpers RLS).
- [x] Criar migrations (uma por índice, nome `<timestamp>_idx_<n>.sql`):
  > ✅ 16 migrations criadas (`20260615120000`…`20260615121500`), **uma por índice**, todas `CREATE INDEX CONCURRENTLY IF NOT EXISTS`. Cada coluna/tabela foi **conferida na fonte** (CREATE TABLE/ALTER nas migrations): conversations(contact_id, assigned_to), messages(sent_by), profiles(organization_id), campaign_queue(organization_id, campaign_id), calendar_bookings(organization_id, starts_at), billing_events(organization_id, created_at), flow_node_logs(organization_id), case_activity_log(organization_id, created_at), organization_members(user_id), workspace_members(user_id, workspace_id), contacts(organization_id, created_at), conversation_stage_history(conversation_id, created_at), flow_executions(status, remarketing_step, timeout_at — colunas add via ALTER 20260308172848/174356), entry_flow_events(event_name, user_id, created_at). **Aplicação:** manual no SQL Editor, **um arquivo por vez** (CONCURRENTLY não roda em transação — não colar os 16 juntos).
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
  > ✅ **Aplicado e confirmado (2026-06-15):** os 16 `CREATE INDEX CONCURRENTLY` rodados um-a-um no SQL Editor; `pg_indexes` retorna **16/16** índices presentes no schema `public`. Snapshot de `pg_stat_user_tables` mostra `idx_scan` na casa das centenas de milhões em `conversations`/`contacts` (índices em uso). Obs.: o `seq_scan` daquela query é cumulativo desde o boot do banco — o ganho deve ser medido pelo *delta* daqui pra frente (baseline da Fase 0 ficou pendente).

---

# FASE 3 — Edge Functions críticas (OOM / N+1)  ·  *médio risco — testar cada uma*

**Contexto:** funções que carregam tabelas inteiras na memória do worker ou fazem 1 query por item em loop. Cada item abaixo é independente — fazer e testar isoladamente.

- [~] **3A — `auto-close-conversations` (OOM, Crítica).** Desnormalização **via trigger** (decisão 2026-06-16; popular no webhook foi descartado — há 11 funções que inserem em `messages`, várias rotas ficariam sem atualizar).
  > ✅ **Código pronto.** Migration **`20260616120000_fase3a_last_message_direction.sql`**: (1) `ALTER conversations ADD COLUMN last_message_direction text`; (2) trigger `trg_sync_last_message_direction` AFTER INSERT em `messages` que só sobrescreve quando `NEW.created_at >= COALESCE(last_message_at,'-infinity')` — protege contra imports de histórico (mensagens antigas não viram "última direção"); (3) backfill por subquery correlacionada (usa índice da Fase 2). `auto-close/index.ts` reescrito: **um único UPDATE** `status='open' AND last_message_at<cutoff AND last_message_direction='outbound'`, sem ler `messages` nem `.limit(500)`.
  > ⚠️ **Ordem de deploy:** aplicar a migration **ANTES** de publicar a função (a coluna precisa existir, senão o UPDATE falha).
- [x] **3B — `zapi-cleanup` (full-table cross-org, Alta).** ✅ **Validado em 2026-06-16** — migration da RPC aplicada (`dedup_org_messages` existe); proteção do forceCleanup retorna **400** sem `organizationId`; `cleanup` na org rodou **200** sem timeout (`deletedCount:0/mergedContacts:0` — banco já sem duplicatas); sweep de duplicatas = **0 linhas**.
  > ✅ **Código pronto.** Migration **`20260616121000_fase3b_dedup_org_messages.sql`**: RPC `dedup_org_messages(_organization_id)` que faz o dedup em **um DELETE … USING** por `(conversation_id, zapi_message_id)` escopado à org (mantém a 1ª cópia; mesma chave do upsert de ingestão). Edge function: o `select('*')`+`Map`+delete-em-lotes foi substituído por `supabase.rpc('dedup_org_messages', …)`. `forceCleanup` agora **exige `organizationId`** (retorna 400 sem ele) — nunca roda cross-org síncrono.
  > 🔸 **Desvio consciente:** **não** paginei `contacts` por cursor. O dedup de contatos agrupa por `phoneMatchKey` em memória — paginar quebraria o agrupamento cross-página. A fonte real de OOM (varredura de `messages`) foi para o SQL; `contacts` por org é limitado. Paginação de contatos exigiria agrupamento server-side (item futuro, se necessário).
- [x] **3C — `process-scheduled-messages` (N+1, cron 1 min).** ✅ **Validado em 2026-06-16** — agendamento novo (single) enviado e gravado ponta a ponta (msg em `messages` + entregue no WhatsApp), após aplicar a migration do trigger `auto_assign_workspace`. Deviations abaixo permanecem.
  > ✅ **Código pronto (batching).** Novo helper `preloadConversations`: **1 SELECT** das conversas existentes por `.in('contact_id', ids)` + **1 INSERT em lote** das faltantes → `Map`. Em `sendMessageToContacts`, as gravações viraram lote no fim: **1 insert de `messages`**, **1 update de `last_message_at`** (todas as convs tocadas) e **1 update** de `scheduled_message_contacts` (status manual). `executeFlowForContacts` usa o mesmo preload. Eram ~5 queries/contato; agora ~constante + as chamadas externas.
  > 🐛 **Bug pego no smoke test (2026-06-16) e corrigido:** a 1ª versão criava as conversas faltantes em **insert em lote (tudo-ou-nada)** — uma colisão com o índice único `idx_conversations_contact_org_instance_unique` fazia o lote inteiro falhar, a conversa sumia do Map, o envio era **pulado com `continue`** e o agendamento marcado **`sent` sem nada enviado** (`failCount=0`). **Fix:** criação **por contato** com **re-SELECT** em caso de falha (recupera conversa existente/corrida + loga erro real); "sem conversa" agora conta como **falha** (nunca mais `sent` falso); insert de `messages` com **fallback por linha**. Re-deploy + retestar.
  > 🔥 **Bug PRÉ-EXISTENTE do banco descoberto via o log acima (2026-06-16):** o trigger legado **`trg_auto_assign_workspace`** (`BEFORE INSERT … ON conversations` → `auto_assign_workspace()`, **não versionado** no repo) tratava `workspaces.filter_tag_ids` (tipo `uuid[]`) como JSONB → `jsonb_array_elements_text(uuid[]) does not exist` → **TODA criação de conversa nova falhava** (webhook de entrada, flows, agendamentos) em orgs com workspace tag-filtrado. Mascarado pelo skip silencioso do código antigo. **Fix:** migration **`20260616122000_fix_auto_assign_workspace_uuid_array.sql`** (CREATE OR REPLACE; troca a comparação por `t.id = ANY(w.filter_tag_ids)`). **Aplicada em 2026-06-16** — o erro do insert deixou de ser jsonb. Conserta o sistema inteiro, não só agendamentos.
  > ⚠️ **Drift do banco (2026-06-16) + bug de RECEBIMENTO descoberto:** o índice ANTIGO `idx_conversations_contact_org_unique (contact_id, organization_id)` **ainda existe** no banco vivo — a migration `20260610173000` deveria tê-lo dropado ao introduzir o escopo por instância (`idx_conversations_contact_org_instance_unique`). Efeito: **escopo por instância NÃO está ativo** (1 conversa por contato+org), mas o código (webhook, scheduled, flows) assume escopo por instância. **Sintoma grave:** ao usar uma **2ª instância de WhatsApp**, o `zapi-webhook` tentava criar uma 2ª conversa pro mesmo contato → `23505` em `idx_conversations_contact_org_unique` → `handleMessage crashed but returning 200` → **mensagens RECEBIDAS eram perdidas** (confirmado em log, 2026-06-16). Pré-existente (não é regressão da Fase 3); surgiu ao adicionar a 2ª instância.
  > **DECISÃO (2026-06-16, regra de negócio confirmada): ATIVAR escopo por instância.** Identidade da conversa = (contato + conta + número da empresa). 2 números = 2 chats; workspace é rótulo móvel (mesmo chat ao trocar de workspace); isolamento por conta preservado (RLS). **Auditoria (subagente):** o código já está quase todo preparado — a maioria dos lookups de conversa já filtra por `whatsapp_instance_id`. Pontos sem instância (`quiz-actions`, `zapi-contact-tags`) usam `limit(1)` e **não quebram** (pegam a conversa mais recente — default aceitável p/ ações sem número). **Plano em 2 etapas:**
  > - **Etapa 1 ✅ (2026-06-16/17)** — migration `20260616124000_activate_conversation_instance_scoping.sql` aplicada. `pg_indexes` confirma `idx_conversations_contact_org_instance_unique` presente e `idx_conversations_contact_org_unique` removido. **Validado:** recebimento voltou (sem `handleMessage crashed`) e o mesmo contato passou a ter **2 chats** (um por número). Workspace continua mesmo chat. Isolamento por conta preservado.
  > - **Etapa 2 ✅** — fallbacks cross-instância revertidos para **scoped por instância** em `zapi-webhook.findOrCreateConversation` e `process-scheduled-messages.preloadConversations` (cada número = um chat; corrida só recupera a conversa da MESMA instância). Re-deploy das duas funções.
  > 🔸 **Desvio consciente:** **não** troquei `setTimeout(delayMs)`→reagendamento nem apliquei cap de ~200/invoke. O `setTimeout` é throttle anti-bloqueio (sequencial, intencional). Cap + reschedule para campanhas de **tag** exige persistir progresso por contato (hoje só `manual` tem `scheduled_message_contacts`); sem isso, capar **descarta destinatários** silenciosamente. Fica como item de redesenho (precisa de tracking por contato p/ tag).
- [x] **3D — `import-whatsapp-history` + auditoria (Alta).** ✅ **Feito (código).** O loop `for (const message of inserted)` que chamava `record_conversation_origin_audit` **1×/mensagem** (10k+ RPCs) foi **removido**; a auditoria **1×/conversa** já existia (linha ~295) e cobre o caso. Sem migration. ⏳ **Smoke funcional adiado p/ o fim** (import é operação rara) — validar com `SELECT captured_from, count(*) FROM conversation_origin_audit ...` que não aparece `import-whatsapp-history:message`.
- [x] **3E — `process-flow-timeouts` (Alta).** ✅ **Validado em 2026-06-16** — invocação manual retornou `200`/`success` e os logs ficaram limpos (sem erro/timeout) com a pré-carga em lote. Semântica de "não reenviar a quem respondeu" preservada (lógica pura `computeRespondedAfterLastFollowUp`).
  > ✅ **Código pronto.** Na PHASE 2, pré-carga em lote antes do loop: `conversations` (id/contact/org/instance/service_mode/metadata), `contacts` (phone) e `whatsapp_instances` conectadas das orgs envolvidas (resolvidas em memória via `resolveInstance`). `contactRespondedAfterLastFollowUp` foi de **2 queries→1** e extraído para `computeRespondedAfterLastFollowUp` (lógica pura), alimentado por **1 query** de mensagens posteriores ao `started_at` mais antigo (agrupadas por conversa) — semântica de segurança (não reenviar a quem respondeu) **preservada**. Índice da Fase 2 já presente.
- [x] **3F — `agent-orchestrator` (caminho mais quente).** ✅ **Refactor OK** (colunas restritas + cache por org não alteram a requisição de IA). O "IA com erro" (2026-06-17) era **externo**: a **Lovable descontinuou `openai/gpt-4o-mini`** no gateway (`400 invalid model`). 
  > **DECISÃO DE NEGÓCIO (2026-06-17): cada org usa SOMENTE a IA configurada no painel dela — NUNCA Lovable.** `resolveAIConfig` reescrito: provider/chave/modelo vêm de `integration_configs` (OpenAI ou Gemini); **removido o gateway Lovable e todos os fallbacks** (Lovable, chave da plataforma, override por plano `platform_api`). Sem provedor+chave válidos → `resolveAIConfig` retorna `null` → orquestrador **loga aviso e NÃO responde** (`reason: no_ai_configured`); simulação retorna erro claro; `resolveAgentConfig` cai na config válida da org. ⚠️ **Requisito operacional:** cada org PRECISA ter IA configurada no painel (provedor + chave), senão a IA fica silenciosa (por design). Re-deploy do `agent-orchestrator`. `messages.select('*').limit(80)` → **colunas explícitas** `id, content, direction, type, created_at` (campos realmente usados; elimina trazer `metadata`/mídia de 80 msgs por turno). `agents`/`tags`/`pipelines` agora via `loadOrgConfigCached` (cache em memória por org, **TTL 20s**) — corta 3 queries/turno. *Não* cacheei `training_rules`/`qualification_rules` (devem aplicar imediatamente).
  > 🔸 **Desvio consciente:** **não** substituí o polling de transcrição (170-186). Removê-lo com segurança exige o chamador (`zapi-webhook`) passar a transcrição no payload ou disparo via realtime pós-transcrição — mudança cross-função fora do escopo de um ajuste isolado. Só ocorre no caminho de mídia. Fica como item futuro.

**Validação Fase 3 (manual — a fazer):**
1. **Aplicar as 2 migrations no SQL Editor** (regra de deploy Lovable — NÃO `db push`): `20260616120000_fase3a_*` (rodar inteiro; transacional) e `20260616121000_fase3b_*`. Aplicar 3A **antes** de publicar `auto-close`.
2. **Deploy das 6 funções** alteradas via fluxo Lovable.
3. **Smoke por função** (painel/curl, payload realista) conferindo logs: sem timeout, memória estável, menos queries.
   - **3A:** após a migration, conferir `SELECT count(*) FROM conversations WHERE last_message_direction IS NOT NULL` (backfill ok) e que conversas com última msg outbound + inativas continuam fechando.
   - **3D:** importar um chat e ver **1** linha em `conversation_origin_audit` por conversa (não por mensagem).
   - **3E/3C:** rodar o cron e ver no log nº de queries reduzido; follow-ups e agendamentos disparando normal.
   - **3B:** chamar `?action=cleanup&organizationId=<org>`; conferir contagem de removidos; `forceCleanup` sem org → 400.

---

# FASE 4 — Dashboard: RPCs + polling  ·  *médio risco*

**Contexto:** `useDashboardData.ts`/`usePipelineStats.ts` fazem N+1 (count por membro, última msg por conversa) com polling de 15–60 s. Cada tick = dezenas de round-trips.

- [x] **4A — Criar RPCs server-side** (migration com funções SQL `STABLE`):
  - `get_dashboard_metrics(org uuid, ws uuid, since timestamptz, until timestamptz)` — retorna todos os números num único JSON (substitui `:117-199`).
  - `get_team_performance(org uuid, ...)` — `GROUP BY assigned_to` (substitui o loop `:820` e `usePipelineStats.ts:79`).
  - `get_pipeline_stage_distribution(...)` — `GROUP BY column_id` (substitui `usePipelineStats.ts:30`).
  > ⏳ **Código pronto (2026-06-17) — aguardando aplicação manual no SQL Editor.** Migration **`20260617120000_fase4_dashboard_rpcs.sql`** (transacional, `BEGIN/COMMIT`) com as 3 RPCs. **Isolamento por conta:** todas `SECURITY DEFINER` com guard `user_is_org_member((select auth.uid()), _org)` no topo (mesmo helper multi-org das RLS; `RAISE EXCEPTION 42501` se não for membro) e todas as queries internas filtradas por `organization_id = _org`. A 3ª deriva a org do `pipeline_id` antes de validar. **Identidade de conversa:** todas contam linhas de `conversations` (nunca deduplicam por contato) — 2 números = 2 conversas, idêntico aos hooks. `GRANT EXECUTE ... TO authenticated`.
  > 🔸 **Ajuste de escopo (fiel às semânticas):** `get_team_performance` cobre os dois loops que são **de fato N+1** — `useReportsAgentPerformance` (:789-849, `assigned_to` + data) e `useTeamPerformanceByPipeline` (`usePipelineStats.ts:52`, `assigned_to` + pipeline), unificados por params opcionais (`_since/_until/_pipeline_id`). A `useTeamPerformance` do dashboard (:484, attribution por `intervened_by`) **não é N+1** (2 queries) e tem semântica distinta → **mantida como está** para não alterar os números do gráfico.
  > ✅ **Aplicada e validada (2026-06-17).** SQL rodado no SQL Editor. **Isolamento testado:** (a) usuário lendo a própria org → JSON válido (`openConversations: 87`); (b) usuário da org A lendo org B → `ERROR 42501 access denied to organization …` (guard `user_is_org_member` funcionando). Mecanismo idêntico nas 3 RPCs.
- [x] **4B — Trocar os hooks** para chamar `supabase.rpc(...)` em vez das sub-queries; remover o loop de última-mensagem (`:449`) usando join lateral `last_message:messages(...).order().limit(1)`.
  > ✅ **Código pronto (2026-06-18) — `tsc --noEmit` limpo. Sobe via Lovable sync.** `useDashboardData.ts`: `useDashboardMetrics` (~6 queries + carga de msgs em memória → 1 `rpc('get_dashboard_metrics')`); `useReportsAgentPerformance` (loop N+1 → `rpc('get_team_performance')`); `useRecentConversations` (1 query/conversa → **join embutido** `messages(...).order(created_at desc).limit(1, {foreignTable})`, 1 query só). `usePipelineStats.ts`: `usePipelineStageDistribution` → `rpc('get_pipeline_stage_distribution')`; `useTeamPerformanceByPipeline` (loop N+1 → `rpc('get_team_performance', {_pipeline_id})`). Tipos via `(supabase as any).rpc` (RPCs novas, fora dos tipos gerados). `useTeamPerformance` (:484) mantida (não-N+1, semântica `intervened_by`).
- [x] **4C — Reduzir polling:** elevar todos os `refetchInterval` para ≥ 60 s (o de 15 s em `:480` é o pior); adicionar pausa por `document.visibilityState`.
  > ✅ **Feito junto da 4B.** `useRecentConversations` 15s→60s, `useDashboardMetrics` 30s→60s, `usePipelineStageDistribution` 30s→60s; demais hooks de dashboard/reports já estavam em 60s. **Pausa em background:** `refetchIntervalInBackground: false` explícito nos hooks ajustados (é também o default do TanStack Query — o timer pausa quando a aba perde foco, cobrindo o `visibilityState`).
- [x] **4D — `staleTime`:** dados de config (`usePipelines`, `useTags`, `useConversationStatuses`, `useWorkspaces`) → `staleTime: 10*60*1000`.
  > ✅ **Feito (2026-06-18).** `staleTime: 10*60*1000` em: `usePipelines` (`['pipelines']`), `useTags` (`['tags']` + `useAllTags`), `useWorkspaces`/`useAllWorkspaces`/`useVisibleWorkspaces`, `useConversationStatuses` (em `useCrmEntities.ts`).

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
