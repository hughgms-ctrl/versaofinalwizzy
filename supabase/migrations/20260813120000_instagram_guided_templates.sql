-- Modo guiado do Wizzy Engage (paridade ManyChat) — Fase D.
--
-- O construtor visual (fluxos) já existe. Falta o OUTRO modo do ManyChat: um
-- formulário guiado, montado a partir de um modelo pronto, em que a pessoa só
-- responde perguntas ("em qual post?", "que palavra?", "o que recebem?"). É o
-- caminho de quem nunca montou automação — e o que faz o cliente novo ter
-- sucesso na primeira semana em vez de olhar para uma tela em branco.
--
-- Esta migration acrescenta as três capacidades que o modo guiado exige e que o
-- motor de regras ainda não tinha:
--
--   1. escopo "próxima publicação"  — a regra vale no próximo post publicado
--   2. "qualquer palavra"           — comentário sem palavra-chave também vale
--   3. coleta de e-mail             — a DM pergunta, a resposta vira dado
--
-- Nada aqui altera comportamento de regra já existente: as três novidades são
-- opt-in por campo novo, e quem não os tem continua sendo lido como antes.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. E-MAIL DO CONTATO
--
-- "uma DM solicitando o endereço de e-mail" precisa ter onde guardar o
-- endereço. Coluna própria, e não metadata: o e-mail é o dado que justifica a
-- automação inteira (é o que sai daqui para a ferramenta de e-mail do cliente),
-- então precisa ser consultável e exportável sem cavar JSON.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.instagram_contacts
  ADD COLUMN IF NOT EXISTS email TEXT;

COMMENT ON COLUMN public.instagram_contacts.email IS
  'E-mail informado pelo contato em resposta a uma automação de coleta. Preenchido apenas por resposta do próprio contato — a API do Instagram não expõe e-mail.';

-- Consulta típica: "quem me deu e-mail?" (para exportar / segmentar).
CREATE INDEX IF NOT EXISTS idx_instagram_contacts_email
  ON public.instagram_contacts(organization_id)
  WHERE email IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. MENSAGEM DO LINK CONFIGURÁVEL
--
-- O texto que acompanha o link estava fixo no código ("Perfeito! Aqui está o
-- link 👇"), porque até agora só existia um caminho para ele: o toque no quick
-- reply. O modo guiado tem uma seção inteira ("E então, eles vão receber → uma
-- DM contendo um link → escreva uma mensagem") e agora existe um segundo
-- caminho (a resposta com o e-mail), então o texto passa a viajar junto do
-- link em vez de ser reconstruído por quem envia.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.instagram_tracked_links
  ADD COLUMN IF NOT EXISTS link_message TEXT,
  ADD COLUMN IF NOT EXISTS link_label TEXT;

COMMENT ON COLUMN public.instagram_tracked_links.link_message IS
  'Texto da DM que entrega este link. Gravado na criação para que quem envia (postback de quick reply ou resposta de coleta) não precise reabrir a regra.';
COMMENT ON COLUMN public.instagram_tracked_links.link_label IS
  'Rótulo do botão que abre o link. Mesma razão de link_message.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. COLETA DE DADO NA DM
--
-- "uma DM solicitando o endereço de e-mail" é a primeira automação de regra que
-- espera uma RESPOSTA. Até aqui, regra era um tiro só: chegou o evento, executou
-- as ações, acabou. Guardar essa espera numa tabela é o que permite a próxima
-- mensagem da pessoa ser interpretada como "isto é o e-mail dela" e não como um
-- evento novo que dispara tudo de novo.
--
-- Por que não reusar instagram_flow_executions: a espera do fluxo carrega um
-- grafo, um nó atual e variáveis. Aqui é uma pergunta só, com resposta validada
-- e um link para entregar depois — modelar como execução de fluxo custaria mais
-- do que a tabela inteira.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.instagram_pending_collections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  rule_id UUID NOT NULL REFERENCES public.instagram_automation_rules(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.instagram_contacts(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.instagram_conversations(id) ON DELETE CASCADE,

  -- Hoje só 'email'. O CHECK existe para que um valor digitado errado no futuro
  -- falhe na escrita, e não silenciosamente na hora de validar a resposta.
  field TEXT NOT NULL DEFAULT 'email' CHECK (field IN ('email')),

  -- O que entregar quando a resposta for válida.
  tracked_link_id UUID REFERENCES public.instagram_tracked_links(id) ON DELETE SET NULL,

  -- { invalid_text, success_text }
  collect_config JSONB NOT NULL DEFAULT '{}',

  status TEXT NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'collected', 'abandoned')),

  -- Quantas respostas inválidas já vieram. Sem teto, alguém que responde
  -- "ok" três vezes recebe "não parece um e-mail" para sempre — e cada uma
  -- dessas respostas gasta cota de envio da conta.
  attempts INTEGER NOT NULL DEFAULT 0,
  collected_value TEXT,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Consulta do webhook, a cada mensagem recebida: "esta conversa está esperando
-- um dado?". Precisa ser barata — roda antes de qualquer gatilho.
CREATE INDEX IF NOT EXISTS idx_instagram_pending_collections_waiting
  ON public.instagram_pending_collections(conversation_id)
  WHERE status = 'waiting';

-- Uma pergunta viva por conversa. Duas automações de coleta disparando quase
-- juntas deixariam duas esperas abertas, e a mesma resposta seria consumida
-- pelas duas — a pessoa receberia o link em duplicata. O índice parcial faz o
-- banco recusar a segunda, pelo mesmo motivo registrado em
-- idx_instagram_flow_executions_one_live: a checagem no código não basta,
-- porque dois webhooks concorrentes leem "não tem nenhuma" ao mesmo tempo.
CREATE UNIQUE INDEX IF NOT EXISTS idx_instagram_pending_collections_one_live
  ON public.instagram_pending_collections(conversation_id)
  WHERE status = 'waiting';

ALTER TABLE public.instagram_pending_collections ENABLE ROW LEVEL SECURITY;

-- Escrita é só do motor (service role); a organização lê para acompanhar quem
-- ficou pelo caminho sem responder.
DROP POLICY IF EXISTS "Users can view their org Instagram pending collections"
  ON public.instagram_pending_collections;
CREATE POLICY "Users can view their org Instagram pending collections"
  ON public.instagram_pending_collections FOR SELECT
  USING (organization_id = public.get_user_org_id(auth.uid()));

COMMENT ON TABLE public.instagram_pending_collections IS
  'Automação de regra que fez uma pergunta e espera a resposta (hoje: e-mail). A próxima mensagem do contato é lida como resposta em vez de disparar gatilhos novos.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. ESCOPO "PRÓXIMA PUBLICAÇÃO" E "QUALQUER PALAVRA"
--
-- Os dois vivem em trigger_config (JSONB), então não há DDL — o que há é o
-- contrato, registrado aqui porque ele é lido em três lugares (webhook, tela e
-- o vinculador abaixo) e não estava escrito em nenhum.
-- ═══════════════════════════════════════════════════════════════════════════
COMMENT ON COLUMN public.instagram_automation_rules.trigger_config IS
$doc$Configuração do gatilho.

  keywords      TEXT[]  palavras que o texto precisa conter
  match_type    'any'|'all'
  keyword_mode  'specific'|'any'  — 'any' dispensa palavra-chave (comentário).
                Ausente = 'specific', que é como toda regra criada antes do modo
                guiado se comporta: sem palavra-chave, nunca dispara.
  scope         'all_posts'|'specific_media'|'next_post'
  media_ids     TEXT[]  posts em que vale. Em next_post começa vazio e é
                preenchido pelo vinculador com o próximo post publicado.
  next_post_bound_at  quando o vínculo aconteceu (só em next_post).
$doc$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. VINCULADOR DA "PRÓXIMA PUBLICAÇÃO"
--
-- "Vale no próximo post" não pode ser decidido na hora do comentário: o
-- webhook recebe o media_id, não a data de publicação, e buscá-la na Meta a
-- cada comentário custaria uma chamada por comentário num post viral.
--
-- Em vez disso, um cron pergunta de tempos em tempos "saiu post novo?" e grava
-- o vínculo na regra. Roda a cada 5 minutos: publicar e receber comentário no
-- mesmo minuto é raro, e uma chamada por minuto por conta seria desperdício
-- para um evento que acontece algumas vezes por semana.
--
-- A função só faz trabalho quando existe regra esperando vínculo — sem nenhuma,
-- ela responde sem falar com a Meta.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'instagram-bind-next-post',
      '*/5 * * * *',
      $cron$
        SELECT net.http_post(
          url := 'https://zaobtetbjpuzibjymhzw.supabase.co/functions/v1/instagram-bind-next-post',
          headers := '{"Content-Type": "application/json"}'::jsonb,
          body := '{}'::jsonb
        );
      $cron$
    );
  END IF;
END $$;
