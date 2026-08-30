# Criar o staging (pré-requisito do teste de carga)

O teste de carga da Semana 4 precisa de um projeto separado. Este é o caminho mais curto até ele.

## Por que não dá para subir o staging pelas migrations

`supabase db push` / branching / `supabase start` **falham** neste repo: o histórico de migrations não é
replicável do zero — `app_role` é criado duas vezes, com definições conflitantes, e a segunda quebra
(`type "app_role" already exists`). É um problema antigo (jan/fev), não da revisão de escala.

Consertar o histórico é um trabalho à parte e arriscado. Para ter staging hoje, o atalho é **copiar o schema
que está rodando** — que é a fonte de verdade de qualquer jeito.

> **Só o schema, nunca os dados.** Conversa, telefone e mensagem de cliente não saem de produção para um
> ambiente de teste. Fora a questão legal, dado real em staging vira mensagem real quando alguém esbarra num
> fluxo com envio ligado.

## 1. Extrair o schema de produção

Precisa da senha do banco (Supabase → Settings → Database → Database password) e do CLI do Supabase.

```bash
supabase db dump \
  --db-url "postgresql://postgres:[SENHA]@db.zaobtetbjpuzibjymhzw.supabase.co:5432/postgres" \
  --schema-only \
  -f staging-schema.sql
```

O arquivo tem senha na linha de comando: rode num terminal seu, não em CI, e **não commite o dump**.

## 2. Criar o projeto e restaurar

1. Novo projeto no Supabase (mesma região da produção, para a latência medida fazer sentido).
2. Restaurar:

```bash
psql "postgresql://postgres:[SENHA-STAGING]@db.<ref-staging>.supabase.co:5432/postgres" \
  -f staging-schema.sql
```

3. Extensões que o dump pode não trazer, se derem erro no passo seguinte:

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;
```

## 3. Deployar as edge functions

```bash
supabase functions deploy --project-ref <ref-staging>
```

E os secrets (Supabase → Edge Functions → Secrets). O mínimo para o teste de **entrada**:

| Secret | Valor no staging |
|---|---|
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | os do próprio staging (já vêm preenchidos) |
| `ZAPI_CLIENT_TOKEN` | um token qualquer — é o que o script manda em `--token` |
| `EVOLUTION_API_KEY` / `EVOLUTION_BASE_URL` | **apontar para um endereço que não existe** (ex.: `https://evolution.invalido.local`) |
| `WIZZY_OPENAI_API_KEY` / `OPENAI_API_KEY` | **não configurar** |

As duas últimas linhas são a trava de segurança: mesmo que algum fluxo dispare por engano, não há para onde
enviar nem com que chave chamar a IA.

## 4. Crons no staging

O teste mede a entrada, mas os jobs precisam existir para o `reprocess-inbound-events` funcionar e para o
`health-watchdog` ter o que vigiar. Reaproveite o bloco da seção 5 de `REVISAO_ESCALA_LANCAMENTO.md` e as
migrations `20260830150000`, `20260830160000`, `20260830170000` e `20260830180000` — **trocando a URL** de
`zaobtetbjpuzibjymhzw` pelo ref do staging em todo `net.http_post`.

Confira depois:

```sql
SELECT jobname, schedule, active,
       command LIKE '%<ref-staging>%' AS url_certa
  FROM cron.job ORDER BY jobname;
```

Uma URL de produção sobrando num cron de staging faria o staging disparar trabalho **na produção**.

## 5. Org e instâncias de teste

Siga a Parte 1 de `docs/teste-de-carga.md`: criar a org, as 98 instâncias `carga-NNN` e conferir que ela não
tem agente de IA, campanha com gatilho nem fluxo por mensagem.

## 6. Conferir antes de disparar carga

```sql
-- Schema completo? (esperado: as tabelas quentes existirem)
SELECT to_regclass('public.messages'), to_regclass('public.conversations'),
       to_regclass('public.inbound_events'), to_regclass('public.instance_send_slots');

-- RPCs da revisão (esperado: 5+ linhas)
SELECT proname FROM pg_proc
 WHERE proname IN ('claim_campaign_queue','claim_inbound_events','try_acquire_send_slot',
                   'wz_health_snapshot','increment_unread','merge_conversation_metadata');
```

Depois mande **uma** mensagem pelo script (`--duration 5 --rate 1 --instances carga-001 --confirmo-staging`) e
confirme que ela virou linha em `messages`. Só então rode os 30 minutos.

---

## Alternativa sem staging (não recomendada)

Se o staging não sair antes do lançamento, **não** rode 196 req/s contra produção. O máximo defensável é um
teste-fumaça em horário morto, numa org interna dedicada: `--instances` com 5 instâncias de teste,
`--rate 1 --duration 60` (300 mensagens), seguido da limpeza da Parte 5. Isso confirma que o caminho quente
está de pé, mas **não** responde a pergunta da revisão — carga alta só se mede onde a queda não custa cliente.
