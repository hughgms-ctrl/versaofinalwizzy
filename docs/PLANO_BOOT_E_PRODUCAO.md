# Plano — Boot do Frontend + Prontidão para Produção

> Continuação do `docs/PLANO_OTIMIZACAO.md` (que está **encerrado**: Fases 1–6 implementadas;
> health check em `docs/health_check_pos_otimizacao.md`). Aquele plano otimizou **carga de banco**.
> ESTE plano ataca o que o dono **sente**: o **boot do frontend** (20–30s de tela branca ao logar)
> e depois um **documento de prontidão para produção**.
>
> Diagnóstico de origem feito em 2026-06-22 e **verificado na fonte** (linhas/arquivos conferidos).
> **Não reinvestigar do zero — já está mapeado e confirmado abaixo.**

---

## ⚠️ REGRAS OBRIGATÓRIAS (valem para todo este plano)
1. **Deploy:** frontend/edge sobem via **Lovable sync**. Mudanças de banco = SQL manual no SQL Editor (registro em `supabase/migrations/`). `psql` não instalado; `.env` só tem anon key. **NUNCA `supabase db push`.**
2. **⚠️ O Lovable reverte RLS:** descoberto em 2026-06-22 — o Lovable re-aplica as políticas RLS base (com `auth.uid()` nu) a cada sync, sobrescrevendo mudanças manuais de RLS do SQL Editor. Objetos aditivos (índices/funções/colunas/triggers) sobrevivem; **RLS não.** Qualquer mudança durável de RLS tem de ir **pelo próprio Lovable**.
3. **Branch:** `main`. Commit ao fim de cada sub-etapa (mensagem termina com `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`).
4. **Estilo de trabalho (o dono prefere):** UMA sub-etapa por vez; **pedir OK antes de cada uma**; `npx tsc --noEmit` limpo antes de commitar; marcar `[x]` aqui com nota; validação in-app fica com o dono (ele faz Lovable sync e testa).
5. Não mexer nas pendências de negócio adiadas (ver `PLANO_OTIMIZACAO.md`): conversas em IA sem workspace; chats duplicados por troca de instância.

---

## Prompt para retomar após `/clear`

```
Estou executando docs/PLANO_BOOT_E_PRODUCAO.md (boot do frontend + prontidão p/ produção).
Vamos para o item <N.N>. Leia o item no documento, confirme a causa-raiz na fonte se necessário,
implemente, deixe `npx tsc --noEmit` limpo, e marque [x] com nota. NÃO avance de item sem eu confirmar.
Deploy é via Lovable sync (NUNCA supabase db push). Validação in-app é minha.
```

---

# PARTE A — Boot do Frontend (Fase 7)

**Sintoma:** após logar, 20–30s de tela branca com spinner ("Carregando…"); sempre cai no `/pipeline`; ao clicar em outras abas, tela preta + "carregando" e depois tudo aparece.

## Causa-raiz (VERIFICADA na fonte — 2026-06-22)

O **gate único** que segura o app inteiro é `src/components/ProtectedRoute.tsx:131-136`. Enquanto qualquer condição abaixo for verdadeira, renderiza **só um spinner de tela cheia** (linhas 137-142):

```ts
if (
  loading                                   // (1) useAuth
  || (!!user && !profile)                   // (2) profile
  || (!!user && workspaceLoading)           // (3) WorkspaceContext
  || (!!user && !!activeOrganizationId && (
       planLoading                          // (4) onboardingPlan  (edge fn em FALLBACK)
       || (!!routePlanModule && modulePlanLoading)   // (5) useOrganizationPlan (edge fn SEMPRE)
       || (!!routePermissionModule && (roleLoading || permissionsLoading))  // (6) role + permissões
     ))
) { return <Spinner/> }
```

É uma **cascata serial**: `auth → profile → workspace → plano → módulo/permissão`. Cada elo só começa depois que o anterior libera o `activeOrganizationId`. Detalhe de cada elo:

1. **`auth.loading`** — `src/hooks/useAuth.tsx`. `onAuthStateChange` + `getSession` resolvem a sessão. OK.
2. **`profile`** — `useAuth.tsx:104`: no `onAuthStateChange`, o profile é buscado com **`setTimeout(() => fetchProfile(session.user.id), 100)`** (atraso artificial de 100ms no caminho crítico, sem motivo claro; no `getSession` da linha 131 já é chamado direto).
3. **`workspaceLoading`** — `src/contexts/WorkspaceContext.tsx:209` = `loadingOrganizations || loadingWorkspaces || loadingVisibleWorkspaces || loadingMembership || organizationSelectionPending`. **Waterfall:** `useWorkspaces(activeOrganizationId)` (linha 43) depende do `activeOrganizationId` que sai de `useOrganizationMemberships` (linha 39) → 2 idas ao banco em série + 2 em paralelo.
4. **`planLoading` (`onboardingPlan`, linhas 86-108)** — faz `SELECT` em `organization_plans` (**table-first**, rápido) e **só** invoca `supabase.functions.invoke('organization-usage')` como **fallback** (linha 100) quando não há linha de plano. Custo de boot normalmente baixo.
5. **`modulePlanLoading` (`useOrganizationPlan`, linha 81 → `src/hooks/useOrganizationPlan.ts:47`)** — 🔴 **SEMPRE** invoca `supabase.functions.invoke('organization-usage')` (é a única fonte; **não tem table-first**). Como quase toda rota protegida casa um `routePlanModule` (`getPlanModuleForPath`), **todo boot fica preso nessa edge function.** → **suspeito nº 1 — CONFIRMADO em produção.**
6. **`roleLoading` / `permissionsLoading`** — `useCurrentUserRole` + `useUserPermissions`, só quando há `routePermissionModule`. Mais 2 queries no gate.

> 🔎 **Redundância confirmada:** (4) e (5) buscam o mesmo objeto (plano da org) por caminhos diferentes — (4) lê a tabela, (5) chama a edge function. Unificar é possível mas (5) precisa de `plan.allowed_modules` que o `SELECT` enxuto de (4) não traz → ver 7.1.

### 🔴 Medição em produção (2026-06-22, DevTools → Network)

`organization-usage`: **TTFB = 14,59s** (servidor pensando; download 40ms). Não é cold start (seria 1–3s) — a **função é pesada**.

**Por que é lenta (verificado em `supabase/functions/_shared/usage.ts`):** `calculateOrganizationUsage`, mesmo chamado para **uma** org, faz uma **varredura da plataforma inteira**:
- Lê **tabelas inteiras de todas as orgs**, paginando 1000/vez: `profiles`, `workspaces`, `whatsapp_instances`, `conversations` (l.164-169) + `contacts`, **`messages` (toda mensagem da plataforma)**, `contact_files`, `scheduled_messages`, `document_templates`, `generated_documents`, `document_signatures`, `signature_evidence`, `flows`, `tasks`, `task_attachments` (l.212-236).
- **Lista TODOS os objetos de TODOS os buckets** recursivamente (`fetchStorageObjects`/`listBucketObjects`, l.86-136) — API página a página; em geral o pedaço mais lento.
- Ainda **escreve** `storage_used_bytes` de **toda org** (l.327-333).

→ É **O(plataforma inteira)**, não O(sua org). Roda **a cada page load** via `useOrganizationPlan` e **piora conforme QUALQUER org cresce**. Tende a timeout com o crescimento de `messages`/storage.

> 💡 **Insight que define o 7.1:** o **gate de módulo do boot não precisa de uso nenhum.** `canAccessModule()` só usa `allowed_modules` + status do plano — um `SELECT` barato em `organization_plans → platform_plans`. Storage/contagens (a parte cara) só importam na **tela de plano/billing**. Logo o boot não deve chamar `organization-usage` de jeito nenhum.

### ⚠️ Favicon de 16,66s (`https://wizzybr.com/favicon.png?v=wizzy`)
**Não é o bloqueador da tela branca** — favicon carrega em paralelo e nunca segura render/JS. É infra de estático lento (host/CDN) e/ou disputa de conexão enquanto o boot está travado. **Prioridade baixa**, item separado: servir o ícone como asset estático do bundle (cacheável) e checar o host. Não confundir com o boot.

- **Bundle** — `vite.config.ts` **não tem** `build.rollupOptions.output.manualChunks` (confirmado: o config só tem `server`/`plugins`/`resolve`). Sem split de vendor, o chunk de entrada é gigante e **cada deploy invalida o bundle todo** (nada cacheável entre releases). Números do diagnóstico: `index` ≈ **822 kB (256 kB gzip)**; lazy chunks grandes (`DateFilter` 536 kB, `DebriefingResults` 611 kB, recharts `generateCategoricalChart` 373 kB). Causa a "tela preta ao trocar de aba".
- **`src/pages/Index.tsx:243`** (`IndexInner`) → `Navigate to="/pipeline"` quando `!canAccess` do módulo `dashboard`. Origem do "sempre cai no pipeline" — só dispara para quem **não tem acesso ao dashboard** (plano/permissão). É o default route esperado; **provavelmente manter** (revisitar só se o dono quiser outro destino).

> **ANTES de codar (medir > inferir):** pedir ao dono para abrir **DevTools → Network**, logar, e dizer **qual request fica pendente os ~20s**. A causa-raiz aponta `organization-usage` (elo 5) como o mais provável. Confirmar na prática antes de mexer — barato e elimina chute.

### Itens (fazer na ordem; pedir OK item a item)

- [x] **7.1 — Tirar `organization-usage` do caminho crítico do boot** · *alto impacto, baixo risco* — **FEITO (2026-06-22), `tsc` limpo. Sobe via Lovable sync (só frontend, sem DDL).**
  > **Escolha: abordagem cirúrgica (não a estrutural).** Ao verificar a RLS, descobri que `platform_plans` só tem 2 políticas: admin full + `Authenticated users can read active platform plans (USING is_active = true)`. A edge function usa **service role** (vê planos inativos também); se eu trocasse pelo JOIN no client (abordagem estrutural), uma org num plano **`is_active=false`** ficaria com `allowed_modules` vazio → **perderia acesso aos módulos** (regressão de access-control). Para fechar isso precisaria de uma RPC `SECURITY DEFINER` (mais superfície/deploy). Optei por manter a função como fonte do `canAccessModule` (semântica de acesso **idêntica à de hoje**) e apenas **tirá-la do gate de boot**.
  > **Mudanças:** (1) `ProtectedRoute.tsx:131-136` — removido `(!!routePlanModule && modulePlanLoading)` da condição do spinner → app renderiza sem esperar os ~15s. (2) `ProtectedRoute.tsx:185` — redirect de módulo guardado com `!modulePlanLoading` (obrigatório: durante o load `canAccessPlanModule()` é false e jogaria todo mundo pra `/plans`; agora só barra quando o dado chega). (3) `useOrganizationPlan.ts` — `staleTime: 5min` na query de `organization-usage` → deixa de refazer a varredura O(plataforma) a cada navegação (toda nav → 1×/5min em background). Billing/trial **não** mudaram (usam `onboardingPlan`, table-first, fora do gate de módulo).
  > **Limitação assumida:** a função pesada ainda roda em background (1×/5min). A correção definitiva do custo dela é o **7.5** (escopar por org). Usuário em módulo bloqueado pode ver o conteúdo por ~15s antes do redirect — sem vazamento de dados (RLS protege as queries internas), só flash de UI.
  > ⏳ **Validação in-app (dono):** logar com DevTools → Network — boot não deve mais esperar `organization-usage`; tela cai rápido. Testar conta sem plano (ainda barra em billing) e conta com módulo bloqueado (redireciona pra /plans depois que carrega, sem prender o boot).

  <details><summary>Plano original do 7.1 (abordagem estrutural — preterida pela RLS de is_active)</summary>

  - **Recomendada (estrutural, conserta boot E o martelar do banco):** fazer `useOrganizationPlan` obter `allowed_modules` + status do plano de um **`SELECT` em `organization_plans → platform_plans`** (table-first, como o `onboardingPlan` já faz na l.91-96), **sem** invocar `organization-usage`. A edge function pesada fica **só** para a tela de plano/billing (onde os números de storage/uso aparecem) — idealmente atrás de um hook separado (ex.: `useOrganizationUsage`) ou lazy/under-demand.
    - **Verificar antes:** o client consegue ler `platform_plans` (`allowed_modules`, `features`, limites) sob RLS? `organization_plans` já é lido pelo client hoje (l.91), então falta confirmar o JOIN em `platform_plans`. Se a RLS não permitir, criar uma RPC `SECURITY DEFINER` enxuta `get_org_plan_modules(org)` que devolve só plano+`allowed_modules`+status (aplicar **via Lovable**, não SQL manual — regra 2; sem RLS nova, é função aditiva, sobrevive).
    - **Não quebrar a API do hook:** `useOrganizationPlan` é usado em vários lugares e devolve um objeto de `usage` grande. Manter o shape; só trocar a **fonte** do plano/módulos (e os campos de `usage` que vierem da função pesada podem virar 0/undefined fora da tela de billing, ou um segundo hook). Conferir os consumidores antes (`grep useOrganizationPlan`).
  - **Alternativa cirúrgica (se quiser o mínimo agora):** remover `(!!routePlanModule && modulePlanLoading)` da condição da l.135 **e** guardar o redirect de módulo (l.185-187) com `!modulePlanLoading`. App renderiza sem esperar a função; módulo bloqueado redireciona quando o dado chega. ⚠️ **Guard obrigatório:** durante o load `canAccessPlanModule()` retorna `false` (porque `hasActiveAccess` é `false` enquanto carrega) → sem o `!modulePlanLoading` manda todo mundo pra `/plans` no flash. **Limitação:** isso tira a tela branca mas **mantém** a varredura O(plataforma) rodando a cada load (em segundo plano). Por isso a recomendada é a estrutural.
  - **Fallback (elo 4):** o `invoke('organization-usage')` da l.100 só roda quando não há linha de plano — impacto menor; manter.
  - **Não liberar acesso indevido:** o gate de plano/billing é real. Objetivo é **não prender o boot** nele e **não varrer a plataforma** a cada load — não remover o gate.
  </details>

- [x] **7.2 — `setTimeout(100)` → `setTimeout(0)` antes do `fetchProfile`** em `useAuth.tsx` · *trivial* — **FEITO (2026-06-22), `tsc` limpo. Sobe via Lovable.**
  > ⚠️ **Correção de premissa:** o plano original mandava remover o `setTimeout` e chamar `fetchProfile` direto. **NÃO** fiz isso — o defer **tem motivo**: chamar métodos do supabase **dentro** do callback de `onAuthStateChange` pode **deadlock** (o callback roda segurando o lock de auth; é padrão conhecido do supabase-js). O `getSession().then()` (l.131) chama direto porque está **fora** do callback. O que atrasava o boot era o `100`, não o defer. **Mudança:** `setTimeout(() => fetchProfile(session.user.id), 100)` → `setTimeout(..., 0)` — libera no próximo tick sem o atraso. Risco ~zero, mantém a proteção anti-deadlock.

- [x] **7.3 — `manualChunks` no `vite.config.ts`** · *médio-alto impacto, risco só de build* — **FEITO (2026-06-22), `tsc` limpo + `npm run build` OK. Sobe via Lovable.**
  > **Resultado:** chunk de entrada `index` **822 kB → 127 kB** (256 → **39 kB gzip**, −85%). Boot eager total ~281 kB gzip, dos quais **242 kB são vendor estável/cacheável** entre deploys (deploy de código só re-baixa os 39 kB do entry; antes re-baixava os 256 kB inteiros). `pdfjs` (1 MB) saiu do boot (virou lazy).
  > ⚠️ **Lição (footgun evitado):** a 1ª tentativa agrupava libs por ecossistema, **incluindo as pesadas por rota** (`vendor-pdf` juntando jszip+jspdf+html2canvas+pdfjs). Como o jszip (pequeno) é alcançável no caminho eager, o chunk **inteiro** (com o pdfjs de 1 MB) era arrastado pro boot (visto no `modulepreload` do `index.html`). **Correção:** nomear **apenas** os vendors que já são eager em toda página e mudam raramente — `vendor-react` (react/-dom/-router/-is/scheduler), `vendor-query` (@tanstack), `vendor-supabase`, `vendor-radix`, `vendor-sentry` (Sentry.init roda eager no `main.tsx`). Todo o resto (recharts, @tiptap, @fullcalendar, @xyflow, pdfjs/jspdf, dnd-kit, lucide…) fica no **split automático do Rollup** de propósito → lib de rota lazy continua lazy.
  > 🔎 **Verificar no boot:** conferir o `modulepreload` em `dist/index.html` — só devem aparecer os `vendor-*` nomeados + o entry; **nenhum** chunk de rota (pdf/calendar/editor/flow) ali.
  > 💡 **Futuro (não feito):** Sentry é o maior peso eager (83 kB gzip) por causa do `replayIntegration`; lazy-init de Sentry tiraria do boot, mas é mudança de código com risco de perder erros iniciais — fora do escopo de 7.3.
  > ⏳ **Validação in-app (dono):** após Lovable sync, abrir o app e navegar entre abas — sem tela preta/quebra; trocar de aba pesada (documentos, flow, calendário, relatórios) deve carregar o chunk daquela rota sob demanda, sem erro de runtime tipo "cannot access before initialization".

- [ ] **7.4 — (ADIADO até medir 7.1–7.3) Não prender o app no spinner por permissão/role** · *alto impacto, médio risco — access-control*. Mesmo tratamento da 7.1 para os elos 6 (`roleLoading`/`permissionsLoading`) e, se necessário, 3 (`workspaceLoading`): renderizar o shell/layout e resolver acesso sem tela branca, com os mesmos guards de redirect (`!loading` antes de barrar) para **não afrouxar** o gate. Só fazer depois de medir quanto 7.1–7.3 já resolveram — pode nem ser necessário.

- [x] **7.5 — Tirar a varredura O(plataforma) do caminho quente de `organization-usage`** · *médio esforço* — **FEITO (2026-06-22). Sobe via Lovable + 1 migration no SQL Editor + 1 ajuste de painel.**
  > **Abordagem (melhor que "escopar por org"):** o gargalo de 15s era a **listagem de todo o storage da plataforma** (`fetchStorageObjects`) — e `calculateOrganizationUsage` lista o storage inteiro independente do `organizationIds` (o filtro só afeta as linhas de org no DB). Escopar a listagem por org seria caro (chat-media é por conversa) e arriscado (subcontar). Em vez disso:
  > - **`organization-usage/index.ts`**: não chama mais `calculateOrganizationUsage`. As **contagens** (team/workspace/whatsapp/conversas) viraram queries `count`/selects **escopados por org** (ao vivo, sempre frescos). O **storage** passa a **ler o valor persistido** em `organizations.storage_used_bytes`. Resposta agora é instantânea.
  > - **Seguro:** esses números são só **display**. O enforcement real de workspace/team/whatsapp é por **triggers no banco em tempo real** (`20260609211500_enforce_plan_resource_limits`), independentes desta função; **não há enforcement de storage**. Frontend não usa `storageByBucket`/`storageAudit`/`conversationCount` (verificado: 0 refs em `src`).
  > - **`admin-dashboard` intacto** — segue chamando `calculateOrganizationUsage` (todas as orgs, real-time). É o que persiste `storage_used_bytes`.
  > **Freshness do storage (decisão do dono: cron diário):**
  > - **Nova edge function `recompute-org-usage`**: roda `calculateOrganizationUsage(persistStorageUsed)` p/ todas as orgs; **self-throttle** (tabela `platform_job_runs`, máx. 1×/12h) → endpoint público à prova de abuso sem segredo.
  > - **Migration `20260622140000_fase7_5_recompute_usage_cron.sql`**: cria `platform_job_runs` (RLS on, sem policies → só service role) + `cron.schedule('recompute-org-usage','0 4 * * *', net.http_post …)`.
  > 🐛 **Bug pré-existente exposto na validação (2026-06-22):** o recompute deu `500 {"error":"Too many connections issued to the database"}`. Causa: em `_shared/usage.ts` o **persist** fazia `Promise.all` com **1 conexão por org simultaneamente** → estoura o limite de conexões da edge function quando há muitas orgs. **Não era regressão** — o `admin-dashboard` chama a mesma função e **engolia o erro** (`catch` na l.263), provavelmente já deixando o storage sem atualizar há tempos. **Fix:** persist em **lotes de 5** (`usage.ts`). Beneficia recompute **e** admin-dashboard.
  > ⚠️ **Passos de deploy (3):** (1) Lovable sync (sobe `organization-usage` + `recompute-org-usage` + o fix de `usage.ts`); (2) marcar `recompute-org-usage` como **`verify_jwt=false`** no painel Supabase (igual aos outros crons — senão o cron toma 401); (3) rodar a migration no **SQL Editor**.
  > ⏳ **Validação (dono):** após deploy, tela de plano/uso abre instantânea; números de team/workspace/whatsapp corretos ao vivo; storage bate com o valor atual (foi recém-persistido). Disparar `recompute-org-usage` manualmente 1×, conferir 200/`ok`, e que 2ª chamada em <12h retorna `skipped:throttled`. `SELECT * FROM cron.job WHERE jobname='recompute-org-usage'` ativo.

**Validação (in-app, por item):** logar com DevTools → Network aberto; medir tempo até a primeira tela renderizar (deve cair sensivelmente após 7.1); trocar de abas sem tela preta longa (após 7.3); `npx tsc --noEmit` limpo. **Sem regressão de gate:** usuário sem plano ainda é barrado/redirecionado corretamente (testar uma conta sem plano ativo e uma com módulo bloqueado).

---

# PARTE B — Documento de Prontidão para Produção

Criar `docs/PRONTIDAO_PRODUCAO.md` — checklist objetivo pra subir com cliente real. **Auditar cada item na fonte antes de escrever** (não assumir). Itens a cobrir:

- **Processo de deploy / Lovable:** o gotcha do Lovable reverter RLS (regra 2) — como aplicar RLS de forma durável (pelo próprio Lovable); como versionar mudanças de banco com segurança; ordem de deploy (migration antes da edge function quando há coluna nova — ver Fase 3A).
- **Tratamento de erros no frontend:** error boundaries; estados de erro nas telas; ruído de `console.error` em casos *esperados* (ex.: `400` de `zapi-sync-messages` quando o WhatsApp não está conectado) → silenciar o caso esperado para não poluir logs/observabilidade.
- **Monitoramento/alertas:** logs das Edge Functions de cron (timeouts/erros); observabilidade mínima; onde olhar quando algo quebra.
- **Backups / retenção / recuperação** do Postgres (Supabase) — confirmar política de backup do projeto + os jobs de retenção da Fase 5A (`cron.job`).
- **Rate limiting / abuso** nas rotas públicas (`/form`, `/q/:token`, `/sign/:token`, webhooks).
- **Segredos/chaves:** garantir que nada sensível vaza no bundle (revisar variáveis `VITE_*`); cada org precisa de IA configurada no painel (decisão da Fase 3F — sem provedor+chave, a IA fica silenciosa por design).
- **Pendências de negócio abertas** (de `PLANO_OTIMIZACAO.md`): conversas em IA sem workspace; chats duplicados por troca de instância — documentar estado e workaround.
- **Carga/escala:** se for crescer, reavaliar Fase 1B (RLS InitPlan, **via Lovable** — senão reverte), 6A (partição de `messages`), 6B (denormalização das filhas de tasks) — desenhos já levantados no plano de otimização.

---

## Estado
- [ ] **PARTE A — Boot** (7.1 → 7.2 → 7.3 → [7.4 adiado até medir] · [7.5 opcional pós-7.1])
  - [x] 7.1 — `organization-usage` fora do gate de boot (cirúrgica) + staleTime 5min
  - [x] 7.2 — `setTimeout(100)` → `setTimeout(0)` no profile (mantém defer anti-deadlock)
  - [x] 7.3 — `manualChunks` no vite (entry 822→127kB; vendor cacheável)
  - [x] 7.5 — `organization-usage` sem varredura O(plataforma) + cron diário de recálculo
  - [ ] 7.4 — (adiado) não prender no spinner por permissão/role
  - [ ] 7.5 — (opcional) escopar `calculateOrganizationUsage` por org
  - [ ] favicon de 16s (prioridade baixa; asset estático cacheável)
- [ ] **PARTE B — Documento de prontidão para produção** (`docs/PRONTIDAO_PRODUCAO.md`)
