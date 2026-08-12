-- Contatos do Instagram e disparo com recorte de janela.
--
-- Duas entregas do mesmo pedido ("quero ver os contatos do Instagram e mandar
-- mensagem para eles"), separadas porque esbarram em regras diferentes:
--
--   CONTATOS  — barrado por uma regra NOSSA, contornável. `contacts.phone` é
--               NOT NULL: a tabela de contatos da Wizzy é, por definição, uma
--               lista de telefones. Contato do Instagram tem IGSID e @, e pode
--               nunca revelar telefone. Em vez de afrouxar a coluna mais usada
--               do produto (ou inventar telefone falso, que contaminaria
--               disparo de WhatsApp, deduplicação e pipeline), os contatos do
--               Instagram ganham tela própria e um vínculo MANUAL para quando
--               a mesma pessoa também for contato de WhatsApp.
--
--   DISPARO   — barrado pela META, não por nós. Fora da janela de 24h só passam
--               mensagens etiquetadas; promocional para base fria derruba a
--               conta do cliente. Então o público não é "todo mundo": é quem
--               respondeu nas últimas 24h. Isto está modelado no banco, e não
--               só na tela, porque a tela pode ser contornada e a regra não.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. VÍNCULO MANUAL COM O CONTATO DA WIZZY
--
-- Manual, e nunca automático: dois perfis com o mesmo nome não são prova de
-- serem a mesma pessoa, e unir contatos errados é o tipo de erro que só aparece
-- quando o cliente manda a mensagem errada para alguém.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.instagram_contacts
  ADD COLUMN IF NOT EXISTS linked_contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS linked_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS linked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.instagram_contacts.linked_contact_id IS
  'Contato da Wizzy (WhatsApp) que é a mesma pessoa. Preenchido por ação humana na tela — a Wizzy não tem como saber que dois perfis são o mesmo humano.';

-- Consulta "quem já está vinculado" e o caminho inverso (do contato da Wizzy
-- para o perfil do Instagram).
CREATE INDEX IF NOT EXISTS idx_instagram_contacts_linked
  ON public.instagram_contacts(linked_contact_id)
  WHERE linked_contact_id IS NOT NULL;

-- Busca por @ e por nome na tela de contatos. Sem isto, filtrar uma base de
-- milhares vira varredura a cada tecla digitada.
CREATE INDEX IF NOT EXISTS idx_instagram_contacts_username
  ON public.instagram_contacts(organization_id, username);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. COTA: O DISPARO TAMBÉM CONSOME
--
-- Sem esta linha o ledger recusaria a origem nova, e o disparo não teria como
-- reservar cota — passaria por cima do teto da conta, que é justamente o que o
-- ledger existe para impedir. Registrado como origem PRÓPRIA para a pergunta
-- "quem comeu a cota?" continuar respondível: um disparo grande competindo com
-- as automações de um post viral é exatamente o caso que se quer enxergar.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.instagram_send_ledger
  DROP CONSTRAINT IF EXISTS instagram_send_ledger_source_check;

ALTER TABLE public.instagram_send_ledger
  ADD CONSTRAINT instagram_send_ledger_source_check
  CHECK (source IN ('automation', 'followup', 'manual', 'broadcast'));

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. DISPAROS
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.instagram_broadcasts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  instagram_account_id UUID NOT NULL REFERENCES public.instagram_accounts(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,

  name TEXT NOT NULL,
  message TEXT NOT NULL,
  -- { label, url } — opcional, entregue como botão rastreado.
  button JSONB,

  -- O recorte que gerou a lista, guardado como foi pedido: { tag_ids, window_hours }.
  -- Serve para o relatório responder "para quem isto foi?" depois que a janela
  -- de todo mundo já fechou e a consulta não reproduz mais o mesmo conjunto.
  audience JSONB NOT NULL DEFAULT '{}',

  status TEXT NOT NULL DEFAULT 'sending'
    CHECK (status IN ('sending', 'completed', 'cancelled')),

  total_recipients INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  -- Quem já não estava mais alcançável quando chegou a vez dele. Contado à
  -- parte de 'failed' porque não é falha: é a janela tendo fechado no meio do
  -- disparo, o que num disparo grande é rotina, não incidente.
  skipped_count INTEGER NOT NULL DEFAULT 0,

  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_instagram_broadcasts_org
  ON public.instagram_broadcasts(organization_id, created_at DESC);

COMMENT ON TABLE public.instagram_broadcasts IS
  'Disparo de DM para contatos do Instagram com janela de 24h aberta. Nunca para base fria — a Meta não permite, e a conta punida é a do cliente.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. DESTINATÁRIOS
--
-- Uma linha por pessoa, criada no momento do disparo. É a fotografia do público
-- naquele instante — e é o que permite retomar de onde parou quando o lote não
-- cabe numa execução só.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.instagram_broadcast_recipients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  broadcast_id UUID NOT NULL REFERENCES public.instagram_broadcasts(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.instagram_contacts(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.instagram_conversations(id) ON DELETE CASCADE,

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'skipped')),
  tracked_link_id UUID REFERENCES public.instagram_tracked_links(id) ON DELETE SET NULL,
  error TEXT,

  attempts INTEGER NOT NULL DEFAULT 0,
  claimed_at TIMESTAMP WITH TIME ZONE,
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

  -- A mesma pessoa não recebe o mesmo disparo duas vezes, nem que a lista seja
  -- montada duas vezes por engano.
  UNIQUE (broadcast_id, contact_id)
);

-- Consulta da drenagem: o que ainda falta enviar.
CREATE INDEX IF NOT EXISTS idx_instagram_broadcast_recipients_pending
  ON public.instagram_broadcast_recipients(broadcast_id)
  WHERE status IN ('pending', 'sending');

ALTER TABLE public.instagram_broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_broadcast_recipients ENABLE ROW LEVEL SECURITY;

-- Leitura pela organização; escrita só pelas edge functions (service role).
-- O disparo NÃO é criado direto pelo cliente: passa por uma função que recalcula
-- o público no servidor. Deixar o INSERT aberto permitiria montar a lista no
-- navegador e mandar para quem estivesse fora da janela.
DROP POLICY IF EXISTS "Users can view their org Instagram broadcasts"
  ON public.instagram_broadcasts;
CREATE POLICY "Users can view their org Instagram broadcasts"
  ON public.instagram_broadcasts FOR SELECT
  USING (organization_id = public.get_user_org_id(auth.uid()));

DROP POLICY IF EXISTS "Users can view their org Instagram broadcast recipients"
  ON public.instagram_broadcast_recipients;
CREATE POLICY "Users can view their org Instagram broadcast recipients"
  ON public.instagram_broadcast_recipients FOR SELECT
  USING (organization_id = public.get_user_org_id(auth.uid()));

-- Cancelar é a única escrita que o cliente precisa fazer, e é a que ele precisa
-- poder fazer DEPRESSA — um disparo com a mensagem errada já saindo.
DROP POLICY IF EXISTS "Users can cancel their org Instagram broadcasts"
  ON public.instagram_broadcasts;
CREATE POLICY "Users can cancel their org Instagram broadcasts"
  ON public.instagram_broadcasts FOR UPDATE
  USING (organization_id = public.get_user_org_id(auth.uid()))
  WITH CHECK (organization_id = public.get_user_org_id(auth.uid()));

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. RESERVA ATÔMICA DA DRENAGEM
--
-- Mesmo padrão de claim_instagram_followups, pelo mesmo motivo: o cron roda a
-- cada minuto e um lote grande passa de 60s. Sem a reserva, a execução seguinte
-- encontraria as mesmas linhas ainda 'pending' e a pessoa receberia a mensagem
-- duas vezes.
--
-- Só drena disparo que ainda está em 'sending': cancelar precisa ter efeito
-- imediato sobre o que ainda não saiu.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.claim_instagram_broadcast_recipients(p_limit INTEGER DEFAULT 40)
RETURNS SETOF public.instagram_broadcast_recipients
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.instagram_broadcast_recipients r
     SET status = 'sending',
         claimed_at = now(),
         attempts = r.attempts + 1
   WHERE r.id IN (
     SELECT rec.id
       FROM public.instagram_broadcast_recipients rec
       JOIN public.instagram_broadcasts b ON b.id = rec.broadcast_id
      WHERE b.status = 'sending'
        AND rec.attempts < 3
        AND (
          rec.status = 'pending'
          -- Recupera linha presa: a função morreu depois de reservar e antes de
          -- concluir. Sem isto ela ficaria travada para sempre.
          OR (rec.status = 'sending' AND rec.claimed_at < now() - INTERVAL '5 minutes')
        )
      ORDER BY rec.created_at
      FOR UPDATE OF rec SKIP LOCKED
      LIMIT p_limit
   )
  RETURNING r.*;
$$;

COMMENT ON FUNCTION public.claim_instagram_broadcast_recipients(INTEGER) IS
  'Reserva atomicamente destinatários de disparo pendentes, para o cron enviá-los sem risco de envio duplicado.';

REVOKE ALL ON FUNCTION public.claim_instagram_broadcast_recipients(INTEGER) FROM PUBLIC, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. CRON DA DRENAGEM
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'instagram-broadcast-send',
      '* * * * *',
      $cron$
        SELECT net.http_post(
          url := 'https://zaobtetbjpuzibjymhzw.supabase.co/functions/v1/instagram-broadcast-send',
          headers := '{"Content-Type": "application/json"}'::jsonb,
          body := '{}'::jsonb
        );
      $cron$
    );
  END IF;
END $$;
