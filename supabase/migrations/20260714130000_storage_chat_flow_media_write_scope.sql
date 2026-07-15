-- Fase 2 (plano-seguranca-storage-buckets): escopar WRITE por org em chat-media e
-- flow-media.
--
-- ⚠️ Estes buckets CONTINUAM PÚBLICOS na LEITURA (public=true, SELECT público
-- intactos) — o provedor de WhatsApp baixa a URL pública para ENTREGAR a mídia (envio
-- manual via zapi-send-message e por fluxo via flow-execute). Privatizar quebraria o
-- envio na hora. O gap que dá pra fechar é a ESCRITA cross-org: hoje as policies
-- INSERT/UPDATE só checam `authenticated`/bucket_id, então qualquer usuário logado
-- pode gravar em qualquer path de qualquer org.
--
-- Modelo: o FRONT passa a subir TUDO sob o prefixo `${orgId}/...` (folder[1] = orgId).
-- As policies INSERT/UPDATE passam a exigir folder[1] = org do usuário. Uploads via
-- EDGE (service_role: zapi-webhook, zapi-message-actions `recovered-media/...`) são
-- imunes a RLS e continuam com seus paths atuais SEM mudança. Arquivos ANTIGOS
-- continuam legíveis (SELECT público) e NÃO precisam migrar. DELETE já foi removido
-- no hardening (20260709121000).
--
-- IMPORTANTE (deploy): migration + FRONT novo têm de subir JUNTOS. Se a migration
-- entrar antes do front, os uploads do front (paths antigos sem orgId) passam a ser
-- REJEITADOS até o front novo (com prefixo orgId) entrar. Não há perda de dado, mas o
-- upload de mídia no chat/agendamento/fluxo fica quebrado nessa janela.
--
-- Reversível: reverter = recriar as policies antigas (INSERT/UPDATE com
-- bucket_id + auth.role()='authenticated').

-- chat-media: INSERT org-scoped ----------------------------------------------
DROP POLICY IF EXISTS "Users can upload chat media" ON storage.objects;

CREATE POLICY "Org can upload chat media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'chat-media'
  AND (storage.foldername(objects.name))[1] = public.get_user_org_id(auth.uid())::text
);

-- chat-media NÃO tinha policy de UPDATE; criamos org-scoped para cobrir upsert
-- (ex.: ProfilePage sobe o avatar do usuário com upsert:true no mesmo path).
DROP POLICY IF EXISTS "Org can update chat media" ON storage.objects;

CREATE POLICY "Org can update chat media"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'chat-media'
  AND (storage.foldername(objects.name))[1] = public.get_user_org_id(auth.uid())::text
);

-- flow-media: INSERT org-scoped ----------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can upload flow media" ON storage.objects;

CREATE POLICY "Org can upload flow media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'flow-media'
  AND (storage.foldername(objects.name))[1] = public.get_user_org_id(auth.uid())::text
);

-- flow-media: UPDATE org-scoped ----------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can update flow media" ON storage.objects;

CREATE POLICY "Org can update flow media"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'flow-media'
  AND (storage.foldername(objects.name))[1] = public.get_user_org_id(auth.uid())::text
);
