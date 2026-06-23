# Prontidão para Produção — Wizzy

> Checklist objetivo para subir com cliente real. Auditado na fonte em 2026-06-22/23
> (não é teórico — cada item aponta `arquivo:linha`). Severidade: 🔴 crítico (resolver antes
> de escalar) · 🟠 importante · 🟡 desejável · ✅ já ok.
>
> Contexto de deploy: frontend/edge sobem via **Lovable sync**; banco = SQL manual no SQL Editor.
> **NUNCA `supabase db push`.** Ver `PLANO_OTIMIZACAO.md` e `PLANO_BOOT_E_PRODUCAO.md`.

## Resumo

| Área | Estado |
|---|---|
| Boot / performance do app | ✅ tratado (Fase 7 — `PLANO_BOOT_E_PRODUCAO.md`) |
| Carga de banco (RLS/índices/RPCs/retenção) | ✅ tratado (Fases 1–6 — `PLANO_OTIMIZACAO.md`) |
| Segredos / chaves no bundle | ✅ sem vazamento real (anon key é pública) |
| Monitoramento de erros | ✅ Sentry ativo · 🟡 ruído de log a limpar |
| Tratamento de erro no frontend | 🟠 só boundary global; telas engolem erro |
| **Rate limiting / abuso em rotas públicas** | 🔴 **maior lacuna** |
| Backups / recuperação | 🟠 confirmar tier do Supabase |
| Pendências de negócio | 🟡 conhecidas e adiadas |

---

## 1. Deploy & processo (Lovable)

- [x] **Fluxo de deploy conhecido:** frontend/edge via Lovable sync; banco via SQL Editor.
- [ ] 🔴 **Gotcha do Lovable revertendo RLS** — o Lovable re-aplica as políticas RLS base (com `auth.uid()` nu) a cada sync, sobrescrevendo RLS alterada manualmente no SQL Editor (descoberto 2026-06-22; detalhe em `health_check_pos_otimizacao.md`). **Regra:** mudança durável de RLS tem de ir **pelo próprio Lovable**. Objetos aditivos (índices/funções/colunas/triggers/cron) sobrevivem.
- [ ] 🟡 **Ordem de deploy quando há coluna nova:** aplicar a migration **antes** de publicar a edge function que usa a coluna (lição da Fase 3A).
- [ ] 🟡 **Migrations versionadas ≠ aplicadas:** o histórico remoto de migrations está vazio (aplicação é manual/Lovable). Manter o hábito de rodar cada migration no SQL Editor e registrar no doc da fase.

## 2. Segredos & chaves no bundle  ✅ (sem vazamento real)

- [x] **Nenhum segredo sensível no frontend.** Só `VITE_SUPABASE_URL`/`ANON_KEY`/`PROJECT_ID` e URLs do runner CNIS — todas públicas por design. (`src/integrations/supabase/client.ts`)
- [x] **Cliente usa anon key** (não service role). ✅
- [x] **Chaves de IA (OpenAI/Gemini) só no backend** — lidas de `integration_configs`/`Deno.env` nas edge functions (`_shared/aiStrategy.ts`); nunca no bundle. ✅
- [x] **Service role só em `Deno.env`** nas edge functions; sem segredo hardcoded. Sentry DSN (`main.tsx:32`) é público por design. ✅
- [ ] 🟡 **Anon key hardcoded em ~7 lugares** em vez de `import.meta.env` (`src/integrations/supabase/client.ts:6`, `src/fluzz/lib/ai-chat.ts`, `PublicDocumentFillPage.tsx`, etc.). Não é vazamento (é pública), mas centralizar reduz risco de copiar errado e facilita rotação.
- [ ] 🟡 **`.env` não pode ir pro git** — confirmar que está no `.gitignore` (ele tem a anon key, que é pública, mas é boa higiene).
- [ ] 🟡 **CSP permissiva** (`index.html`): `script-src` com `'unsafe-inline' 'unsafe-eval'` (exigido pelo bundle atual) e `img-src https://*` (curinga). Aceitável p/ lançar; apertar depois (nonce/hashes; restringir `img-src`).

## 3. Tratamento de erros no frontend  🟠

- [x] **Error boundary global** — `Sentry.ErrorBoundary` no topo (`src/main.tsx:48`), fallback "Ocorreu um erro inesperado. Recarregue a página."
- [ ] 🟠 **Sem boundary por rota/página** — um erro de render em qualquer tela derruba o app inteiro (cai no fallback global). Adicionar boundaries por rota (ou ao redor do `<Suspense>` de rotas em `src/App.tsx`) para isolar falhas a uma tela.
- [ ] 🟠 **Telas principais engolem erro de query** — `ConversationsPage`, `ContactsPage`, `PipelinePage`, `Index` (dashboard) não tratam `error`/`isError` dos `useQuery`; em falha de rede a tela fica vazia/zerada **sem avisar** o usuário (parece "carregando" eterno ou "sem dados"). Adicionar estado de erro + botão "tentar de novo" ao menos nessas 4.
- [ ] 🟡 **Dois sistemas de toast** coexistem (`src/hooks/use-toast.ts` e `sonner`) — uso inconsistente nas mutations. Padronizar em um só e garantir `onError` com toast nas mutations de escrita.

## 4. Ruído de log / observabilidade  🟡

- [x] **Sentry configurado** (erros + replay 100% on-error; `tracesSampleRate 0.3`). `src/main.tsx:31-44`.
- [ ] 🟠 **`console.error` em casos ESPERADOS poluindo logs/Sentry** — o pior é `src/hooks/useSyncMessages.ts:38` (e ~49/67/83): o `400` de sincronização quando o **WhatsApp não está conectado** é esperado, mas loga como erro. Silenciar o caso esperado (checar status/code e não logar quando for o 400 conhecido). Outros: `useFlows.ts`, `useCampaigns.ts`, `NotFound.tsx:8` logam em operação normal — revisar para não inflar o volume.
- [ ] 🟡 **Logs de cron/edge** — conferir periodicamente `cron.job_run_details` (jobs `purge-*`, `process-*`, `recompute-org-usage`) e os logs das edge functions no painel Supabase; sem timeouts/erros recorrentes. (Fase 5A + 7.5.)
- [ ] 🟡 **Alertas** — considerar alerta do Sentry para taxa de erro e, se possível, alerta de falha de cron.

## 5. Rate limiting / abuso em rotas públicas  🔴 (maior lacuna)

> Rotas públicas (sem login) em `src/App.tsx`: `/form`, `/pack-form`, `/q/:token`, `/sign/:token`, `/signature/:id`, `/preencher-contrato/:token`, `/agendar/:slug`, `/verificar`, `/landing`. Edge functions correspondentes em `supabase/functions/` recebem POST externo. **Quase nenhuma tem rate limit.**

- [ ] 🔴 **OTP de assinatura sem throttle** — `signature-verify-otp` valida um código de **6 dígitos** sem limite de tentativas por token/IP → brute-force online viável (1M combinações). **Fix:** limitar tentativas (ex.: 5–10 por token a cada 5 min, bloqueio progressivo) e expirar o OTP rápido. Mesmo cuidado em `signature-send-otp` (limitar reenvios).
- [ ] 🔴 **Formulários/widgets públicos sem rate limit** — `public-form-submit`, `public-pack-form`, `public-document-fill`, `widget-submit` aceitam POST só validando o token/ID (descobrível). Sem limite → spam de submissões, criação em massa de contatos, disparo de fluxos. **Fix:** rate limit por IP (ex.: 10/min) e/ou CAPTCHA nas rotas públicas; validar tamanho/estrutura do payload.
- [ ] 🟠 **Webhooks de pagamento sem validação de assinatura** — `asaas-webhook` (e similares) extraem `organizationId` do payload, que pode ser **forjado**. **Fix:** validar assinatura/HMAC do provedor antes de processar.
- [ ] 🟠 **`zapi-webhook` com rate limit "log-only"** — há contador de 300 req/min/IP mas ele **nunca rejeita** (só `console.warn`, para "não perder mensagem"). Tem validação de token (`x-webhook-token` vs `ZAPI_CLIENT_TOKEN`) ✅. Avaliar rejeição real acima de um teto sano.
- [ ] 🟠 **Assinatura: garantir token single-use** — confirmar que `signature-complete` **bloqueia** segunda conclusão com o mesmo token (evitar assinaturas duplicadas/contraditórias). Verificar na fonte e travar se necessário.
- [ ] 🟡 **Validação de input** — rotas públicas validam presença/tipo básico, sem schema rígido (sem Zod no backend). Adicionar validação de schema onde grava no banco.

> 💡 **Mitigação transversal barata:** colocar as rotas públicas atrás de um WAF/CDN com rate limit por IP (ex.: Cloudflare) resolve boa parte de 5.2/5.4 sem mexer em cada function.

## 6. Backups / retenção / recuperação  🟠

- [ ] 🟠 **Confirmar política de backup do Supabase** no painel (depende do tier): backups diários e **Point-in-Time Recovery** (PITR). Saber a janela de retenção e testar um restore ao menos uma vez.
- [x] **Retenção de logs ativa** (Fase 5A): 7 jobs `purge-*` em `cron.job` (flow_node_logs, whatsapp_connection_logs, agent_execution_logs, entry_flow_events, campaign_queue, contact_presence, signature_otp). Auditoria legal **não** é purgada (`billing_events`, `admin_audit_logs`, `conversation_origin_audit`, `signature_evidence`).
- [ ] 🟡 **Plano de recuperação mínimo** documentado: o que fazer se uma org pedir restauração / se houver perda de dados (passos + quem aciona).

## 7. IA / configuração por org  🟡

- [ ] 🟡 **Cada org precisa de IA configurada** (provedor + chave no painel da org). Decisão da Fase 3F: sem config válida, a IA fica **silenciosa por design** (não usa Lovable nem chave da plataforma). Garantir no onboarding que o cliente configura, senão "a IA não responde" parecerá bug.
- [ ] 🟡 **Confirmar criptografia/proteção** de `integration_configs.openai_api_key` no banco (não deve trafegar/expor em claro para o front; o front só vê versão mascarada — confirmado em `AdminAIUsagePage`).

## 8. Pendências de negócio abertas (de `PLANO_OTIMIZACAO.md`)  🟡

- [ ] **Conversas em IA ficam sem workspace** (`workspace_id = null`) → somem do dashboard quando há workspace selecionado. Fix e backfill já desenhados; adiado por decisão do dono. Workaround: ver com "todos os workspaces".
- [ ] **Chats duplicados por troca de instância** — desconectar/recriar instância gera 2 chats pro mesmo número (escopo por instância). Opções A/B/C desenhadas; decisão do dono pendente.

## 9. Carga / escala (revisitar quando crescer)

- [ ] **RLS InitPlan (Fase 1B)** — `(select auth.uid())` reverte a cada Lovable sync; só dá ganho em escala (zero impacto em segurança). Reaplicar **via Lovable** se o volume crescer.
- [ ] **Partição de `messages` (6A)** e **denormalização das filhas de tasks (6B)** — adiadas (ganho×risco hoje); desenhos prontos em `PLANO_OTIMIZACAO.md` para quando as tabelas crescerem (~5–10M linhas).
- [ ] **`calculateOrganizationUsage` é O(plataforma)** — fora do caminho quente desde a Fase 7.5 (cron diário). Se o nº de orgs/objetos crescer muito, escopar a listagem de storage por org.

---

## Prioridades antes de abrir para clientes reais

1. 🔴 **Rate limit no OTP de assinatura** (seção 5.1) — risco de fraude jurídica.
2. 🔴 **Rate limit / CAPTCHA nas rotas públicas de form/widget** (5.2) — ou WAF/CDN na frente.
3. 🟠 **Validação de assinatura nos webhooks de pagamento** (5.3).
4. 🟠 **Estados de erro nas 4 telas principais** + **boundary por rota** (seção 3).
5. 🟠 **Silenciar o `console.error` esperado do sync de WhatsApp** (seção 4) e confirmar **backup/PITR** do Supabase (seção 6).
