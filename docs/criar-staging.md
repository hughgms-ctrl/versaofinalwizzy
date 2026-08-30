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

## 0. O que precisa estar pronto

- **Docker rodando** (Docker Desktop aberto). É ele que empresta o `pg_dump`/`psql` — não precisa instalar
  cliente de Postgres na máquina.
- **CLI do Supabase** logado: `supabase login`.
- **Senha do banco de produção**: Dashboard → Settings → Database → Database password.
- **Projeto de staging já criado** no Dashboard, com a senha dele anotada.

> **Tamanho da máquina.** Para o número medido valer, o compute do staging tem que ser o MESMO da produção.
> Num projeto free (micro) o resultado sai pior do que a realidade — serve para achar erro, não para dizer
> "aguenta 98 números". Se for medir capacidade, suba o staging no mesmo plano e derrube depois do teste.

As duas URLs de conexão saem do Dashboard → **Connect** → aba **Session pooler** (a conexão direta
`db.<ref>.supabase.co` é IPv6 e costuma falhar em rede doméstica). O formato é:

```
postgresql://postgres.<ref>:[SENHA]@aws-0-<regiao>.pooler.supabase.com:5432/postgres
```

## 1. Extrair o schema de produção

```bash
# guarde a URL numa variável para a senha não ficar no histórico
export PROD_URL='postgresql://postgres.zaobtetbjpuzibjymhzw:[SENHA]@aws-0-<regiao>.pooler.supabase.com:5432/postgres'

supabase db dump --db-url "$PROD_URL" --schema-only -f staging-schema.sql
```

Confira o tamanho (`ls -lh staging-schema.sql`): alguns MB é o esperado. **Não commite o arquivo** — ele
descreve o banco inteiro.

O dump traz o schema `public` (tabelas, índices, funções, triggers, RLS). Não traz `auth`/`storage` (o projeto
novo já vem com eles), nem os crons, nem os buckets de Storage — esses três são recriados nos passos 4 e 5.

## 2. Restaurar no staging

```bash
export STAGING_URL='postgresql://postgres.<ref-staging>:[SENHA-STAGING]@aws-0-<regiao>.pooler.supabase.com:5432/postgres'

docker run --rm -i -v "$(pwd):/work" postgres:17   psql "$STAGING_URL" -v ON_ERROR_STOP=0 -f /work/staging-schema.sql
```

`ON_ERROR_STOP=0` é de propósito: o dump tenta recriar coisas que o projeto novo já tem (extensões, papéis) e
esses erros são esperados. O que importa é o passo 6 confirmar que as tabelas existem.

Se o `psql` reclamar de versão, troque a imagem para `postgres:15`.

Extensões que podem faltar (rode no SQL Editor do staging):

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

(São ~90 functions; leva alguns minutos.)

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
