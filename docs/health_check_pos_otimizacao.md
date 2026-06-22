# Health Check pós-otimização (estado ATUAL)

> ⚠️ O "antes" (baseline da Fase 0) nunca foi capturado e as mudanças já estão no ar,
> então **não é um comparativo antes×depois** — é uma **foto de saúde do estado atual**:
> confirma que o sistema está bem e que as otimizações das Fases 1–6 estão ativas.
>
> Rodar cada bloco no **Supabase SQL Editor** (projeto `zaobtetbjpuzibjymhzw`) e colar o resultado.
> Data da coleta: __________

---

## A. Saúde geral

### A1. Top 15 queries por tempo total (o dashboard/mensagens não devem dominar)
```sql
SELECT substr(query,1,100) AS query, calls, total_exec_time::int AS total_ms,
       mean_exec_time::int AS avg_ms, rows
FROM pg_stat_statements
ORDER BY total_exec_time DESC LIMIT 15;
```
**Esperado:** no topo, funções de sistema/auth; idealmente NÃO os SELECTs grandes de `conversations`/`messages`/dashboard.
**Resultado:**
```
(cole aqui)
```

### A2. Maiores tabelas (nada deve ter inchado; logs sob controle pós-retenção)
```sql
SELECT relname, n_live_tup AS linhas, pg_size_pretty(pg_total_relation_size(relid)) AS tamanho
FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 20;
```
**Esperado:** `messages` ainda pequena; tabelas de log (`flow_node_logs`, `whatsapp_connection_logs`, `agent_execution_logs`, `entry_flow_events`) não crescendo sem limite (retenção da Fase 5A).
**Resultado:**
```
(cole aqui)
```

### A3. Seq scans em tabelas grandes (índices em uso?)
```sql
SELECT relname, seq_scan, idx_scan, n_live_tup
FROM pg_stat_user_tables
WHERE n_live_tup > 1000 ORDER BY seq_scan DESC LIMIT 15;
```
**Esperado:** nas tabelas quentes (`conversations`, `contacts`, `messages`), `idx_scan` >> `seq_scan` (o `seq_scan` é cumulativo desde o boot; o que importa é o `idx_scan` estar alto e o delta de `seq_scan` parar de crescer).
**Resultado:**
```
(cole aqui)
```

### A4. Conexões por estado
```sql
SELECT count(*) AS conexoes, state FROM pg_stat_activity GROUP BY state ORDER BY count(*) DESC;
```
**Esperado:** poucas `active`; sem acúmulo de `idle in transaction`.
**Resultado:**
```
(cole aqui)
```

---

## B. As otimizações estão ATIVAS?

### B1. Fase 1B — nenhuma política RLS com `auth.uid()` "nu" (deve dar 0 linhas)
```sql
SELECT tablename, policyname
FROM pg_policies
WHERE schemaname = 'public'
  AND (
    regexp_replace(coalesce(qual,''),       '\(\s*select\s+auth\.uid\(\)\s*\)', '', 'gi') ~ 'auth\.uid\(\)'
    OR regexp_replace(coalesce(with_check,''), '\(\s*select\s+auth\.uid\(\)\s*\)', '', 'gi') ~ 'auth\.uid\(\)'
  );
```
**Esperado:** **0 linhas** (todas envoltas em `(select auth.uid())`).
**Resultado:**
```
(cole aqui)
```

### B2. Fase 5A — jobs de retenção pg_cron ativos + último resultado
```sql
SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;
-- e o resultado das últimas execuções:
SELECT jobid, status, return_message, start_time
FROM cron.job_run_details ORDER BY start_time DESC LIMIT 15;
```
**Esperado:** os 7 jobs de purga ativos (`purge-*`) + `process-scheduled-messages`/`process-campaign-queue`; execuções recentes com `status = succeeded`.
**Resultado:**
```
(cole aqui)
```

### B3. Fases 2 + 5B — índices-chave presentes (incl. GIN da busca FTS)
```sql
SELECT indexname FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_conversations_contact_id','idx_conversations_assigned_to','idx_messages_sent_by',
    'idx_org_members_user','idx_workspace_members_user_ws','idx_contacts_org_created',
    'idx_messages_content_tsv'
  )
ORDER BY indexname;
```
**Esperado:** as 7 linhas presentes (entre os 16 índices da Fase 2 + o GIN `idx_messages_content_tsv` da 5B).
**Resultado:**
```
(cole aqui)
```

---

## Resultado da coleta (2026-06-22)

- **B2 — crons:** ✅ execuções recentes todas `succeeded`, sem erro/timeout (jobids dos processadores de minuto rodando limpo).
- **Escopo (índices/funções/colunas):** ✅ **tudo presente** — 7/7 índices (Fase 2 + GIN FTS 5B + unique de escopo por instância), 5/5 funções (`dedup_org_messages`, `get_dashboard_metrics`, `get_team_performance`, `get_pipeline_stage_distribution`, `search_messages`), 2/2 colunas (`conversations.last_message_direction`, `messages.content_tsv`).
- **Triggers críticos:** ✅ vivos e habilitados — `trg_sync_last_message_direction` (3A), `trg_messages_content_tsv` (5B), `trg_reopen_conversation_on_inbound`, `trg_auto_assign_workspace`, `trg_auto_assign_workspace_on_tag`.
- **B1 — RLS InitPlan (Fase 1B):** ❌ **REVERTIDO.** ~100 políticas centrais (`messages`, `conversations`, `contacts`, `profiles`, `pipelines`, `tags`, `workspaces`, …) voltaram a usar `auth.uid()` **nu**.

### 🔴 Causa da reversão (importante p/ produção)
Nenhuma migration do repo recria políticas após a Fase 1B (verificado) → a reversão **não veio do código**. Veio do **Lovable**: ao sincronizar, ele **re-aplica as definições-base das políticas RLS dele (com `auth.uid()` nu)**, sobrescrevendo as otimizadas que aplicamos no SQL Editor. Objetos **aditivos** (índices/funções/colunas/triggers) sobrevivem; **RLS gerenciada pelo Lovable, não.**

**Lição de processo:** mudanças manuais de RLS via SQL Editor **não persistem**. Caminho durável = alterar RLS **pelo próprio Lovable** (entra na fonte de verdade dele).

### Impacto e decisão
`auth.uid()` nu vs `(select auth.uid())` = **só performance em escala** (avaliação por linha vs InitPlan); **mesmo valor retornado → zero impacto em segurança/isolamento**, imperceptível no volume atual. **Decisão: não reaplicar agora** (reaplicar no SQL Editor reverteria de novo no próximo sync). Revisitar **via Lovable** se/quando o volume crescer.

- [ ] *(opcional)* A1–A4 (saúde geral) — não coletado; rodar se quiser a foto completa.
- [ ] *(opcional, paz de espírito)* Confirmar que `auto_assign_workspace` é a versão corrigida (`ANY(... filter_tag_ids)`, não `jsonb_array_elements`):
  ```sql
  SELECT proname,
         (prosrc LIKE '%jsonb_array_elements%') AS tem_versao_quebrada,
         (prosrc LIKE '%= ANY(%')               AS tem_versao_corrigida
  FROM pg_proc WHERE proname = 'auto_assign_workspace';
  ```
