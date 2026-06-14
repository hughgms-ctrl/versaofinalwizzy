# Baseline de Performance — "Antes" (Fase 0)

> Preencha os blocos de resultado rodando cada query no **Supabase SQL Editor**
> (projeto `zaobtetbjpuzibjymhzw`). Esta é a foto do "antes" para comprovar o ganho ao final.
> Data da coleta: __________

---

## 1. Top 20 queries por tempo total

> Requer a extensão `pg_stat_statements` habilitada (Database → Extensions).
> Se nunca foi resetada, os números são acumulados desde o último restart.

```sql
SELECT substr(query,1,120) AS query, calls, total_exec_time::int AS total_ms,
       mean_exec_time::int AS avg_ms, rows
FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 20;
```

**Resultado:**
```
(cole aqui)
```

---

## 2. Tamanho das tabelas (priorizar partição/retenção)

```sql
SELECT relname, n_live_tup AS linhas, pg_size_pretty(pg_total_relation_size(relid)) AS tamanho
FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 25;
```

**Resultado:**
```
(cole aqui)
```

---

## 3. Seq scans em tabelas grandes (candidatas a índice)

```sql
SELECT relname, seq_scan, idx_scan, n_live_tup
FROM pg_stat_user_tables WHERE n_live_tup > 1000 ORDER BY seq_scan DESC LIMIT 20;
```

**Resultado:**
```
(cole aqui)
```

---

## 4. Conexões em pico

> Painel Supabase → Database → Connections (ou a query abaixo em horário de pico).

```sql
SELECT count(*) AS conexoes, state FROM pg_stat_activity GROUP BY state ORDER BY count(*) DESC;
```

**Resultado:** ______ conexões em pico / max_connections do plano: ______
```
(cole aqui)
```

---

## Notas
- `pg_stat_statements` pode precisar de reset para medir só o período do teste: `SELECT pg_stat_statements_reset();` (opcional).
- Guardar este arquivo intacto; ao final do plano, rodar as mesmas queries em `baseline_after.md` e comparar.
