# Plano de Segurança — Handoff (auditoria 2026-07-05)

Gateway de pagamento em uso: **somente Asaas** (Stripe não é usado).

---

## ✅ JÁ FEITO (código commitado, aguardando deploy)

- `stripe-webhook` — verificação de assinatura HMAC (fail-closed). Como Stripe não é usado, fica inofensiva.
- `asaas-webhook` — validação constant-time do `asaas-access-token` (fail-closed).
- `zapi-webhook` — `sanitizeInstanceIdentifier` neutraliza injeção `.or()` (disconnect global).
- Cluster IDOR escopado por org (`getUserOrganizationIds`): `zapi-crm`, `zapi-call`, `zapi-load-older-messages`, `zapi-message-actions`, `zapi-contact-profile`, `analyze-conversation`.
- `transcribe-media` — guard anti-SSRF + valida JWT + org da mensagem.
- `_shared/aiStrategy.ts` — `organizationId` do body só confiável de service role.
- `signature-send-otp` — CSPRNG no lugar de `Math.random()`.
- `supabase/migrations/20260705120000_security_rls_fixes.sql` — OTP público + `flow_node_logs` (aplicar pelo Lovable).

---

## 👤 O QUE VOCÊ DEVE FAZER (manual — não é código)

- [ ] **Asaas:** no painel do Asaas, definir um **token de autenticação** no webhook.
- [ ] **Supabase:** criar o secret **`ASAAS_WEBHOOK_TOKEN`** com o MESMO valor do passo acima.
- [ ] **Aplicar a migration RLS `20260705120000` PELO LOVABLE** (não pelo SQL Editor — reverte no sync).
- [ ] **Testar fluxos de WhatsApp** após deploy (enviar msg, carregar histórico, CRM, transcrição) — mexi em 6 funções `zapi-*`.
- [ ] **Deploy** das Edge Functions alteradas.
- [ ] **Confirmar com o colega as 2 regras** para liberar a Fase Quiz/Assinatura:
  - `quiz-actions`: o `send_whatsapp` do quiz público usa mensagem livre ou sempre pré-configurada pela empresa?
  - `capture-signature`: ainda é usada em produção, ou o fluxo oficial é só o `signature-complete`? (ela finaliza assinatura sem exigir OTP/selfie)
- [x] (Opcional) **`stripe-webhook` REMOVIDA** (2026-07-06) — diretório deletado. `deploy`: como a função sumiu, no próximo deploy o endpoint deixa de existir (404). Ver nota de "dangling" no checklist.

---

## ⏳ PENDENTE (para o Claude continuar)

Ordem sugerida:
1. ✅ **Frontend XSS + CSP** — FEITO (2026-07-05). Ver abaixo.
2. ✅ **Dependências (`npm audit fix`)** — FEITO (2026-07-05). Sobrou só `jspdf` (breaking) — decisão abaixo.
3. ✅ **Rate limiting** públicos + fim do vazamento de `error.message`/stack — FEITO (2026-07-06). Ver abaixo.
4. ✅ **RLS restante** — FEITO (2026-07-06, migration `20260706120000`). Ver abaixo.
5. **`git rm --cached .env`** — PENDENTE (aguarda ok; ver nota abaixo).
6. ✅ **quiz-actions + capture-signature** — FEITO (2026-07-06, após as 2 decisões). Ver abaixo.

Detalhes completos dos achados: memória `security-audit-remediation.md`.

---

## ✅ FEITO nesta sessão (2026-07-05) — aguardando deploy + teste

### Item 1 — Frontend XSS + CSP
- Instalado **DOMPurify** (`dompurify@^3.4.11`).
- Novo helper `sanitizeHtmlContent()` em `src/lib/sanitize.ts` (permite rich text + `iframe`; remove `<script>`, `on*`, `javascript:`).
- Aplicado em: 6 pontos Fluzz (Vision, Culture, NoteDetail, GettingStartedDetail, Processes ×2), `TemplateFillForm`, `PublicQuizPage` (embed).
- `ContactFilesSection`: não tinha `dangerouslySetInnerHTML`; corrigido XSS via `printWindow.document.write` com `${file.name}` cru → `escapeHtml`.
- **CSP endurecida** (`index.html`): removidos `'unsafe-inline'` e `'unsafe-eval'` do `script-src`; adicionado `googletagmanager.com` (+ google-analytics no `connect-src`). `style-src 'unsafe-inline'` mantido de propósito.
- Pixels do quiz (FB + Google) refatorados em `PublicQuizPage` para NÃO usar `<script>` inline (stub em JS + script externo via `.src`) — sobrevivem à CSP. Bônus: pixel Google (que estava bloqueado) volta a funcionar.
- **NÃO mexido de propósito:** `ConversationDetail:1624` (WhatsApp formatter já escapa) e `chart.tsx` ×2 (CSS do shadcn).
- Typecheck + `vite build` OK.

### Item 2 — Dependências
- `npm audit fix` (sem `--force`): 25 → 1 vuln. Corrigidos react-router (6.30.1→6.30.4), ws (8.21.0), lodash, tar, minimatch, form-data, vite, etc. (quase tudo transitivo, no lockfile).
- Typecheck + build OK.

---

## ⚠️ TESTAR DEPOIS (manual, antes/depois do deploy)
- [ ] Abrir a app + Console do navegador e navegar: dashboard, uma conversa (render WhatsApp), doc Fluzz (Vision/Processos), preview de template de documento, e **um quiz público com pixel**. Verificar se NÃO aparece erro `Content-Security-Policy` / `Refused to execute inline script`. Se aparecer de lib inesperada (ex.: algo com `eval`), adicionar exceção mínima na CSP.
- [ ] Confirmar que o **pixel do Facebook no quiz** ainda dispara (Network → `fbevents.js` / `tr?`).
- [ ] Gerar um PDF em Debriefing (`DebriefingResults`) pra garantir que o audit fix não afetou jspdf.

## ✅ DECISÃO RESOLVIDA
- [x] **jspdf**: `npm audit fix --force` aplicado (2026-07-06) → `jspdf@3.0.4 → 4.2.1`. **0 vulnerabilidades** restantes. Uso (`new jsPDF({orientation,unit,format})`/`addImage`/`save` em `DebriefingResults.tsx`) é API core estável no v4. Typecheck + `vite build` OK. **Testar em runtime**: gerar um PDF em Debriefing (`DebriefingResults`) após o deploy.

## ✅ ACHADO SEPARADO — RESOLVIDO (2026-07-06)
- `frame-src` afrouxado de `'none'` para `'self' https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com https://*.supabase.co`. Cobre: embeds de vídeo do quiz (`toEmbedUrl` → youtube/vimeo), getting-started + tiptap YouTube no Fluzz, e o **preview de PDF da assinatura** (`SignaturePage` iframe `pdf_url`, hospedado no storage do Supabase).
  - **Limitação conhecida:** `quiz-bubble-embed` e iframes colados à mão nos Processos Fluzz só carregarão se o host estiver nessa lista. Outros provedores (Typeform, Calendly, Google Forms, Loom, etc.) precisam ser adicionados manualmente ao `frame-src` conforme a necessidade.

---

## ✅ FEITO na sessão 2026-07-06 (itens 3, 4, 6) — aguardando deploy + migrations + teste

### Item 3 — Rate limiting + fim do vazamento de erro
- **Migration nova `20260705130000_rate_limit.sql`** (aplicar pelo Lovable): tabela `rate_limits` + RPC atômica `check_rate_limit` (fixed-window, `SECURITY DEFINER`, auto-limpeza de janelas antigas, sem RLS pública).
- **`_shared/middleware.ts`**: helpers `checkRateLimitDb()` (**fail-open** se a RPC ainda não existir — deploy não quebra prod antes do sync), `getClientIp()`, `safeErrorResponse()` (loga stack no server, devolve msg genérica).
- **12 endpoints públicos** com rate limit por IP + catch-all sanitizado: `signature-send-otp` (15/min), `signature-verify-otp` (30), `signature-load-document` (40), `signature-verify-public` (40), `signature-complete` (20), `public-form-submit` (20), `public-document-fill` (30), `public-pack-form` (30), `public-template` (60), `widget-submit` (20), `track-fingerprint` (60), `send-signer-link` (15).

### Item 4 — RLS restante (migration `20260706120000_security_rls_fixes_lote2.sql`, aplicar pelo Lovable)
- `platform_settings`: SELECT público irrestrito → **whitelist** (`allow_signups`, `show_client_plans_menu`). Fecha leitura anon de `evolution_api_key`/`payment_gateway_settings`. (Único read direto do client é `show_client_plans_menu` na Sidebar; resto vai por admin-dashboard/service_role.)
- `signature_evidence`: removido INSERT anon (só `signature-complete` grava, via service_role).
- `organizations` / `whatsapp_instances`: removido INSERT `WITH CHECK(true)` → só service_role (criação real via trigger `SECURITY DEFINER` + edge functions).
- `quiz_submissions`: mantém INSERT anon (página pública insere direto) mas com `WITH CHECK` restrito a quiz ativo/público com org batendo.

### Item 6 — quiz-actions + capture-signature (decisões confirmadas)
- **`quiz-actions`**: `quiz_id` agora obrigatório; **org derivada do quiz** (nunca do body; rejeita se `body.organization_id` diverge); rate limit por IP (30/min); catch-all sanitizado. **`send_whatsapp` server-authoritative**: mensagem e telefone saem do **bloco do quiz** (`theme.nodes[].data.blocks[]` via novo `block_id`), interpolados server-side — `body.message` ignorado. FE (`PublicQuizPage`) passou a enviar `block_id`.
- **`capture-signature` REMOVIDA** (função + entrada no `config.toml` + rótulo no `AdminDocsPage`). Era bypass de OTP/selfie; nenhum caller real no front (só `signature-complete` é usado). 

### ⚠️ Decisões que estavam pendentes — RESOLVIDAS
1. quiz `send_whatsapp`: telefone = o do quiz; **mensagem do config do quiz** (não livre), com opção de `trigger_flow`. → implementado server-authoritative.
2. capture-signature: sem caller real no front (só `signature-complete`) → **removida**.

---

## 🚀 CHECKLIST CONSOLIDADO — fazer TUDO de uma vez (deploy + migrations + testes)

**1. Aplicar migrations PELO LOVABLE (nesta ordem, NÃO pelo SQL Editor):**
- [ ] `20260705120000_security_rls_fixes.sql` (sessão 1 — OTP + flow_node_logs)
- [ ] `20260705130000_rate_limit.sql` (tabela + RPC `check_rate_limit`)
- [ ] `20260706120000_security_rls_fixes_lote2.sql` (platform_settings/signature_evidence/orgs/instâncias/quiz)

**2. Secrets no Supabase:**
- [ ] `ASAAS_WEBHOOK_TOKEN` (mesmo valor do token do webhook no painel Asaas)

**3. Deploy das Edge Functions** (todas as `zapi-*`, `signature-*`, `public-*`, `quiz-actions`, `transcribe-media`, `analyze-conversation`, `asaas-webhook`, `widget-submit`, `track-fingerprint`, `send-signer-link`, `_shared/*`). `capture-signature` foi removida.

**4. Testes runtime (depois do deploy + migrations):**
- [ ] **CSP/pixels** (item 1): abrir app + Console e navegar dashboard, conversa (render WhatsApp), doc Fluzz, preview de template, quiz público com pixel → sem `Content-Security-Policy`/`Refused to execute inline script`. Confirmar pixel FB dispara (Network `fbevents.js`).
- [ ] **PDF** (item 2): gerar PDF em Debriefing (`DebriefingResults`) — garantir que audit fix não afetou jspdf.
- [ ] **Assinatura completa** (itens 3/4/6): abrir `/sign/<token>`, carregar doc, enviar OTP, verificar OTP, finalizar (`signature-complete`), ver recibo/verificação pública. Testar que reenvio/verificação em excesso dá 429.
- [ ] **Quiz público** (itens 4/6): responder um quiz com bloco de WhatsApp → a mensagem chega (vinda do config do quiz) e o lead entra no CRM/pipeline. Bloco de flow dispara o flow.
- [ ] **Formulários públicos** (itens 3/4): `public-form-submit`, `widget-submit`, `public-document-fill`, `public-pack-form` — submeter e ver criação de doc/contato.
- [ ] **WhatsApp** (sessão 1): enviar msg, carregar histórico, CRM, transcrição (6 funções `zapi-*` mexidas).
- [ ] **Rate limit ativo**: após aplicar `20260705130000`, confirmar que estourar um endpoint público retorna 429 (o fail-open só vale ANTES da migration).

**5. Ainda manual/decisão:**
- [x] `jspdf@4.2.1` — `npm audit fix --force` aplicado (0 vulns; typecheck+build OK). Só falta testar geração de PDF em runtime.
- [ ] **`git rm --cached .env`** — `.env` está rastreado no git (mesmo estando no `.gitignore`). `git rm --cached .env` para de rastrear, MAS os segredos continuam no HISTÓRICO → remediação completa = rewrite de histórico + **rotação das chaves**. Decidir se faz agora.
- [x] (Opcional) **CSP `frame-src` afrouxado** (2026-07-06) → youtube/youtube-nocookie/vimeo/supabase. Ver "ACHADO SEPARADO — RESOLVIDO". Outros provedores de embed exigem adição manual.
- [x] (Opcional) **`stripe-webhook` REMOVIDA** (2026-07-06) → diretório `supabase/functions/stripe-webhook` deletado (Stripe não é usado). Não estava no `config.toml`. **Sobra dangling (cosmético, não corrigido):** `admin-dashboard/index.ts:1094` ainda monta a string de URL `/functions/v1/stripe-webhook` para exibição, e a aba Stripe em `AdminPaymentGatewaysPage` continua na UI — nenhum dos dois invoca o endpoint; só aparecem no painel admin.

---

## 🔁 PROMPT PARA CONTINUAR (cole numa nova sessão)

```
Continuar a remediação de segurança do handoff em docs/plano-seguranca-handoff.md
(contexto completo na memória security-audit-remediation.md). Já usamos só Asaas.

Itens 1-4 e 6 + jspdf JÁ ESTÃO FEITOS (código no working tree, ainda NÃO deployado
nem testado em runtime) — NÃO refaça. Ver as seções "FEITO" do handoff.

Estado: fiz o deploy das Edge Functions e apliquei as 3 migrations pelo Lovable
(20260705120000, 20260705130000, 20260706120000). Agora quero VALIDAR em runtime
seguindo o "CHECKLIST CONSOLIDADO" do handoff. [Descreva o que testou e QUALQUER
erro que apareceu — ex.: erro de CSP no console, 429 inesperado, quiz não envia
WhatsApp, assinatura falha, PDF do Debriefing quebrado.]

Regras ao me ajudar:
- Se aparecer erro de CSP (Refused to execute / connect), ajuste a exceção MÍNIMA
  no index.html.
- Rate limit: só "liga" depois da migration 20260705130000 (checkRateLimitDb é
  fail-open antes disso). Se um endpoint público não bloquear, confirme se a RPC
  check_rate_limit existe.
- quiz-actions send_whatsapp agora é server-authoritative (msg/telefone vêm do
  bloco via block_id); se um quiz parar de enviar, cheque se o front está mandando
  block_id e se o bloco tem waMessage/waNumber/useContactPhone.

Pendências que dependem de mim (NÃO faça sem eu confirmar):
- .env rastreado no git: vou rotacionar TODAS as chaves (Asaas, Supabase service
  role, Resend, Evolution/UAZAPI, etc.) e aí sim rodar git rm --cached .env +
  limpar histórico. Não mexa nisso ainda.
- Opcional: remover a função stripe-webhook (Stripe não é usado).
- Opcional: afrouxar CSP frame-src para embeds de vídeo (precisa da lista de hosts
  permitidos: youtube/vimeo/etc.).
```
