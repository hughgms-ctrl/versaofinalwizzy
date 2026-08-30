# Teste de carga da entrada de mensagens (Semana 4)

Fecha a pergunta da revisão (`docs/REVISAO_ESCALA_LANCAMENTO.md`): **~98 números recebendo mensagem ao mesmo
tempo, o sistema aguenta?** As Semanas 1–3 tiraram os gargalos que dava para ver lendo o código; isto mede.

O script é `scripts/load-test-webhook.mjs`. Ele injeta `messages.upsert` no `zapi-webhook` com o mesmo payload
que a Evolution manda, mede latência por requisição e conta status/erro.

> **Nunca contra produção.** Cada mensagem injetada cria contato e conversa de verdade e pode acordar IA,
> campanha e fluxo — que **tentam enviar** mensagem pelo provedor. Em produção isso vira mensagem para gente
> real. O script só envia com `--confirmo-staging`; sem a flag ele monta o payload e mostra na tela.

---

## Parte 1 — preparar o staging

1. **Projeto separado.** Um projeto Supabase de staging com o mesmo schema (todas as migrations aplicadas) e
   as edge functions deployadas.
2. **Org de teste limpa.** Crie uma organização só para isto. Ela precisa de:
   - instâncias em `whatsapp_instances` com `evolution_instance_name` = os nomes que você vai passar em
     `--instances` (podem apontar para uma Evolution que não existe: o teste mede a **entrada**, não o envio);
   - **nenhum agente de IA ativo**, **nenhuma campanha** com gatilho de palavra-chave ou `fallback`, e nenhum
     fluxo com gatilho de mensagem. Senão o teste vira também um teste de saída, e o resultado embaralha os
     dois caminhos.
3. **Instâncias.** Para valer o número da revisão, 98 linhas. Um jeito rápido de criar (staging!):

```sql
-- 98 instâncias de teste na org escolhida. Troque o uuid.
INSERT INTO public.whatsapp_instances (organization_id, evolution_instance_name, provider, status, is_active, phone_number)
SELECT '<uuid-da-org-de-teste>'::uuid,
       'carga-' || lpad(g::text, 3, '0'),
       'evolution',
       'connected',
       true,
       '55009' || lpad(g::text, 6, '0')
  FROM generate_series(1, 98) g
ON CONFLICT DO NOTHING;

-- A lista para o --instances-file
SELECT evolution_instance_name FROM public.whatsapp_instances
 WHERE organization_id = '<uuid-da-org-de-teste>'::uuid
 ORDER BY evolution_instance_name;
```

4. **Antes de começar, zere o contador das consultas** para o "depois" ser comparável:

```sql
SELECT pg_stat_statements_reset();
```

---

## Parte 2 — rodar

```bash
# ensaio: mostra o payload e não manda nada
node scripts/load-test-webhook.mjs \
  --url https://<ref-staging>.supabase.co/functions/v1/zapi-webhook \
  --instances-file instancias.txt --rate 2 --duration 1800

# para valer
node scripts/load-test-webhook.mjs \
  --url https://<ref-staging>.supabase.co/functions/v1/zapi-webhook \
  --token <x-webhook-token> \
  --instances-file instancias.txt --rate 2 --duration 1800 --confirmo-staging
```

98 instâncias × 2 msg/s = **196 requisições/s por 30 minutos ≈ 350 mil mensagens**. Comece menor
(`--duration 120`) para conferir que as mensagens estão entrando antes de rodar os 30 minutos.

A cada 10 s sai uma parcial; no fim, o relatório com p50/p95/p99. **Olhe a linha `NAO ENVIADAS (teto)`**: se
aparecer, o gargalo foi o próprio script (a máquina não deu conta), e a latência medida não é do servidor —
rode de uma máquina melhor ou divida em dois processos com metade das instâncias cada.

---

## Parte 3 — medir (durante e depois)

### 3.1 Entrou tudo?

```sql
-- Mensagens do teste que chegaram ao banco (o script mostra quantas mandou)
SELECT count(*) AS gravadas,
       min(created_at) AS primeira,
       max(created_at) AS ultima
  FROM public.messages
 WHERE content LIKE '[teste de carga]%';
```

`gravadas` tem que bater com as `200` do relatório. Diferença = mensagem perdida, e é o achado mais grave
possível aqui.

### 3.2 A caixa-preta ficou limpa?

```sql
-- Esperado: nada 'pending' com mais de 5 min, e zero 'failed'
SELECT status, count(*), min(created_at) AS mais_antigo
  FROM public.inbound_events
 GROUP BY status ORDER BY status;

SELECT id, event_type, instance_name, attempts, left(coalesce(last_error, ''), 200) AS erro
  FROM public.inbound_events
 WHERE status = 'failed'
 ORDER BY created_at DESC LIMIT 20;
```

### 3.3 Onde o banco gastou o tempo

```sql
SELECT calls,
       round(total_exec_time::numeric, 0) AS ms_total,
       round(mean_exec_time::numeric, 2) AS ms_media,
       rows,
       left(query, 140) AS consulta
  FROM pg_stat_statements
 ORDER BY total_exec_time DESC
 LIMIT 25;
```

O que **não** pode aparecer no topo: `UPDATE messages ... WHERE zapi_message_id` sem conversa (era o B1),
`SELECT ... FROM contact_tags` sem filtro, ou `UPDATE contacts` com contagem parecida com a de mensagens
(o `contacts` só deve ser atualizado quando algo muda de verdade).

### 3.4 Crons e conexões

```sql
-- Cron atrasado ou falhando durante a carga
SELECT j.jobname, d.status, count(*), max(d.start_time) AS ultima
  FROM cron.job_run_details d
  JOIN cron.job j ON j.jobid = d.jobid
 WHERE d.start_time > now() - interval '1 hour'
 GROUP BY 1, 2 ORDER BY 1, 2;

-- Conexões: 'active' alto e sustentado = o pool virou o gargalo
SELECT state, count(*) FROM pg_stat_activity GROUP BY state ORDER BY 2 DESC;

-- Fila do pg_net (trigger de tag, crons): não pode crescer sem parar
SELECT count(*) AS na_fila FROM net.http_request_queue;
```

### 3.5 Cadência por número

```sql
-- Quem bateu no teto durante o teste
SELECT s.instance_id, i.phone_number, s.used, s.window_started_at, s.updated_at
  FROM public.instance_send_slots s
  LEFT JOIN public.whatsapp_instances i ON i.id = s.instance_id
 ORDER BY s.updated_at DESC LIMIT 20;
```

---

## Parte 4 — o que conta como "passou"

| Medida | Meta | Se falhar |
|---|---|---|
| Mensagens gravadas ÷ status 200 | **1,00** | perda de mensagem: olhar `inbound_events` `failed` e o log do webhook |
| p95 do webhook | **< 1,5 s** | ver 3.3: alguma consulta voltou para o caminho quente |
| p99 do webhook | < 4 s | picos = fila no banco ou isolate reciclando |
| Status ≠ 200 | 0 (503 é aceitável e o provedor reenvia; 500 não) | 500 é bug, não carga |
| `inbound_events` pendente > 5 min | 0 | cron `reprocess-inbound-events` parado |
| Cron com `status <> 'succeeded'` | 0 | timeout de cron (conferir `timeout_milliseconds`) |
| `net.http_request_queue` | estável | trigger de tag ou cron inundando o pg_net |

---

## Parte 5 — limpar o staging

**Só em staging.** Apaga tudo que o teste criou:

```sql
BEGIN;

DELETE FROM public.messages
 WHERE conversation_id IN (
   SELECT c.id FROM public.conversations c
     JOIN public.contacts ct ON ct.id = c.contact_id
    WHERE ct.phone LIKE '5500900%'
 );

DELETE FROM public.conversations
 WHERE contact_id IN (SELECT id FROM public.contacts WHERE phone LIKE '5500900%');

DELETE FROM public.contacts WHERE phone LIKE '5500900%';

DELETE FROM public.inbound_events WHERE payload::text LIKE '%[teste de carga]%';

-- Confira antes de confirmar
SELECT count(*) FROM public.contacts WHERE phone LIKE '5500900%';   -- esperado: 0

COMMIT;
```

As instâncias `carga-%` podem ficar para o próximo teste; se quiser tirar:
`DELETE FROM public.whatsapp_instances WHERE evolution_instance_name LIKE 'carga-%';`

---

## Parte 6 — alertas (já implementados)

O que quebra em produção quase nunca é um erro na tela: é **silêncio**. Cron que parou não gera erro em lugar
nenhum — simplesmente nada acontece, e o follow-up do lead nunca sai. Por isso a vigilância é ativa.

**`health-watchdog`** (edge function) roda de 5 em 5 minutos, lê um retrato do banco pela RPC
`wz_health_snapshot()` (migration `20260830180000`) e manda evento para o Sentry quando algo está fora do lugar:

| tag `check` | dispara quando | nível |
|---|---|---|
| `cron_parado` / `cron_ausente` / `cron_desativado` | `process-flow-timeouts` ou `process-scheduled-messages` sem sucesso há 5 min; `reprocess-inbound-events` há 15 min; `auto-close-conversations` há 40 min | error |
| `cron_falhando` | qualquer cron com 5+ falhas em 2 h | warning |
| `inbound_falhado` | mensagem recebida que esgotou as tentativas — **mensagem perdida** | fatal |
| `inbound_pendente` | evento parado há mais de 10 min na fila de reprocesso | error |
| `campanha_parada` | item preso em `processing` (>15 min) ou pendente vencido | error |
| `fluxo_zumbi` | execução `running` sem batimento há 15 min (conversa do lead fica muda) | error |
| `agendamento_atrasado` | disparo vencido há 10 min sem sair, ou preso em `processing` | error |
| `pg_net_inflando` | fila do `pg_net` acima de 1000 | warning |
| `watchdog_cego` / `watchdog_quebrado` | o próprio vigia falhou (silêncio dele não pode ser lido como "tudo bem") | error |
| `webhook_500` | `zapi-webhook` devolveu 500 (erro não tratado) | error |

Cada verificação tem `fingerprint` fixo: no Sentry vira **uma issue por tipo de problema**, que volta a subir
enquanto durar, em vez de uma issue nova a cada 5 minutos.

### O que falta fazer no Sentry (interface)

Uma regra de alerta cobre tudo, porque todo evento do backend vem com a tag `check`:

1. **Alerts → Create Alert → Issues**
2. Condição: *The issue is seen more than 1 time in 5 minutes* (ou "A new issue is created").
3. Filtro: **`check` is set** (ou `server_name` equals `health-watchdog`).
4. Ação: e-mail/Slack para quem está de plantão.

Vale uma segunda regra separada só para o que é perda de dado, com notificação mais barulhenta:
filtro **`check` equals `inbound_falhado`** — cada evento desse é uma mensagem de cliente que não entrou.

### Conferir que está de pé

```sql
-- o retrato cru, sem depender da function
SELECT jsonb_pretty(public.wz_health_snapshot());

-- o cron do vigia
SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'health-watchdog';
```

E, para forçar um evento de teste no Sentry, desative por um minuto um cron crítico
(`UPDATE cron.job SET active = false WHERE jobname = 'process-flow-timeouts';`), espere a rodada do vigia,
confirme o alerta e **reative**.
