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

---

# ADENDO 2026-07-13 — Mapeamento completo + decisão de escopo

`task-files` (piloto) FEITO: privado + signed URL (`20260710120000`), corrigido bug de name-shadowing (`20260713120000`, commit `179b00cc`). Migration aplicada pelo SQL Editor E commitada.

## Descoberta que muda o alvo
**`chat-media` e `flow-media` NÃO podem virar privados.** O provedor de WhatsApp baixa a URL PÚBLICA da mídia para *entregar* (envio manual e por fluxo). Privatizar quebra o envio na hora. Só dá pra fechar o gap de **escrita cross-org** (INSERT/UPDATE por org); a leitura pública é requisito do provedor.

## DECISÃO (escopo seguro escolhido para executar)
1. **carousel-images** → privado + signed URL (só front exibe; sem fetch externo).
2. **contact-avatars** → privado + signed URL **on-read** (front lê `avatar_url` direto no `<img>`).
3. **chat-media + flow-media** → escopar **INSERT/UPDATE por org**, MANTER leitura pública.
4. **contact-files** → ADIADO (refactor alto risco — ver abaixo; sessão dedicada COM janela de teste).

## Regras de deploy (repetir sempre)
- Migration sobe **pelo Lovable** (SQL Editor reverte no sync). **Commitar** todo `.sql`.
- Migration + deploy do FRONT novo **juntos**: ao virar `public=false`, URL pública morre na hora.
- Sem teste local (`supabase start` quebrado) → testar em prod/staging com cuidado.

---

## Mapa por bucket (arquivo:linha) — levantado 2026-07-13

### carousel-images  → PRIVATIZAR
- `public=true` em `20260608120000_carousel_ia.sql:178`. SELECT público `:182-183`; INSERT/UPDATE/DELETE exigem `authenticated`. DELETE aberto já removido (`20260709121000_storage_delete_hardening.sql:34`).
- Upload SÓ server-side (service_role): `_shared/carousel.ts:294` (`CAROUSEL_BUCKET`), `uploadImage()` `:296-309` (`.upload(key,…,{upsert:true})`), `getPublicUrl` `:307`. Callers: `carousel-generate`, `carousel-regenerate-image`.
- Sem fetch externo pelo provedor. Consumo = **front** (exibe/baixa). URL pública é salva no registro do carrossel.
- **A CONFIRMAR no início:** (a) convenção de `key` (path) — ver os callers de `uploadImage` pra saber se há orgId; (b) onde o front lê/exibe a URL do carrossel (tabela/coluna + componente) → é lá que entra o signed URL on-read.
- Implementar: `public=false`; policy SELECT org-scoped (via JOIN na tabela do carrossel por org); front passa a assinar on-read (helper igual `src/fluzz/lib/taskFiles.ts`).

### contact-avatars  → PRIVATIZAR
- `public=true` em `20260421201701_.sql:3-4` e duplicata `20260421201704_08c09759-…sql:4`. Policy `Public read contact-avatars` SELECT aberto. SEM policy INSERT/UPDATE/DELETE (escrita só service_role).
- Upload (2, service_role): `backfill-contact-avatars/index.ts:177-179` path `${c.id}/${Date.now()}.${ext}`; `zapi-contact-profile/index.ts:210-212` path `${contactId}/${Date.now()}.${ext}`. **Path = contactId, sem orgId.**
- `getPublicUrl` → salvo em **`contacts.avatar_url`**: `backfill:181→:187`; `zapi-contact-profile:214→:233`.
- ⚠️ `contacts.avatar_url` é **coluna MISTA**: também guarda URL crua do WhatsApp (`zapi-webhook:1947,2945,2962`; `zapi-sync-chats:205,220,225`). SÓ as URLs de storage viram 404 ao privatizar.
- Front lê `avatar_url` e renderiza `<img src>` (telas AUTENTICADAS): `ConversationList.tsx:155`, `ContactProfilePanel.tsx:399,745`, `ContactListItem.tsx:171`, `PipelineBoard.tsx:194-196`, `PipelineBoardV2.tsx:1135,2041`. Selects: `useConversations.ts:91`, `PipelinePage.tsx:136`, `ContactProfilePanel.tsx:79,265`.
- **NENHUMA leitura pública sem login.** `usage.ts:315` só lê metadado (tamanho), não quebra.
- Implementar: `public=false`; policy SELECT org-scoped via JOIN `contacts` (`(foldername(name))[1] = contacts.id` → org do contato → `user_has org`); front assina **on-read** apenas quando a URL contém `/storage/v1/object/public/contact-avatars/` (URLs cruas do WhatsApp ficam como estão). Helper central de exibição de avatar.

### chat-media  → MANTER PÚBLICO, escopar write
- `public=true` `20260122190317_…sql:2-9`. SELECT público `:12-15`. INSERT `authenticated`-only `:18-24`. DELETE removida no hardening.
- Uploads FRONT (anon, RLS aplica):
  - `useMediaUpload.ts:24` path `${conversationId}/${ts}-${rand}.${ext}`
  - `CreateScheduledMessageDialog.tsx:156-158` e `EditScheduledMessageDialog.tsx:189-191` path `scheduled/${safeWorkspace}/${ts}-${uuid}.${ext}`
  - `ProfilePage.tsx:159-160` upload de avatar de perfil (**confirmar path**)
- Uploads EDGE (service_role, RLS imune → policy não afeta): `zapi-message-actions/index.ts:270-272` `recovered-media/${message.id}.${ext}`; `zapi-webhook/index.ts:1855-1870`.
- URL salva em **`messages.media_url`** (inbound `zapi-webhook:2211`; outbound `zapi-send-message:368,614,779`; recovery `zapi-message-actions:287-290`; fluxo `flow-execute:1522,1540`).
- Fetch do provedor (LEITURA PÚBLICA OBRIGATÓRIA): `zapi-send-message` `validatePublicMediaUrl:97-142` (chamada `:381`, rejeita URL não-pública), entrega `mediaUrl` `:502,513,663,671,682`; `flow-execute sendMediaItem:1453,1462,1484`.
- Escopar write: paths heterogêneos e sem orgId. **Abordagem recomendada:** mudar path de upload do FRONT para prefixo `${orgId}/…` e policy `INSERT/UPDATE WITH CHECK (foldername[1] IN orgs do user)`. Arquivos antigos ficam legíveis (read público), então NÃO precisa migrar. ⚠️ Testar que upload de mídia no chat + agendamento continuam funcionando. **Confirmar** o que é `safeWorkspace` (nome sanitizado? id?) antes.

### flow-media  → MANTER PÚBLICO, escopar write
- `public=true` `20260122195655_…sql:3`. SELECT público. DELETE removida no hardening.
- Uploads FRONT: `NodePropertiesPanel.tsx:140-142` path `${item.type}s/${fileName}` (`images/`,`videos/`); `RemarketingStepsEditor.tsx:38-40` path `followup-media/${ts}-${rand}.${ext}`. **Sem orgId, sem id joinável.**
- URL salva no JSON do nó do fluxo (`item.mediaUrl`), consumida externamente por `flow-execute` → provedor (LEITURA PÚBLICA OBRIGATÓRIA).
- Escopar write: mesma abordagem — mudar path do front para `${orgId}/…` + policy `foldername[1]=orgId`. Read público continua.

### contact-files  → ADIADO (alto risco)
- Paths HETEROGÊNEOS: `${contactId}/…` (`useContactFiles.ts:308-315`), `quiz-uploads/${quizId}/…` (**anon público** `PublicQuizPage.tsx:894-898`), `${orgId}/templates|template-logos|document-images/…` (`UploadTemplateDialog:44`, `TemplateEditor:124`, `RichTextEditor:134`), `signatures/${sigId}/…` (`signature-complete:195,216`, service_role), `signatures/${id}/receipt…` (`signature-receipt:30`), `signatures/${docId}/signed…` (`signature-stamp-pdf:226`), `generated/…` (`generate-document-pdf:687`).
- URL pública persistida em ~8 colunas: `contact_files.file_url`(+`storage_path`), `signature_evidence.selfie_url/receipt_pdf_url/original_pdf_url`, `document_signatures.signature_url/signed_pdf_url(+metadata)`, `generated_documents.pdf_url/signed_pdf_url`, resposta de quiz, HTML de template.
- 🔴 FLUXOS PÚBLICOS SEM LOGIN leem via `fetch(publicUrl)`: `PublicSignaturePage.tsx:150-157` (preview PDF a assinar), `PublicVerificationPage.tsx:156-166` (`<a>` p/ signed_pdf_url + receipt_pdf_url), `signature-verify-public` devolve URLs cruas.
- Edge functions service_role que LEEM por `fetch(publicUrl)` (quebram ao privatizar): `signature-stamp-pdf:16-26,87,175`; `_shared/buildReceiptPdf.ts:18-21,305,326`.
- Privatizar exige: trocar todos esses `fetch(publicUrl)` por `storage.download(path)`/`createSignedUrl`, endpoint que assine p/ os fluxos públicos, e tratar as URLs persistidas. **Só numa sessão dedicada com teste de assinatura/verificação.**

## Ordem de execução (escopo seguro)
1. carousel-images (mais contido) → 2. contact-avatars → 3. chat-media + flow-media (write scope). Cada bucket: migration (Lovable) + front juntos, depois VALIDAR em runtime. Parar e pedir teste ao usuário antes de marcar "pronto" em cada um.

## Progresso
- ✅ **carousel-images FEITO** (2026-07-14). Migration `20260713130000_storage_carousel_images_private.sql`: `public=false`, SELECT/INSERT/UPDATE org-scoped via JOIN `carousels` (folder[1]=carousel_id → org). Front: helper `src/components/carousel/carouselImages.ts` (espelha taskFiles) + hook `useSignedCarouselImage`; assinatura na camada de exibição (`SlideCard.tsx` `<img>` e `renderSlide.ts` canvas), cobre load inicial + realtime + regenerate. Sem migração de arquivos (path inalterado). Verificado que NÃO há fetch externo (instagram_media_id nunca é lido/escrito). Testado em runtime pelo usuário (preview legado, gerar novo, regenerar imagem, download .zip com canvas/CORS, isolamento cross-org) — tudo verde.
- ✅ **contact-avatars FEITO** (2026-07-14). Migration `20260714120000_storage_contact_avatars_private.sql`: `public=false`, SELECT org-scoped via JOIN `contacts` (folder[1]=contact_id → org). Só SELECT (bucket já não tinha write policy p/ authenticated; escrita é service_role). Front: helper `src/components/conversations/contactAvatars.ts` — trata a COLUNA MISTA (só assina URLs `/contact-avatars/`; URLs cruas do WhatsApp passam direto) + **assinatura em lote coalescada** (uma createSignedUrls por tick, resolve perf de lista). Assinatura central no componente `ContactAvatar` (cobre ConversationList/ContactProfilePanel/PipelineBoardV2/ConversationDetail); 2 sites crus corrigidos (contacts/ContactListItem via hook; PipelineBoard v1 convertido p/ ContactAvatar). Qualificado `objects.name` (contacts TEM coluna name → risco de shadowing). Sem migração de arquivos. Verificado sem fetch externo. Testado em runtime (foto de storage aparece, coluna mista intacta, perf ok após batch) — verde.
- ✅ **chat-media + flow-media (write scope) FEITO/VALIDADO/COMMITADO** (2026-07-14, commit `eaf425ed` "segurança no chat"). Migration `20260714130000_storage_chat_flow_media_write_scope.sql`: buckets SEGUEM PÚBLICOS (leitura é requisito do provedor); INSERT/UPDATE trocados de `authenticated`/bucket_id para `foldername[1] = get_user_org_id(auth.uid())`. Front: TODOS os 6 uploads passam a prefixar `${orgId}/...` — useMediaUpload (param orgId, caller ConversationDetail passa profile.organization_id; teste atualizado), ProfilePage (avatar `${orgId}/avatars/...`), Create+EditScheduledMessageDialog (`${orgId}/scheduled/${workspace}/...`, useAuth adicionado), NodePropertiesPanel/MediaUploadField (`${orgId}/${type}s/...`) e RemarketingStepsEditor (`${orgId}/followup-media/...`). Uploads via edge (service_role) NÃO mudam (imunes a RLS). Arquivos antigos legíveis (read público) → sem migração. **Validado em runtime pelo usuário nos 5 pontos** (chat, agendamento create+edit, avatar de perfil, mídia em nó de fluxo, remarketing) — o 403 inicial era front antigo cacheado; após deploy do bundle novo + hard refresh o path sobe com `48dcff79.../` e passa. Migration aplicada pelo Lovable + commitada.
- ✅ **contact-files — FASE A (leitores → signed URL/download) VALIDADA EM PROD + PUSHED** (2026-07-15, commit `098ca41d`). Estratégia escolhida com o usuário: **privatização completa** (fecha READ+WRITE), executada em duas fases — **Fase A: converter TODOS os leitores (backward-compatible, bucket ainda público)**; **Fase B: flip `public=false` + policies (com janela de teste)**. Testado em prod pelo usuário (CRM, fluxos públicos de assinatura/verificação, assinar contrato ponta a ponta, docs autenticados) — verde. Fase A feita:
  - **A.1 contact_files (CRM):** helper `src/components/conversations/contactFiles.ts` (espelho de contactAvatars, batch+cache; prefere `storage_path`, extrai path da `file_url` nas linhas antigas) + `ContactFilesSection` assina on-read (thumb via `ContactFileThumb`, preview img/vídeo/áudio, download via `storage.download`, PDF já preferia download, abrir-nova-aba via `openContactFileInNewTab`).
  - **A.2 fluxos PÚBLICOS de assinatura:** edges `signature-load-document` e `signature-verify-public` assinam `pdf_url`/`signed_pdf_url`/`receipt_pdf_url` (via novo `_shared/storageDownload.ts` → `signContactFileUrl`, TTL 3h) ANTES de devolver. **Zero mudança de front** (PublicSignaturePage/PublicVerificationPage consomem a string como está).
  - **A.3 edges service_role:** `_shared/storageDownload.ts` (`fetchBytesOrDownload`); `signature-complete` (hash), `signature-stamp-pdf` (hash+load original), `_shared/buildReceiptPdf` (selfie/assinatura, agora recebe client admin), `generate-document-pdf` (logo) leem via `storage.download` por path.
  - **A.4 docs AUTENTICADOS:** novo edge `sign-document-file` (verify_jwt=true) autoriza por org via RLS na LINHA (generated_documents/document_signatures) e assina via service_role; front helper `src/components/documents/documentFiles.ts` (batch+cache, só roteia URLs público-formato do bucket). Costurados: GeneratedDocumentsList (download+ZIP), SignaturePage (iframe via hook), SignaturesList (abrir original/assinado, ZIP, regenerar recibo — este assinado no edge `signature-receipt-regenerate`, removido o `?t=` que quebraria o token), ContactContractsSection (abrir assinado; **`saveSignedGroupToFiles` mantém URL CRUA** — A.1 assina na leitura).
  - Typecheck do front limpo (0 erros). Sem migration nesta fase (bucket segue público → signed URL/download funcionam de sobra; se assinar falhar, fallback é a URL pública). **Não commitado/deployado ainda.**
  - ✅ **A.5 MAPEADA + DECIDIDA (2026-07-15) — sem código novo nesta fase.** Varredura das superfícies extras concluída. Resultado:
    1. **Arquivos de resposta de quiz → JÁ cobertos pela A.1.** O upload (`quiz-uploads/${quizId}/...`) não fica solto: o edge `quiz-actions` (`index.ts:204-222`) **insere o arquivo em `contact_files`** (`file_url` + `storage_path`). É lido pela mesma `ContactFilesSection` do CRM que a A.1 converteu para signed URL on-read. Não há tabela `quiz_responses` nem tela separada que leia o arquivo cru. Zero código A.5.
    2. **`organizations.logo_url` → FORA de escopo (não é contact-files).** Nenhum caminho (front ou edge) faz upload de logo de org pra contact-files; o único asset de logo real no código é o externo `wizzybr.com` (`_shared/buildReceiptPdf.ts`). Os `<img src={org.logo_url}>` em PublicFormPage:207 / PublicPackFormPage são URL externa/legada → deixados como estão.
    3. **`template-logos` + `document-images` → assets de design, exibidos SÓ LOGADO → convertidos JUNTO com o flip na Fase B (decisão do usuário 2026-07-15).** Confirmado que NÃO há leitor público nem no PDF: `generate-document-pdf` usa pdf-lib e embute só a logo do cabeçalho (via `fetchBytesOrDownload`, já na A.3) — `<img>` do corpo do `content_html` NÃO entram no PDF; PublicFormPage renderiza `template.content` (texto puro), não `content_html` → sem leitura anônima. Renderizam só em telas autenticadas: `TemplateEditor` (preview lateral + editor TipTap) e `TemplateFillForm`/`PackFillForm` (preview `content_html`), todas sob `src/components/documents/`. Como são autenticados e autocontidos (sem fluxo público/PDF/edge), a conversão dos readers vai junto com o flip `public=false` na Fase B, mesmo deploy, risco idêntico. **Complexidade a resolver na Fase B:** `content_html` é a fonte-da-verdade persistida no TipTap → a reescrita URL pública→assinada tem de ser SÓ-NA-EXIBIÇÃO (renderiza assinado, persiste cru), senão a signed URL expirada seria salva no banco.
  - ⏳ **FASE B (flip) — CÓDIGO ESCRITO (2026-07-15), aguardando deploy coordenado + janela de teste.** Decisões alinhadas com o usuário: imagens embutidas do `content_html` → **assinar só na exibição** (load-sign / save-strip, honra a A.5); drift de policies → **DO block defensivo**. Escrito:
    - **Migration `20260715120000_storage_contact_files_private_flip.sql`:** DO block dropa qualquer policy de `storage.objects` que referencie `contact-files` (EXCETO a anon `Public users can upload quiz files`) + drop por nome conhecido (rede de segurança). Cria (TODAS qualificando `objects.name`): SELECT (a) CRM `folder[1]=contact_id`→org via JOIN contacts; (b) `quiz-uploads/` via JOIN `contact_files.storage_path`→org; (c) design assets `folder[1]=org AND folder[2] IN (template-logos,document-images)`. INSERT/UPDATE (d) CRM via contacts, (e) org assets `folder[2] IN (templates,template-logos,document-images)`. DELETE recriada via contacts qualificada. **`public=false`.**
    - 🐛 **Bug corrigido de brinde:** a policy DELETE antiga (`20260709121000`) tinha name-shadowing LATENTE — `name` sem qualificar dentro do EXISTS de `contacts` (que TEM coluna `name`) resolvia p/ `contacts.name` → DELETE de arquivo no CRM já falhava em prod (RLS de DELETE independe de `public`). Recriada qualificando `objects.name`.
    - **Blockers pré-flip mapeados e resolvidos (não cobertos pela Fase A):**
      1. **PDF público gerado** (`generate-document-pdf` → `generated/...` → `getPublicUrl` cru): `public-form-submit` agora ASSINA `pdf_url` (via `signContactFileUrl`, TTL 3h) antes de devolver ao `<a href>` anon do PublicFormPage E antes do `sendWhatsAppMessage` (o provedor busca a mídia; `sendWhatsAppMessage` não valida formato → signed URL passa). Linha em `generated_documents` fica CRUA (readers autenticados re-assinam via A.4). `public-pack-form` = SEM mudança (envia link de assinatura em texto, não o PDF; `pdf_url` não é renderizado ao anon).
      2. **Doc bruto p/ IA** (`UploadTemplateDialog` → `${orgId}/templates/` → `process-document-template` fazia `fetch(file_url)` público): trocado por `fetchBytesOrDownload(file_url, adminClient)` (service_role baixa por path).
    - **Readers de design asset (display-only):** novo helper `src/components/documents/templateAssets.ts` (batch `createSignedUrls`+cache; `signHtmlImages`/`useSignedHtml`, `stripSignedImages` signed→público, `useSignedContactFileUrl`; só toca `/object/public/contact-files/`). Costurados: `RichTextEditor` (load-sign no effect / save-strip no onUpdate / upload-sign / logo-insert-sign — o content_html no banco fica SEMPRE cru), `TemplateEditor` (`<img>` logo lateral), `TemplateFillForm` (`<img>` logo + `content_html` do preview). Confirmado que EditFilledDataDialog/PackFillForm NÃO renderizam content_html no DOM (só geram PDF, e `generate-document-pdf` não embute `<img>` do corpo); fluxos autenticados persistem `pdf_url` cru (lista via A.4), nunca link cru.
    - 🐛 **Gap achado na 1ª janela de teste (bucket já privado):** `signature-complete` devolvia `signedPdfUrl`/`receiptPdfUrl`/`packSignedDocuments[].*` CRUS — a tela "Assinatura Concluída" (PublicSignaturePage) faz `fetch()`/`<a href>` direto → pós-flip dava `{"statusCode":"404","Bucket not found"}` no comprovante e PDF "corrompido" (o JSON de erro salvo como .pdf). **Causa:** a Fase A foi testada com o bucket AINDA público, então esses retornos crus funcionavam e o gap ficou invisível até o flip. **Fix:** `signature-complete` agora assina os 3 (via `signContactFileUrl`, service_role) antes de devolver. Varredura confirmou que os demais edges de assinatura já assinavam (`signature-verify-public` signed+receipt, `signature-load-document` pdf_url, `signature-receipt-regenerate`) e que `signature-receipt`/`signature-stamp-pdf` só são consumidos internamente por `signature-complete`. Todos os consumidores front de `generate-document-pdf` PERSISTEM `pdf_url` cru (lido via A.4), nunca renderizam cru. `SignaturePage` usa `useSignedDocFileUrl`. **Nenhum outro gap encontrado.**
    - **Typecheck do front limpo (0 erros).** NÃO commitado/pushado ainda.
    - **FALTA:** (1) deploy COORDENADO — migration aplicada no SQL Editor do Lovable + bundle front/edge JUNTOS (ao virar `public=false` a URL pública morre na hora); (2) JANELA DE TESTE em prod; (3) atualizar memória `storage-buckets-open-rls-gap`; (4) commit/push (após OK do usuário).
    - **Checklist da janela de teste:** assinar contrato ponta a ponta; verificação pública; CRM (abrir/baixar/**deletar** arquivo — testa o fix do shadowing; abrir arquivo de quiz num contato); gerar doc autenticado (download+ZIP na lista); **PublicFormPage: preencher form público → baixar o PDF gerado (anon) + auto-envio WhatsApp**; editar template com logo + imagem embutida (editor TipTap salva/reabre com URL crua + preview FillForm); isolamento cross-org (403).
