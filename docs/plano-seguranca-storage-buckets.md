# Plano de remediação — Storage buckets abertos + tokens OAuth (Advisor 2026-07-07)

Achados do Supabase Advisor (via Lovable), verificados no código em 2026-07-07.
A auditoria de julho (docs/plano-seguranca-handoff.md) **não** cobriu storage buckets — este é o gap.

Regra de deploy: migrations sobem **pelo Lovable** (nunca `supabase db push`); RLS reverte no sync se não estiver em migration versionada.

---

## Triagem (verificado, não é falso alarme)

| Sev | Achado | Verdadeiro? | Causa raiz |
|-----|--------|-------------|------------|
| 🔴 | chat-media publicly readable | SIM | `public=true` + SELECT `USING(bucket_id='chat-media')` = leitura por qualquer um sem login |
| 🔴 | contact-files read/write cross-org | SIM | `public=true` + INSERT/UPDATE/DELETE `auth.role()='authenticated'` sem escopo de org |
| 🔴 | Customer contact data exposta | SIM (via storage) | tabela `contacts` OK; vaza pelos buckets públicos contact-files/contact-avatars/chat-media (nome/telefone/arquivos) |
| 🔴 | RLS Disabled in Public | PENDENTE | não cravado nas migrations — **pedir o nome da tabela ao Advisor** |
| 🟡 | Tokens Google p/ não-admin | SIM | `drive_configs`/`calendar_configs` têm policy SELECT `TO authenticated` p/ qualquer membro; colunas `google_access_token`/`google_refresh_token` legíveis |
| 🟡 | carousel-images / flow-media write cross-org | SIM | público + write/delete p/ qualquer autenticado |
| 🟡 | Quiz upload sem validar quiz ativo | SIM | policy só checa prefixo `quiz-uploads/%` |
| 🟡 | Public Bucket Allows Listing | SIM | consequência de `public=true` |
| 🟡 | Leaked Password Protection / Search Path / SECURITY DEFINER execute | SIM (leve) | toggles/hardening do painel Supabase, não código |
| 🟡🔵 | Vulns em dependências (Crit/High/Med) | **PROVÁVEL STALE** | `npm audit` local = **0 vulns** (pós fix 05/07); Lovable deve escanear build antigo — confirmar sync do lockfile |

### Armadilhas que impedem "fechar tudo" num único flip
1. **URL pública persistida no banco:** `zapi-webhook` salva `getPublicUrl` da mídia em `messages`; avatares idem em `contacts`. Bucket privado ⇒ **mídia/avatares antigos viram 404**.
2. **Fetch externo sem login:** o provedor de WhatsApp busca a URL pública p/ entregar mídia (`zapi-message-actions`, flow-media em fluxos). Privado ⇒ **envio de mídia quebra**.
3. **Assinatura pública:** `contact-files` guarda selfie/assinatura/recibo lidos na verificação pública (sem login).
4. **Caminhos NÃO são por org:** uploads usam `${contactId}/...`, `recovered-media/${message.id}...` — não há pasta por organização. Política org-scoped rejeitaria uploads atuais + deixaria arquivos existentes órfãos. Escopar por org exige **mudar convenção de path no código + migrar arquivos existentes**.

---

## Fase 1 — SEGURO, sem quebrar app (fazer já)

### 1.1 Tokens Google (🟡 → fecha vazamento OAuth)
Front nunca usa os tokens (só declara tipo + grava null no disconnect). Backend usa service_role (imune a RLS).
- Migration: `REVOKE SELECT (google_access_token, google_refresh_token) ON public.drive_configs, public.calendar_configs FROM anon, authenticated;`
- Front (senão `select('*')` quebra): trocar `select('*')` por lista explícita de colunas SEM tokens em `useDriveConfig.ts`, `useCalendarConfig.ts`, e os `.select()` pós-upsert dessas hooks. Disconnect continua gravando null (write não é afetado por REVOKE SELECT).
- Testar: typecheck + abrir tela de config Drive/Calendar como membro não-admin.

### 1.2 Quiz upload valida quiz ativo (🟡)
- Ajustar policy INSERT `quiz-uploads/%` p/ exigir quiz ativo/público (ou mover upload p/ edge function com validação server-side).

### 1.3 Reconciliar dependências (🟡🔵 stale)
- Confirmar no Lovable que o `package-lock.json`/`bun.lock` 0-vuln (fix 05/07) subiu. Se o Advisor continuar acusando, é build velho.

### 1.4 Config do painel (🟡 leve, 1 clique cada)
- Auth → habilitar **Leaked Password Protection**.
- Functions → adicionar `SET search_path = public` nas SECURITY DEFINER (Function Search Path Mutable).
- Revisar GRANT EXECUTE das funções SECURITY DEFINER expostas a public/authenticated.

---

## Fase 2 — Buckets privados + signed URL (coordenado, testar em prod/staging)

Ordem do menor risco pro maior. Cada bucket: (a) upload passa a usar pasta por org `orgId/...`; (b) leitura troca `getPublicUrl` → `createSignedUrl`; (c) policies org-scoped por `(storage.foldername(name))[1] = orgId`; (d) `public=false`; (e) migrar arquivos existentes / gerar URLs on-read.

1. **task-files** — interno, sem fetch externo. Piloto mais seguro.
2. **contact-files** — CUIDADO: verificação pública de assinatura lê selfie/assinatura/recibo. Separar o que é público (recibo assinatura) do privado (docs CRM) ou usar signed URL com expiração no fluxo público.
3. **contact-avatars** — URLs salvas em `contacts`; migrar leitura p/ on-read.
4. **chat-media** — MAIOR risco: URLs em `messages` + fetch do provedor de WhatsApp (envio). Exige signed URL com expiração suficiente pro provedor + migração das URLs históricas. Fazer por último, com janela de teste.

carousel-images / flow-media: decidir se precisam mesmo de leitura pública (compartilhamento externo / mídia enviada em fluxo). Se sim, manter público mas **escopar write/delete por org**.

---

## Bloqueio de teste
`supabase start` não replica a history local (ver memória `migration-history-not-replayable`). Validação end-to-end de RLS/storage exige app real (prod com cuidado ou staging). Fase 2 NÃO deve ir pra prod sem teste do fluxo real (chat, envio de mídia, assinatura, booking).
