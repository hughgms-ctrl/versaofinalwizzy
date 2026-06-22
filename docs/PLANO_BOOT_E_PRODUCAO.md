# Plano — Boot do Frontend + Prontidão para Produção

> Continuação do `docs/PLANO_OTIMIZACAO.md` (que está **encerrado**: Fases 1–6 implementadas;
> health check em `docs/health_check_pos_otimizacao.md`). Aquele plano otimizou **carga de banco**.
> ESTE plano ataca o que o dono **sente**: o **boot do frontend** (20–30s de tela branca ao logar)
> e depois um **documento de prontidão para produção**.
>
> Diagnóstico de origem feito em 2026-06-22 (na fonte). **Não reinvestigar do zero — já está mapeado abaixo.**

---

## ⚠️ REGRAS OBRIGATÓRIAS (valem para todo este plano)
1. **Deploy:** frontend/edge sobem via **Lovable sync**. Mudanças de banco = SQL manual no SQL Editor (registro em `supabase/migrations/`). `psql` não instalado; `.env` só tem anon key. **NUNCA `supabase db push`.**
2. **⚠️ O Lovable reverte RLS:** descoberto em 2026-06-22 — o Lovable re-aplica as políticas RLS base (com `auth.uid()` nu) a cada sync, sobrescrevendo mudanças manuais de RLS do SQL Editor. Objetos aditivos (índices/funções/colunas/triggers) sobrevivem; **RLS não.** Qualquer mudança durável de RLS tem de ir **pelo próprio Lovable**.
3. **Branch:** `main`. Commit ao fim de cada sub-etapa (mensagem termina com `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`).
4. **Estilo de trabalho (o dono prefere):** UMA sub-etapa por vez; **pedir OK antes de cada uma**; `npx tsc --noEmit` limpo antes de commitar; marcar `[x]` aqui com nota; validação in-app fica com o dono (ele faz Lovable sync e testa).
5. Não mexer nas pendências de negócio adiadas (ver `PLANO_OTIMIZACAO.md`): conversas em IA sem workspace; chats duplicados por troca de instância.

---

# PARTE A — Boot do Frontend (Fase 7)

**Sintoma:** após logar, 20–30s de tela branca com "Carregando…"; sempre cai no `/pipeline`; ao clicar em outras abas, tela preta + "carregando" e depois tudo aparece.

**Causa-raiz (verificada na fonte):**
- **`src/components/ProtectedRoute.tsx` (cond. de loading ~linhas 131–136)** bloqueia o app inteiro num spinner de tela cheia até resolver **em série**: `auth.loading` → `profile` → `WorkspaceContext.loading` → `onboardingPlan` → `modulePlanLoading`/`roleLoading`/`permissionsLoading`.
- **Edge function no caminho crítico:** `ProtectedRoute.tsx:~100` — o `onboardingPlan` faz fallback `supabase.functions.invoke('organization-usage')` quando não há linha de plano → **cold start serverless** trava o boot. **Suspeito nº 1 dos 20–30s.**
- **`src/hooks/useAuth.tsx:~104`** — `setTimeout(() => fetchProfile(...), 100)` adia o profile no caminho crítico (sem motivo claro).
- **`src/contexts/WorkspaceContext.tsx:~209`** — `loading` espera 4 queries (`useOrganizationMemberships` → `useWorkspaces` em waterfall + `useVisibleWorkspaces` + `useUserWorkspaceAccess`).
- **Bundle:** `vite.config.ts` **sem** `build.rollupOptions.output.manualChunks`. Build atual: chunk de entrada `index` = **822 kB (256 kB gzip)**; lazy chunks grandes (`DateFilter` 536 kB, `DebriefingResults` 611 kB, recharts `generateCategoricalChart` 373 kB). Cada deploy invalida o bundle todo (sem vendor cacheável). Causa a "tela preta ao trocar de aba".
- **`src/pages/Index.tsx:243`** → `Navigate to="/pipeline"` = origem do "sempre redirecionado pro pipeline" (default app route; provavelmente OK manter).

**ANTES de codar:** pedir ao dono pra abrir **DevTools → Network**, logar, e dizer **qual request trava** (confirma se é `organization-usage` ou outra) — dado real > inferência.

### Itens (fazer na ordem; pedir OK item a item)
- [ ] **7.1 — Tirar `organization-usage` do caminho crítico** *(alto impacto, baixo risco)*. Investigar `ProtectedRoute.tsx` + `src/hooks/useOrganizationPlan.ts`. Tornar a checagem de plano **não-bloqueante** (renderizar o app e resolver o plano em segundo plano) ou remover o fallback de edge function do gate / cachear. Cuidado: o gate de plano/billing é real — não liberar acesso indevido; só **não prender o boot** nele.
- [ ] **7.2 — Remover o `setTimeout(100)`** antes do `fetchProfile` em `useAuth.tsx` *(trivial, ~zero risco)*. Chamar direto.
- [ ] **7.3 — `manualChunks` no `vite.config.ts`** *(médio-alto, risco só de build)*. Separar vendor cacheável (react, react-dom, react-router-dom, @tanstack/react-query, @supabase/supabase-js, recharts, reactflow, radix-ui, date-fns…). Rodar `npm run build` e comparar tamanho do chunk de entrada. Validar que o app sobe.
- [ ] **7.4 — (ADIADO até medir) Não prender o app inteiro no spinner por plano/permissão** *(alto impacto, médio risco — access-control)*. Renderizar o shell/layout e resolver acesso sem tela branca de 20s. Tratar com o mesmo cuidado da 6B (não afrouxar gate). Só depois de medir o ganho de 7.1–7.3.

**Validação (in-app, por item):** logar com DevTools → Network aberto; tempo até a primeira tela cair sensivelmente; trocar de abas sem tela preta longa; `tsc` limpo. Sem regressão no gate de plano/permissão (usuário sem plano ainda é barrado corretamente).

---

# PARTE B — Documento de Prontidão para Produção

Criar `docs/PRONTIDAO_PRODUCAO.md` — checklist objetivo pra subir com cliente real. Itens a cobrir (auditar cada um na fonte, não assumir):
- **Processo de deploy / Lovable:** o gotcha do Lovable reverter RLS (item 2 das regras) — como aplicar RLS de forma durável; como versionar mudanças de banco com segurança.
- **Tratamento de erros no frontend:** error boundaries; estados de erro nas telas; o `400` esperado de `zapi-sync-messages` (WhatsApp não conectado) ainda loga `console.error` — silenciar o caso esperado.
- **Monitoramento/alertas:** logs das Edge Functions de cron (timeouts/erros); observabilidade mínima.
- **Backups / retenção / recuperação** do Postgres (Supabase).
- **Rate limiting / abuso** nas rotas públicas (`/form`, `/q/:token`, `/sign/:token`, webhooks).
- **Segredos/chaves:** garantir que nada sensível vaza no bundle; cada org com IA configurada (decisão da Fase 3F — sem IA configurada, IA fica silenciosa por design).
- **Pendências de negócio abertas** (de `PLANO_OTIMIZACAO.md`): conversas em IA sem workspace; chats duplicados por troca de instância.
- **Carga/escala:** se for crescer, reavaliar Fase 1B (RLS InitPlan, via Lovable), 6A (partição de `messages`), 6B (denormalização das filhas de tasks) — desenhos já levantados no plano de otimização.

---

## Estado
- [ ] PARTE A — Boot (7.1 → 7.2 → 7.3 → [7.4 adiado])
- [ ] PARTE B — Documento de prontidão para produção
