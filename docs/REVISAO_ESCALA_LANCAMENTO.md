# Revisão de escala para o lançamento — Wizzy

> Revisão completa do código em 2026-08-29, com foco numa pergunta só: **o sistema aguenta 100 usuários
> simultâneos e ~98 números conectados, espalhados por várias orgs, recebendo mensagens, disparando e
> agendando campanhas, criando e executando fluxos ao mesmo tempo?**
>
> Seis frentes revisadas linha a linha: entrada de mensagens (`zapi-webhook`, 4.2k linhas), motor de fluxos
> (`flow-execute` + `process-flow-timeouts`), envio/campanhas/agendamento, IA (`agent-orchestrator`),
> banco (índices, RLS, triggers, cron, realtime) e frontend (realtime, polling, listas).
> Cada achado aponta `arquivo:linha`. O que já estava resolvido em `PLANO_OTIMIZACAO.md` /
> `PLANO_BOOT_E_PRODUCAO.md` / `PRONTIDAO_PRODUCAO.md` **não** é repetido aqui.
>
> Severidade: 🔴 crítico (quebra ou perde dado na carga alvo) · 🟠 alto (degrada muito) · 🟡 médio · ⚪ baixo.

---

## 0. Veredito

**Hoje, não.** As funcionalidades estão completas, mas a arquitetura de concorrência não foi pensada para
muitos números ao mesmo tempo. Os problemas se concentram em quatro padrões que se repetem em todo o backend:

1. **Ler-depois-escrever sem lock** (contatos, `conversations.metadata`, `flow_executions`, `campaign_queue`,
   `organization_usage`, `unread_count`) → sob concorrência: envio duplicado, fluxo rodando 2x, estado perdido.
2. **Chamadas HTTP sem timeout no caminho quente** (download de mídia, transcrição, webhooks de fluxo,
   orquestrador) → uma Evolution lenta segura isolates até o limite e a mensagem se perde.
3. **Trabalho síncrono demais antes de responder 200 ao provedor** (18–25 round-trips por texto, 12 s de
   espera por áudio, 2 s por eco da IA, log do payload inteiro com base64).
4. **Custo que escala com a plataforma, não com a org** (canal realtime de `messages` sem filtro de org,
   acks que varrem `messages` inteira, trigger de tag que faz 1 HTTP por linha, lista de conversas refeita a
   cada "digitando…").

Nada disso exige reescrever o sistema. É um conjunto de ~25 correções cirúrgicas + ~15 índices/crons em SQL.
Com o plano da seção 4 dá para lançar em um mês com margem.

### Sobre "sair do Lovable"

**O Lovable não é o gargalo — não precisa sair dele para aguentar esse volume.** O Lovable só hospeda o
frontend estático e faz o sync do código. Quem processa carga é o **Supabase** (edge functions, Postgres,
Realtime) e a **Evolution API**. O que precisa ser garantido, em ordem:

| Componente | O que checar antes de lançar |
|---|---|
| **Supabase — Compute** | Plano Pro com compute ≥ **Small/Medium** (o Micro tem ~10 conexões diretas e CPU compartilhada — não aguenta 98 números + cron + realtime). Ligar **PITR**. |
| **Supabase — Edge Functions** | Limite de wall-clock e de invocações do plano. Os isolates presos (achados 1.2, 2.3, 4.3) consomem concorrência de todas as orgs. |
| **Supabase — Realtime** | Limite de conexões/mensagens do plano; o canal de `messages` sem filtro (achado 6.2) multiplica o custo por usuário online. |
| **Evolution API** | Instância dedicada, com RAM proporcional (~150–300 MB por número → 98 números = 16–32 GB), Postgres/Redis próprios, e **`webhook.headers` com segredo** (achado 1.5). É o único ponto único de falha para todos os números. Considere 2 instâncias (49+49) para não derrubar tudo junto. |
| **Lovable** | Só o gotcha já conhecido: ele reverte RLS no sync. Toda mudança de policy tem que ir pelo Lovable. |

O que **vale** considerar é tirar o processamento pesado de dentro de edge functions (motor de fluxo,
disparo em massa) para um worker próprio (Node numa VPS, consumindo filas do Postgres) — mas isso é evolução
pós-lançamento, não pré-requisito. O `docker-compose.yml` já prepara o front na VPS se quiser sair do
hosting do Lovable por custo, sem perder o sync.

---

## 1. Os 12 bloqueadores (resolver antes de lançar)

| # | Achado | Onde | Efeito na carga alvo |
|---|---|---|---|
| 🔴 B1 | Ack de entrega/leitura e revogação filtram só `zapi_message_id`, coluna que **não tem índice próprio** (o índice é `(conversation_id, zapi_message_id)`) | `zapi-webhook/index.ts:744-749, 815-822` | 3 varreduras completas de `messages` por mensagem enviada × 98 números = maior carga do banco |
| 🔴 B2 | Mídia só é gravada **depois** de até 7 chamadas sequenciais à Evolution **sem timeout**; INSERT em `:2390` | `zapi-webhook/index.ts:1849-1892, 1736-1771, 1962` | Evolution lenta → isolate morto → mídia de todas as orgs perdida, sem retry |
| 🔴 B3 | Falha de infraestrutura no INSERT da mensagem (ou `instance_not_found`, ou 23505 do contato na corrida) devolve **200** → provedor não reenvia | `zapi-webhook/index.ts:1238-1241, 1379, 2404-2407, 3286-3302` | Perda silenciosa de mensagem em pico |
| 🔴 B4 | Webhook aceita POST **sem token** (só valida se o header vier; `zapi-configure-webhook` não configura `headers`) e resolve instância por nome sem unique → duas orgs com instância "principal" = `maybeSingle` erra = mensagens das duas descartadas | `zapi-webhook/index.ts:1031-1034, 1651-1660`; `zapi-configure-webhook/index.ts:96-104` | Qualquer um desconecta/injeta em qualquer org; DoS mútuo entre orgs |
| 🔴 B5 | Retomada de fluxo **sem CAS**: webhook lê execução, fecha por `id` e chama `flow-execute`, que sempre INSERE execução nova | `zapi-webhook/index.ts:2497-2508, 2613-2931`; `flow-execute/index.ts:437-451` | Duas msgs do mesmo contato em 200 ms = fluxo rodando 2x, contato recebe tudo duplicado |
| 🔴 B6 | `process-flow-timeouts` e `auto-close-conversations` **não têm cron no repo** | `supabase/migrations/*` (ausente); `docs/diagnostico-execucoes-zumbi.sql:50-56` | Atraso, follow-up e fase 0 (anti-zumbi) dependem de job criado à mão no painel |
| 🔴 B7 | Execução `running` morta no meio de um nó não é marcada `failed` (catch só faz `break`); fetches de provedor/webhook sem timeout; mensagens do lead são **descartadas** enquanto está `running`/`waiting_delay` | `flow-execute/index.ts:684-693, 2708, 2792, 3930`; `zapi-webhook/index.ts:2932-2951` | Lead fica mudo por 15 min (e só se B6 existir) |
| 🔴 B8 | `process-campaign-queue`: select-then-update sem lock, `limit(10)`/min global, sem retry, item `processing` órfão fica preso para sempre | `process-campaign-queue/index.ts:19-40, 68` | Ticks sobrepostos = fluxo 2x; teto de 600 disparos/h para a plataforma inteira |
| 🔴 B9 | Debounce da IA protege só a janela de 8 s; durante a execução (5–40 s+) nova mensagem abre orquestrador paralelo na mesma conversa; ambos fazem read-modify-write de `conversations.metadata` inteiro | `zapi-webhook/index.ts:42-114`; `agent-orchestrator/index.ts:2932-2937`; `flow-execute/index.ts:1983-1990` (chama direto, sem debounce) | Duas respostas ao contato + estado do fluxo/handoff perdido |
| 🔴 B10 | Trigger `on_contact_tag_added_campaign` faz **1 `net.http_post` por linha** de `contact_tags`, mesmo sem campanha `tag_added` na org | `migrations/20260309003415:24`; `trigger-campaign-on-tag/index.ts:66-80` | Import de 5k contatos = 5k invocações; fila do pg_net infla e derruba os outros crons |
| 🔴 B11 | Canal de notificação assina `messages` **da plataforma inteira** (`direction=eq.inbound`, sem org) — Realtime avalia RLS por assinante por INSERT — e faz 1–3 SELECTs por evento em cada cliente | `useNewMessageNotifications.ts:174-227`; `usePipelineRealtime.ts:358-380` (`contact_tags` sem filtro) | Custo = msgs da plataforma × usuários online |
| 🔴 B12 | Lista de conversas (`useInfiniteQuery`) é **invalidada inteira** a cada evento de `contact_presence` ("digitando") e de `conversations` | `useConversations.ts:264-308, 133-177` | ~40 refetches/min por usuário de uma query com 3 joins; UI trava, banco enfileira |

> **Estado em 2026-08-30 — Semanas 1 e 2 FECHADAS (código deployado, SQL aplicado).** B3 completo: além do
> 503, o payload cru de todo evento de mensagem vai para `inbound_events` antes de processar e o que ficar
> `pending` é reenviado ao webhook por `reprocess-inbound-events` (migration `20260830150000` APLICADA, crons
> `reprocess-inbound-events` e `purge-inbound-events` AGENDADOS). Áudio do contato não segura mais o isolate:
> a mensagem é gravada, o webhook responde 200 e mídia → transcrição → roteamento rodam em background.
> `idx_flow_executions_one_live` CRIADO pelo roteiro de `docs/fechar-execucoes-duplicadas.sql`, com o par
> `(conversation_id, flow_id)` — a versão por conversa do texto abaixo quebraria sub-fluxo e campanha
> interruptora. Pendente da Semana 1: backfill de `messages.organization_id` (entra junto com o B11).
> **Próximo: Semana 3.**
>
> **Semana 3 em andamento — B12 e B11 FECHADOS no código (frontend).** B12: `contact_presence` saiu dos
> canais da lista (o indicador por linha vem do `PresenceStore` via `ContactPresenceDot`) e o evento de
> `conversations` virou patch cirúrgico no cache (`src/lib/conversationsCache.ts`, com teste) — só conversa
> nova, conversa fora das páginas carregadas ou `last_message_at` mudado disparam uma busca pontual por id,
> agrupada em 600 ms num `.in('id', ...)`. Um canal por (org × lista) com refcount, porque `useConversations`
> é montado por vários diálogos ao mesmo tempo. B11: canal de notificação passa a filtrar
> `organization_id=eq.<org>` em `messages`, pula o que não é `inbound` e lê a conversa do cache da lista antes
> de ir ao banco; o `invalidate(['conversations'])` por mensagem recebida saiu (o patch do B12 cobre o
> não-lido). **PENDENTE À MÃO: migration `20260830160000_messages_organization_id.sql`** (coluna + trigger) e,
> depois, o backfill de `docs/backfill-messages-organization-id.sql`. Enquanto ela não for aplicada, o hook
> detecta a ausência da coluna e mantém o comportamento antigo — notificação continua funcionando, sem o ganho.
>
> **Semana 3 — frontend FECHADO.** Além de B12/B11: `useFollowUpStatus` (org + paginação + patch + 1 canal),
> sync do provedor ao abrir conversa só quando o banco está vazio (e a busca de perfil duplicada saiu),
> `usePipelineRealtime` sem a assinatura paralela de `conversations`, índices `contato→tags` e `conversa→funis`
> no lugar de varredura por linha, posições do funil paginadas, Instagram só com conta conectada,
> `useWhatsAppStatus` como query compartilhada + realtime de `whatsapp_instances` (era 1 `setInterval` de 30 s
> por montagem batendo no provedor), lista de conversas virtualizada, marcar como lida por patch, sentinela
> `'unassigned'` tratada em campanhas e funil. Novos utilitários: `src/lib/conversationsCache.ts` (com teste),
> `src/lib/sharedRealtime.ts`, `src/lib/fetchAllPages.ts`, `src/lib/workspaceId.ts`.
>
> **Semana 3 — backend FECHADO no código.** Telemetria do webhook (`whatsapp_connection_logs`) só em evento de
> conexão e em `runBackground`; log do payload sem base64 e truncado; `contacts` só é atualizado quando algo
> mudou de verdade; `platform_settings` com cache de 60 s por isolate (`_shared/platformSettings.ts`) usado no
> envio, no orquestrador e na estratégia de IA; cadência por número (`try_acquire_send_slot`, migration
> `20260830170000`) chamada nos dois caminhos de envio; timeouts em validação de mídia, `whatsappNumbers` e nos
> POSTs ao provedor de `zapi-send-message`, que também pula a validação para URL do nosso próprio Storage.
>
> **APLICADO em 2026-08-30:** migrations `20260830160000` (`messages.organization_id` + trigger) e
> `20260830170000` (`instance_send_slots` + `try_acquire_send_slot`) rodadas no SQL Editor, e o backfill de
> `docs/backfill-messages-organization-id.sql` concluído. Ou seja: o canal de notificação já filtra por
> organização (o hook detecta a coluna sozinho no carregamento) e a cadência por número já age nos dois
> caminhos de envio. Com isso a Semana 3 está fechada, código e banco.
> **Próximo: Semana 4 (teste de carga e observabilidade).**

Também bloqueador, mas **operacional** (não é código): confirmar no banco vivo se as migrations
`20260817120000` + `20260817230000` (dispatcher de agendamento) e `20260829120000` (`contact_number_owners`)
foram aplicadas — `docs/diagnostico-agendamento-parado-2.sql`. Sem o dispatcher, o agendamento roda no
modo varredura: 50 s, em série, **4–5 contatos/minuto para a plataforma inteira**.

---

## 2. Achados por área

### 2.1 Entrada de mensagens (`zapi-webhook`)

| Sev | Achado | Onde | Fix |
|---|---|---|---|
| 🔴 | B1 ack varre `messages` | `:744-749, :3058, :815-822` | `CREATE INDEX ... messages(zapi_message_id) WHERE NOT NULL` + restringir UPDATE às conversas da instância do payload (`instanceName` já vem em `:3033`) |
| 🔴 | B2 mídia depois de 7 fetches sem timeout | `:1849-1892, :1736-1771, :1962, :2390` | Gravar mensagem com `media_pending`, responder 200, baixar/subir em `runBackground`; `AbortSignal.timeout(10s)`; no máx. 2 corpos |
| 🔴 | B3 falha vira 200 | `:1238-1241, :1379, :2404-2407` | Separar erro de negócio (200) de infra (503); gravar payload bruto em `inbound_events` antes de processar, com job de reprocesso |
| 🔴 | B4 sem auth + nome de instância ambíguo | `:1031-1034, :1651-1660`; `zapi-configure-webhook:96-104` | `webhook.headers: {x-webhook-token}` por instância e exigir sempre; unique parcial em `whatsapp_instances(evolution_instance_name)`; `.limit(2)` e recusar ambiguidade |
| 🟠 | Corrida em `findOrCreateContact`: busca por até 6 variantes, INSERT não trata `23505` (a unique `(org, phone)` existe) → cai em B3; `mergeDuplicateContactConversations` roda no caminho quente sem transação | `:3222-3228, :3286-3302, :3305-3404` | Tratar 23505 re-selecionando (como `:3442-3455` já faz); mover merge para job |
| 🟠 | 18–25 round-trips sequenciais por texto (2 lookups de instância, 2 auditorias, presença, connection_log, UPDATE contacts sempre, N+1 em `contact_tags` por master prompt) | `:1062-1085, :1640-1660, :3155-3302, :2150-2430, :3463-3487` | Passar `auditInstance` adiante; telemetria em `runBackground`; UPDATE só se mudou; RPC `wz_resolve_inbound_trigger` unindo campanhas + master prompts + tags. Meta: ≤ 8 |
| 🟠 | `whatsapp_connection_logs` recebe INSERT por **todo** evento (presença, ack) | `:1062-1085` | Só `connection.update` e erros |
| 🟠 | `console.log(JSON.stringify(payload))` com base64 de mídia (webhookBase64=true) | `:1043, :1378, :1432, :1441` | Logar só tipo/instância/key/tamanho |
| 🟠 | Debounce da IA é `setTimeout(8000)` no isolate; se o isolate morre, `pending_ai_trigger` fica gravado e ninguém dispara | `:42-114` | Tabela `ai_trigger_queue(conversation_id, fire_at)` + cron curto; webhook só grava |
| 🟠 | Read-modify-write de `conversations.metadata` em 6+ pontos (debounce, handoff, pausa da IA) → lost update | `:55-62, :96-98, :2651-2906` | RPC `merge_conversation_metadata` (`metadata \|\| $1` / `- 'chave'`) |
| 🟠 | `connection.update` grava status com `.then()` solto (sem `await`/`waitUntil`) | `:1133-1146` | `await` — é 1 query. Causa provável do "conecta mas não envia" |
| 🟡 | `unread_count = lido + 1` no cliente | `:2429-2430` | RPC `increment_unread` |
| 🟡 | Espera síncrona: 12 s por transcrição de áudio, 2 s por eco `fromMe` em modo IA | `:2473-2477, :2214` | Eco: INSERT direto tratando 23505; áudio: responder e rotear no background |
| 🟡 | Busca de contato por `metadata->>'wa_lid'` sem índice | `:4174` | `contacts(organization_id, (metadata->>'wa_lid'))` |
| 🟡 | Presença/ack fazem 3–5 queries cada | `:3098-3146, :877-909` | Desligar `PRESENCE_UPDATE` na inscrição ou throttle no upsert |
| 🟡 | `flow_executions` com `flows(nodes,edges)` inteiros por mensagem | `:2498-2508` | Colunas enxutas; nodes/edges só ao retomar |
| 🟡 | `startCampaignFlow` grava `'ia'` antes do fluxo; falha só logada | `:3752, :3853-3875` | Marcar no `flow-execute` ou reverter no catch |
| 🟡 | `campaign-webhook` processa 100 itens em série com fetch aguardado | `campaign-webhook:326-530` | Enfileirar em `campaign_queue` e devolver 202 |
| 🟡 | `trigger-campaign-on-tag` ignora erro do INSERT de conversa | `:119-134` | Logar; massa via fila (ver B10) |
| ⚪ | `contact/info` da UAZAPI chamado em instância Evolution | `:2105-2128` | Condicionar ao provider |

### 2.2 Motor de fluxos (`flow-execute`, `process-flow-timeouts`)

| Sev | Achado | Onde | Fix |
|---|---|---|---|
| 🔴 | B5 retomada sem CAS; `flow-execute` sempre insere | webhook `:2497-2931`; `flow-execute:437-451` | `update().eq('id').eq('status','waiting_input').select()` e só seguir se voltou linha; **unique parcial** `flow_executions(conversation_id) WHERE status IN (live)` — mesmo padrão do Instagram (`idx_instagram_flow_executions_one_live`) |
| 🔴 | B6 sem cron | — | SQL na seção 5 |
| 🔴 | B7 execução morta fica `running`; fetches sem timeout; mensagem do lead descartada | `:684-693, :2708, :2792, :3930`; webhook `:2932-2951` | `catch` → `failed` + cleanup; `AbortSignal.timeout(15s)`; heartbeat por nó e fase 0 com corte de 3 min; em `waiting_delay` deixar campanha interruptora/agente rodar |
| 🟠 | `process-flow-timeouts` sequencial, `limit` sem `ORDER BY`, sem claim, sem justiça por org; fase 2 grava `remarketing_step` **depois** de enviar; N+1 em `contactRespondedAfterLastFollowUp` | `:476, :527, :574, :616, :675, :773-1108, :1017-1020` | Claim com `FOR UPDATE SKIP LOCKED`; `ORDER BY timeout_at`; `row_number() OVER (PARTITION BY org) <= 5`; concorrência limitada; gravar step antes de enviar |
| 🟠 | Tempo de parede: `setTimeout` por item (até 45 s), 800 ms entre itens, 2 s após sub-fluxo, recursão A→B→A sem limite | `:2495-2596, :3548, :676, :2076, :2062-2090` | Delay > 5 s vira `resumeAt`; remover o sleep de 2076; `depth` no corpo, recusar > 5 e sub-fluxo já vivo na conversa |
| 🟠 | `cleanupFlowEnd` escolhe o "pai" pelo mais recente (pode ser a cópia gêmea de B5) e devolve para humano sem saber quem configurou; `triggers_count` lido-e-escrito | `:496-543, :570-640, :545-548` | `parent_execution_id` na filha; retomar só ela com CAS; contador via SQL |
| 🟡 | `execution_log` reenviado inteiro a cada nó (O(n²)); `input_data` copia o `data` do nó; `variables` sem teto (webhook externo mescla JSON inteiro) | `:664-672, :4086-4096, :1938-1940, :2141, :3945` | Log só em `flow_node_logs`; `input_data` = `{label,type}`; teto 32 KB + allowlist |
| 🟡 | `select('*')` em `flows`, `conversations, contacts(*)`; cron traz `flows(nodes,edges)` 50× por tick | `:270-286`; timeouts `:523, :671` | Colunas explícitas; `Map` de flows por lote |
| 🟡 | Ações gravam `tag_id`/`column_id`/`workspace_id` do JSON do nó sem validar org | `:3474-3478, :1594-1596` | Validar contra `context.organizationId` |
| ⚪ | Fase 2 marca `running` antes de chamar; falha de HTTP deixa zumbi | timeouts `:822-827, :1031-1037` | Helper `claimAndResume()` que reabre em falha |

### 2.3 Envio, campanhas e agendamento

| Sev | Achado | Onde | Fix |
|---|---|---|---|
| 🔴 | B8 `campaign_queue` sem lock/retry/órfão | `process-campaign-queue:19-40, 68` | RPC `claim_campaign_queue` (seção 5); `claimed_at`; retry 3x; limite por org no lote |
| 🔴 | Dispatcher do agendamento possivelmente não aplicado (modo varredura) | `20260817120000`, `20260817230000`; `process-scheduled-messages:17-31, 368-412` | Rodar diagnóstico e aplicar; depois `?mode=scan` só manual |
| 🟠 | `DISTINCT ON (organization_id)`: org com 3 números usa 1 por vez; e nada limita cadência do **número** quando chat + fluxo + notificação + agendamento usam o mesmo | `20260817230000:43`; `:783-839` | Materializar `resolved_instance_id` no claim e `DISTINCT ON` por ele; rate limit por instância no banco (`try_acquire_send_slot`) chamado em `sendWhatsAppMessage` |
| 🟠 | `messages.insert` falha silenciosamente e o envio segue como sucesso; `zapi-send-message` devolve `messageId: 'sent-<ts>'` falso | `process-scheduled-messages:651-669`; `zapi-send-message:777-779, 800, 942-944` | 23505 → buscar existente; outro erro → `failed` com motivo; nunca id fake |
| 🟠 | `delay_between_contacts` pode ser `null` (UI grava null quando 0) → envio sem pausa; todo controle de cadência é `setTimeout` por isolate | `:795-797`; `useScheduledMessages.ts:212` | Delay mínimo no backend (3 s) |
| 🟠 | Janela fetch→`markContact` sem estado `sending`; mídia de 90 s pode passar do `deadlineAt`; timeout vira `failed` e retomada manual reenvia | `:37, :173, :198-254, :634, :812` | Marcar `sending` antes do fetch; `deadlineAt - timeoutMs`; timeout → `unknown` |
| 🟠 | Gap de ≥60 s entre fatias de 240 s; claim perdido = 3 min; 2.000 contatos com delay 10 s ≈ 2–2,5 h ocupando o slot da org | `:28, :316, :784` | Job se re-despacha via `waitUntil` ao sair por orçamento; cron vira rede de segurança |
| 🟡 | `fetchPendingContactPage` sem `ORDER BY`; `markContact` não checa erro → mesmo contato na próxima página | `:580-611` | `.order('created_at').order('id')`; abortar job se `markContact` falhar |
| 🟡 | `zapi-send-message`: 8–10 queries antes do provedor, `platform_settings` lido 2x por envio (linha mais quente do banco), HEAD/GET de mídia e `whatsappNumbers` sem timeout | `:397-634` | Cache de `platform_settings` por isolate (TTL 60 s); `AbortSignal.timeout(5s)`; pular validação para Storage próprio |
| 🟡 | `stage-notification` sem timeout, dedupe check-then-act, usa número `is_active` da org e não do workspace | `stage-notification:~470, ~555, 361-371` | Migrar para `sendWhatsAppMessage`; dedupe por unique |
| 🟡 | `usage.ts` pagina `messages` inteira via PostgREST (1000/página) 1×/12h | `_shared/usage.ts:164-236` | RPC SQL agregada; marcar `platform_job_runs` só no fim |
| ⚪ | `preloadConversations` insere um a um e o SELECT não filtra org (não usa o índice composto) | `:521-574` | `.eq('organization_id')` + upsert `ignoreDuplicates` |
| ⚪ | `zapi-send-presence` faz 3 queries antes de descobrir que é Evolution e sair | `:30-53` | Checar provider antes; debounce no cliente |

### 2.4 IA (`agent-orchestrator`)

| Sev | Achado | Onde | Fix |
|---|---|---|---|
| 🔴 | B9 orquestradores paralelos na mesma conversa | webhook `:42-114`; orchestrator `:2932-2937`; `flow-execute:1983-1990` | Lock por conversa em `metadata.ai_run_lock` com UPDATE condicional (ou `pg_advisory_xact_lock`); mensagem chegando durante o run → 1 debounce ao final |
| 🔴 | `recordAIUsage` SELECT→UPDATE não atômico; hot row por org; INSERT concorrente na virada do mês viola unique e é ignorado | `:3729-3757` | RPC `increment_ai_usage` com `INSERT ... ON CONFLICT DO UPDATE SET ai_requests = ai_requests + 1` |
| 🟠 | Sem orçamento global: 40 s × 3 rodadas + 15 s recovery + delays de nó até 25 s × 20 nós; `evaluateCondition` sem timeout; estado só persistido no fim | `:1646, :2047, :2479, :3386, :2434, :1322, :1051, :1033` | Orçamento total ~55 s; timeout 20 s na condição; delay máx 5 s inline; persistir estado após cada nó |
| 🟠 | 429/5xx/401 do provedor: `console.error` + `break` → `replies: []`, `success: true`; org não descobre que a IA parou | `:1659-1663, :2060-2064, :2489` | 1 retry com backoff em 429/5xx; 401/402 → `integration_configs.ai_last_error` + nota interna + `'ativo'`; gravar erro em `agent_execution_logs` |
| 🟠 | Corpo cru do erro do provedor e `fnArgs` (CPF, endereço) vão para o log | `:1661, :2062, :1696, :2097, :889` | `redactSecrets()` + truncar; logar só nomes de tools |
| 🟠 | 80 mensagens inteiras + prompt com todas as tags/pipelines (UUIDs) + "LEMBRETE FINAL" duplicado; bloco temporal no meio invalida prompt caching | `:394-395, :654-672, :639, :720, :617` | 30–40 msgs com truncamento; tags/pipelines como `enum` nas tools; bloco temporal por último |
| 🟡 | RAG: 3 idas sequenciais + `ivfflat` global filtrado por `agent_id` depois (recall cai); RPC sem `organization_id` | `agentKnowledge.ts:330-356`; `20260722170000:52-85` | `hnsw`; `_organization_id` na RPC; timeout no embedding |
| 🟡 | Encerrar/escalar não limpa `orchestration_state`; reativar `'ia'` cai em "Flow complete" e muda para sempre | `:1057, :1308, :2624, :2771`, `:156-168` | Limpar estado na mesma instrução; limpar ao voltar para `'ia'` |
| 🟡 | 11 queries paralelas + 6 sequenciais por turno; `ai_agents` lido 2x; `whatsapp_instances select('*')` | `:280-511, :3486-3554` | RPC `load_ai_turn_context`; cache 60 s de `platform_settings` |
| 🟡 | `agent_execution_logs` grava `provider_response` inteiro; sem índice por org | `:556-565`; `20260214050320` | Índice `(organization_id, created_at)`; gravar só nome/args/success |
| 🟡 | Transcrição sem timeout; webhook espera 12 s + orquestrador faz polling de 5 s | `transcribe-media:466-668`; orchestrator `:218-246` | `AbortSignal.timeout(20s)`; não esperar no webhook |
| ⚪ | `openai-usage-status` chave admin em `platform_settings` em texto plano | `:88-100` | Vault; cache 15 min |

### 2.5 Banco (índices, RLS, triggers, cron, realtime, retenção)

| Sev | Achado | Onde | Fix |
|---|---|---|---|
| 🔴 | B6 crons ausentes | — | seção 5 |
| 🔴 | B10 trigger de tag faz HTTP por linha | `20260309003415:24` | Curto-circuito no trigger (seção 5); depois: INSERT em `campaign_queue` em vez de HTTP |
| 🔴 | B11 `messages` sem `organization_id` → realtime e RLS por `EXISTS` em `conversations` | `types.ts` (16 colunas); `20260614120000` | Coluna + trigger de preenchimento + backfill em lotes + índice `(organization_id, created_at)`; policy vira igualdade (seção 5) |
| 🟠 | `flow_executions` sem índice por `conversation_id` (query em **toda** mensagem recebida) | `20260122152606:20-32` | Parcial `(conversation_id) WHERE status IN (live)` + unique parcial (B5) |
| 🟠 | `contact_tags` sem índice por `tag_id`; RLS faz lookup em `contacts` por linha | `20260122192147:14-22` | `(tag_id, contact_id)`; denormalizar `organization_id` |
| 🟠 | Busca de contatos `ILIKE '%x%'` sem `pg_trgm` | `useContacts.ts:163-165, 203-205` | GIN trigram em name/phone/email + debounce |
| 🟠 | Policies permissivas sobrepostas em `conversations` (5) e `contacts` (4): a de workspace nunca restringe (OR) mas custa 3 SELECTs por linha; `flow_node_logs` com SELECT duplicado; `instagram_*`, `organization_usage`, `user_roles`, `workspace_members` ainda com `auth.uid()` nu | `20260614120000`, `20260615130000`, `20260824120000`, `20260705120000` | Decidir semântica e ficar com UMA; `(select auth.uid())`. **Via Lovable** (senão reverte) |
| 🟠 | Cada INSERT em `messages` → 2 triggers que fazem UPDATE em `conversations` + o UPDATE do próprio webhook = 3 versões mortas por mensagem, e cada uma vira evento realtime | `20260616120000`, `20260423125950`, `20260829120000`; webhook `:2428` | Um único UPDATE (trigger ou webhook, não ambos) com `unread_count = unread_count + 1` |
| 🟠 | Cron `process-campaign-queue` com **anon key hardcoded** no header | `20260319114045:7` | Remover (endpoint já é `verify_jwt=false`) |
| 🟡 | `get_dashboard_metrics` ainda faz subquery em `messages` por conversa apesar de `last_message_direction` existir | `20260813120000` | `c.last_message_direction = 'inbound'` |
| 🟡 | `organization_usage` sem unique visível em `(organization_id, period)` | — | `CREATE UNIQUE INDEX` (pré-requisito do RPC de IA) |
| 🟡 | Sem purga: `flow_executions` terminadas, `instagram_webhook_events`, `notifications`, `media_transcriptions`, `conversation_origin_audit` (1/msg), `scheduled_message_contacts`; tabelas de backup/trabalho (`_merge_orfas_*`, `contacts_backup_*`) ainda existem | — | seção 5 |
| 🟡 | `scheduled_message_contacts` com `REPLICA IDENTITY FULL` na publicação | `20260810120000:11-20` | Progresso via contador em `scheduled_messages` |
| 🟡 | Todos os `http_post` de cron sem `timeout_milliseconds` (default 5 s → log de timeout falso) | várias | `timeout_milliseconds := 55000` |
| ⚪ | `campaign_queue.organization_id` e `flow_node_logs.organization_id` nullable; `flow_executions.status` sem CHECK | `types.ts` | CHECK + NOT NULL após saneamento |

### 2.6 Frontend

| Sev | Achado | Onde | Fix |
|---|---|---|---|
| 🔴 | B12 lista de conversas invalidada por presença e por qualquer UPDATE | `useConversations.ts:264-308, 133-177, 93, 193` | Tirar `contact_presence` dos canais (indicador vem do `PresenceStore` por linha); UPDATE → `setQueryData` patch; só INSERT invalida |
| 🔴 | B11 notificações em `messages` sem org + 1–3 SELECTs por evento + `invalidate(['conversations'])` | `useNewMessageNotifications.ts:174-227, 79` | Filtro `organization_id` (após coluna) ou **broadcast** por org publicado pelo webhook com tudo resolvido |
| 🟠 | `useFollowUpStatus`: `flow_executions '*'` sem debounce, query sem `.range()`, montado 2× na tela de chat (+1 no pipeline) | `useFollowUpStatus.ts:261-304`; `ConversationList:27`; `ConversationDetail:158` | Patch por `conversation_id`; debounce 1 s; paginar; 1 instância na página |
| 🟠 | Abrir conversa chama `zapi-sync-messages` + `zapi-contact-profile` (ambos batem no provedor) | `ConversationDetail.tsx:270-295` | Sync só se `messages.length === 0`; perfil só se `avatar_url` null com `avatar_checked_at` |
| 🟠 | `session` inteiro nas deps → todos os canais recriados a cada `TOKEN_REFRESHED` e a cada `SIGNED_IN` cruzado entre abas | `useAuth.tsx:85-114`; `useConversations.ts:177, 308, 429`; `useContactPresence.ts:189` | Deps em `session?.user?.id` |
| 🟠 | `usePipelineRealtime`: `contact_tags` e `positions` sem filtro → `refetchQueries(['all-contact-tags'])` (varredura paginada) por evento de qualquer org | `usePipelineRealtime.ts:358-380` | Patch do payload; filtro por org (após coluna) ou broadcast |
| 🟠 | Lista sem virtualização; `ContactTagsDisplay` faz `filter` sobre todos os vínculos por linha (O(conversas × vínculos) por render) | `ConversationList.tsx:90, 338-345`; `ConversationDetail.tsx:1378` | `Map<contact_id, tag_id[]>` memoizado; `@tanstack/react-virtual` (já usado em contatos) |
| 🟠 | `useConversations` (1000 linhas, `select('*')` + 3 joins, poll 30 s, canal próprio) montado por **diálogos** de agendamento/permissão | `useConversations.ts:86-130`; `CreateScheduledMessageDialog`, `EditPermissionsDialog`, `PipelineBoard*` | Busca server-side `limit 20`; pipeline via `positions` com `conversations!inner` |
| 🟡 | Polling de Instagram (10 s) ligado em toda org, sem `.range()` | `useInstagramConversations.ts:52-67` | `enabled: instagramAccounts.length > 0` |
| 🟡 | `useWhatsAppStatus` invoca edge (→ provedor) a cada 30 s por usuário em 4 páginas; `checkStatus` muda de identidade e dispara fora do intervalo | `useWhatsAppStatus.ts:322-332` | Status por realtime de `whatsapp_instances`; checagem ativa no cron |
| 🟡 | Queries sem `.range()` cortadas em 1000: `conversation-positions`, `positions-for-permissions` (sem org), `follow-up-status` | `usePipelines.ts:282-297`; `ConversationsPage.tsx:83-93` | `fetchAllPages` de `contactTagLinks.ts:42` |
| 🟡 | Sentinela `'unassigned'` ainda vaza | `useCampaigns.ts:61-62`; `useFunnelConfig.ts:34-35, 63-64, 82` | `normalizeWorkspaceId` de `useTags.ts:32` |
| 🟡 | Marcar como lida faz `refetch()` da lista inteira; `try/catch` nunca captura (erro retornado é ignorado) | `ConversationsPage.tsx:271-279, 612-617` | `setQueryData` zerando `unread_count` |
| 🟡 | Boot: 5 saltos serializados (auth → profile → memberships → workspaces → plano/role/permissões) | `useAuth:117-139`; `WorkspaceContext:299-305`; `ProtectedRoute:99-153` | RPC `get_boot_context()` |
| ⚪ | Erros engolidos: presença inicial, `contact-number-owner`, `?id=`, sync, status fallback assume "connected" | vários | Expor `isError` |
| ⚪ | Otimista do envio patcheia `['conversations']` (array) mas o inbox usa `['conversations-paginated']` (`{pages}`) | `useSendMessage.ts:128-148` | Patch no formato paginado |

**Canais por usuário na tela de chat:** 6 canais / 8 bindings (1 sem org). **Requests/min por usuário ocioso:** ~14–18
(`useMessages` 15 s, lista 30 s × páginas, Instagram 10 s, status 30 s) → **~25–30 req/s com 100 usuários parados**,
antes de qualquer evento.

---

## 3. O que já está bom (não mexer)

- Dedup de mensagens por `(conversation_id, zapi_message_id)` e conversa por unique parcial com 23505 tratado.
- `runBackground` = `EdgeRuntime.waitUntil`; `resumeFlow()` centralizado; execuções fechadas antes de retomar.
- Claim atômico + heartbeat + progresso por contato no agendamento; falha parcial visível; número designado sem fallback.
- Timeouts no envio (`whatsappProvider.ts:318-336`); `AbortController` em todas as chamadas de LLM; `MAX_TOOL_ROUNDS`.
- IA só com chave da org (isolamento entre orgs); nenhum `'humano'` residual; auth antes de qualquer LLM.
- Índices de feed/chat/dashboard, FTS em `messages`, GIN em `shared_workspace_ids`; RLS das tabelas quentes com `(select auth.uid())`.
- `useMessages` (keyset + patch cirúrgico) é o modelo a copiar; `createRealtimeChannel`; rotas lazy; chunks separados; contatos virtualizados.
- 14 crons de purga/retenção já existentes; `usage.ts` em lotes.

---

## 4. Plano por semanas (4 semanas até o lançamento)

**Semana 1 — SQL + segurança do webhook (maior ganho, menor risco).**
Aplicar o bloco da seção 5 no SQL Editor (índices `CONCURRENTLY`, crons B6, curto-circuito B10, RPC de claim B8,
`increment_ai_usage`, purgas). Configurar `x-webhook-token` por instância + unique no nome (B4). Confirmar
migrations pendentes (dispatcher, `contact_number_owners`). Remover anon key do cron. Ligar PITR, revisar compute.

**Semana 2 — Perda de mensagem e duplicação (backend).**
B1 (ack escopado por instância), B2 (mídia em background + timeouts), B3 (`inbound_events` + 503 em infra),
B5 (CAS + unique parcial em `flow_executions`), B7 (catch → failed, timeouts, heartbeat), B9 (lock por conversa),
`merge_conversation_metadata` RPC, `increment_unread` RPC, `await` no `connection.update`.

**Semana 3 — Frontend + custo por mensagem.**
B12 (presença fora da lista + patch), B11 (coluna `messages.organization_id` + filtro, ou broadcast),
`useFollowUpStatus` único com patch, sync/perfil só sob demanda, deps de `session`, virtualização + `Map` de tags,
Instagram/status polling condicionais. Backend: cortar telemetria síncrona do webhook (meta ≤ 8 round-trips),
logs sem payload, cache de `platform_settings`, rate limit por instância (`try_acquire_send_slot`).

**Semana 4 — Teste de carga e observabilidade.**
Script que simula 98 instâncias mandando 2 msg/s cada por 30 min contra staging (o `docs/monitor-disparo-em-massa.sql`
e `diagnostico-*` viram dashboards); medir `pg_stat_statements`, conexões, `cron.job_run_details`, latência p95 do
webhook. Alertas Sentry para taxa de erro de edge function e para cron sem execução em 5 min. Dieta de prompt da IA
(item 2.4) e RLS consolidada (via Lovable) entram aqui se sobrar tempo; senão, pós-lançamento.

**Pós-lançamento:** worker dedicado para fluxos/disparos fora de edge functions; partição de `messages` (6A);
HNSW no RAG; `get_boot_context()`.

---

## 5. SQL pronto para aplicar (aditivo — sobrevive ao sync do Lovable)

> Rodar no SQL Editor, um bloco por vez. `CONCURRENTLY` não pode rodar dentro de transação — o SQL Editor já roda
> cada statement isolado. Substituir `https://zaobtetbjpuzibjymhzw.supabase.co` por `https://zaobtetbjpuzibjymhzw.supabase.co`.

```sql
-- ========== ÍNDICES ==========
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_zapi_message_id
  ON public.messages (zapi_message_id) WHERE zapi_message_id IS NOT NULL;                 -- B1

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_flow_executions_conversation_live
  ON public.flow_executions (conversation_id, started_at DESC)
  WHERE status IN ('running','waiting_input','waiting_delay');                            -- webhook por msg
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_flow_executions_running_started
  ON public.flow_executions (started_at) WHERE status = 'running';                        -- fase 0

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contact_tags_tag_contact
  ON public.contact_tags (tag_id, contact_id);                                            -- funil

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contacts_wa_lid
  ON public.contacts (organization_id, (metadata->>'wa_lid')) WHERE metadata ? 'wa_lid';

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contacts_name_trgm  ON public.contacts USING gin (name gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contacts_phone_trgm ON public.contacts USING gin (phone gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contacts_email_trgm ON public.contacts USING gin (email gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_execution_logs_org_created
  ON public.agent_execution_logs (organization_id, created_at DESC);

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS organization_usage_org_period_uidx
  ON public.organization_usage (organization_id, period);

-- Guarda estrutural contra fluxo duplicado (B5): roteiro completo (diagnóstico, fecho das duplicadas,
-- criação e conferência) em docs/fechar-execucoes-duplicadas.sql.
-- O par é (conversation_id, flow_id), NÃO só conversation_id como estava escrito aqui antes: sub-fluxo com
-- "aguardar resposta" e campanha interruptora deixam dois fluxos DIFERENTES vivos na mesma conversa de
-- propósito, e a versão por conversa quebraria os dois.
-- CREATE UNIQUE INDEX CONCURRENTLY idx_flow_executions_one_live
--   ON public.flow_executions (conversation_id, flow_id) WHERE status IN ('running','waiting_input','waiting_delay');

-- Nome de instância único por provedor (B4). ANTES: SELECT evolution_instance_name, count(*) ... HAVING count(*)>1
-- CREATE UNIQUE INDEX CONCURRENTLY idx_whatsapp_instances_evolution_name
--   ON public.whatsapp_instances (evolution_instance_name) WHERE evolution_instance_name IS NOT NULL;

-- ========== CRONS AUSENTES (B6) ==========
SELECT cron.schedule('process-flow-timeouts', '* * * * *', $cron$
  SELECT net.http_post(url := 'https://zaobtetbjpuzibjymhzw.supabase.co/functions/v1/process-flow-timeouts',
    headers := '{"Content-Type":"application/json"}'::jsonb, body := '{}'::jsonb,
    timeout_milliseconds := 55000);
$cron$);
SELECT cron.schedule('auto-close-conversations', '*/10 * * * *', $cron$
  SELECT net.http_post(url := 'https://zaobtetbjpuzibjymhzw.supabase.co/functions/v1/auto-close-conversations',
    headers := '{"Content-Type":"application/json"}'::jsonb, body := '{}'::jsonb,
    timeout_milliseconds := 55000);
$cron$);
SELECT cron.schedule('reprocess-inbound-events', '*/2 * * * *', $cron$
  SELECT net.http_post(url := 'https://zaobtetbjpuzibjymhzw.supabase.co/functions/v1/reprocess-inbound-events',
    headers := '{"Content-Type":"application/json"}'::jsonb, body := '{}'::jsonb,
    timeout_milliseconds := 55000);
$cron$);
-- Purga da caixa-preta (B3): 3 dias bastam para reprocessar e depurar incidente.
SELECT cron.schedule('purge-inbound-events', '17 4 * * *', $cron$
  SELECT public.purge_inbound_events(3);
$cron$);
-- Conferir: SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;

-- ========== TRIGGER DE TAG: curto-circuito (B10) ==========
CREATE OR REPLACE FUNCTION public.handle_contact_tag_added_campaign()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _org uuid;
BEGIN
  SELECT organization_id INTO _org FROM public.contacts WHERE id = NEW.contact_id;
  IF NOT EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.organization_id = _org AND c.is_active = true
      AND c.match_type = 'tag_added' AND NEW.tag_id = ANY(c.trigger_tag_ids)
  ) THEN RETURN NEW; END IF;
  PERFORM net.http_post(
    url := 'https://zaobtetbjpuzibjymhzw.supabase.co/functions/v1/trigger-campaign-on-tag',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := json_build_object('record', row_to_json(NEW))::jsonb);
  RETURN NEW;
END $$;
-- (conferir nomes das colunas match_type / trigger_tag_ids em types.ts antes de rodar)

-- ========== CLAIM ATÔMICO DA FILA DE CAMPANHA (B8) ==========
ALTER TABLE public.campaign_queue ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
CREATE OR REPLACE FUNCTION public.claim_campaign_queue(_limit int DEFAULT 50)
RETURNS SETOF public.campaign_queue LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.campaign_queue q SET status = 'processing', claimed_at = now()
  WHERE q.id IN (
    SELECT id FROM public.campaign_queue
    WHERE (status = 'pending' AND scheduled_for <= now())
       OR (status = 'processing' AND claimed_at < now() - interval '10 minutes')
    ORDER BY scheduled_for FOR UPDATE SKIP LOCKED LIMIT _limit)
  RETURNING q.*;
$$;
REVOKE ALL ON FUNCTION public.claim_campaign_queue(int) FROM public, anon, authenticated;

-- ========== CONTADORES ATÔMICOS ==========
CREATE OR REPLACE FUNCTION public.increment_ai_usage(_org uuid, _period text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.organization_usage (organization_id, period, ai_requests)
  VALUES (_org, _period, 1)
  ON CONFLICT (organization_id, period)
  DO UPDATE SET ai_requests = COALESCE(organization_usage.ai_requests,0) + 1, updated_at = now();
$$;
CREATE OR REPLACE FUNCTION public.increment_unread(_conversation uuid, _at timestamptz)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.conversations
  SET unread_count = COALESCE(unread_count,0) + 1, last_message_at = _at,
      status = CASE WHEN status = 'closed' THEN 'open' ELSE status END
  WHERE id = _conversation;
$$;
CREATE OR REPLACE FUNCTION public.merge_conversation_metadata(_conversation uuid, _set jsonb, _unset text[] DEFAULT '{}')
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.conversations
  SET metadata = (COALESCE(metadata,'{}'::jsonb) || COALESCE(_set,'{}'::jsonb)) - _unset
  WHERE id = _conversation RETURNING metadata;
$$;

-- ========== messages.organization_id (B11) ==========
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE OR REPLACE FUNCTION public.messages_fill_org() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    SELECT organization_id INTO NEW.organization_id FROM public.conversations WHERE id = NEW.conversation_id;
  END IF; RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_messages_fill_org ON public.messages;
CREATE TRIGGER trg_messages_fill_org BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.messages_fill_org();
-- Backfill em lotes (repetir até 0 linhas):
-- UPDATE public.messages m SET organization_id = c.organization_id FROM public.conversations c
--  WHERE c.id = m.conversation_id AND m.organization_id IS NULL
--    AND m.id IN (SELECT id FROM public.messages WHERE organization_id IS NULL LIMIT 50000);
-- Depois: CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_org_created ON public.messages (organization_id, created_at DESC);
-- E a policy de SELECT de messages vira `organization_id = get_user_org_id((select auth.uid()))` — VIA LOVABLE.

-- ========== RETENÇÃO ==========
SELECT cron.schedule('purge-flow-executions-done','0 3 * * *',
 $$DELETE FROM public.flow_executions WHERE status IN ('completed','failed','cancelled')
   AND COALESCE(completed_at, started_at) < now() - interval '90 days';$$);
SELECT cron.schedule('purge-ig-webhook-events','0 3 * * *',
 $$DELETE FROM public.instagram_webhook_events WHERE created_at < now() - interval '30 days';$$);
SELECT cron.schedule('purge-notifications','0 3 * * *',
 $$DELETE FROM public.notifications WHERE created_at < now() - interval '90 days';$$);
SELECT cron.schedule('purge-media-transcriptions','0 3 * * *',
 $$DELETE FROM public.media_transcriptions WHERE created_at < now() - interval '180 days';$$);
-- Tabelas de trabalho (conferir antes que não são mais usadas):
-- DROP TABLE IF EXISTS public._merge_orfas_20260730, public._merge_orfas_msgs_20260730,
--   public.contacts_backup_20260701, public.contacts_backup_20260809, public.contacts_backup_20260809_v2;

-- ========== DASHBOARD ==========
-- Em get_dashboard_metrics (20260813120000): trocar a subquery em messages por c.last_message_direction = 'inbound'.
```

---

## 6. Checklist de infraestrutura (fora do código)

- [ ] Supabase: plano/compute confirmado para a carga; PITR ligado; `pg_stat_statements` habilitado.
- [ ] Evolution API: instância dedicada, RAM dimensionada, `webhook.headers` com token, `PRESENCE_UPDATE` desligado se a UI não usa.
- [ ] Migrations pendentes aplicadas e confirmadas: `20260817120000`, `20260817230000`, `20260829120000`, `20260819180000`, `20260822120000`, `20260826120000`, `20260827120000`, `20260828120000`.
- [ ] `cron.job` conferido: 16 jobs esperados (14 atuais + 2 de B6) + purgas novas.
- [ ] Sentry: alerta de taxa de erro por edge function; alerta de cron sem execução.
- [ ] Teste de carga em staging antes do lançamento (semana 4).
