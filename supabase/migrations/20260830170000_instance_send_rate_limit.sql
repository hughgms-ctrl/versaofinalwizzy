-- Semana 3 (docs/REVISAO_ESCALA_LANCAMENTO.md) — cadencia por NUMERO.
--
-- Nada limita o ritmo de um numero quando chat, fluxo, notificacao e disparo
-- agendado resolvem falar ao mesmo tempo: cada caminho tem (no maximo) o proprio
-- espacamento, e todos saem pela mesma instancia. Quatro subsistemas mandando
-- juntos e exatamente o padrao que faz provedor recusar e WhatsApp banir numero.
--
-- Este e um pedaco de estado compartilhado que precisa ser atomico entre
-- isolates diferentes — ou seja, tem que morar no banco, nao na memoria da edge
-- function.
--
-- A funcao NAO enfileira nem descarta: ela responde "pode agora?". Quem chama
-- (sendWhatsAppMessage) espera um pouco e tenta de novo; se depois da espera
-- ainda nao houver vaga, manda assim mesmo e registra no log — perder mensagem
-- seria pior que um pico de cadencia.
--
-- APLICAR A MAO no SQL Editor (nunca supabase db push).

CREATE TABLE IF NOT EXISTS public.instance_send_slots (
  instance_id uuid PRIMARY KEY REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  used integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Sem policy: RLS ligada e nenhuma regra = so a service role enxerga.
ALTER TABLE public.instance_send_slots ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.try_acquire_send_slot(
  _instance_id uuid,
  _max_per_window integer DEFAULT 4,
  _window_seconds integer DEFAULT 1
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_used integer;
  v_started timestamptz;
BEGIN
  -- Sem instancia resolvida nao ha o que limitar (o envio vai falhar adiante
  -- por outro motivo); nunca segurar por causa disso.
  IF _instance_id IS NULL THEN
    RETURN true;
  END IF;

  INSERT INTO public.instance_send_slots (instance_id, window_started_at, used)
  VALUES (_instance_id, now(), 0)
  ON CONFLICT (instance_id) DO NOTHING;

  -- O FOR UPDATE e o ponto do exercicio: dois envios simultaneos pelo mesmo
  -- numero se enfileiram aqui por alguns milissegundos em vez de sairem juntos.
  SELECT window_started_at, used
    INTO v_started, v_used
    FROM public.instance_send_slots
   WHERE instance_id = _instance_id
     FOR UPDATE;

  IF v_started IS NULL THEN
    RETURN true;  -- instancia sumiu no meio (delete concorrente): nao segurar
  END IF;

  IF v_started < now() - make_interval(secs => _window_seconds) THEN
    UPDATE public.instance_send_slots
       SET window_started_at = now(), used = 1, updated_at = now()
     WHERE instance_id = _instance_id;
    RETURN true;
  END IF;

  IF v_used >= _max_per_window THEN
    RETURN false;
  END IF;

  UPDATE public.instance_send_slots
     SET used = v_used + 1, updated_at = now()
   WHERE instance_id = _instance_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.try_acquire_send_slot(uuid, integer, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.try_acquire_send_slot(uuid, integer, integer) TO service_role;

-- Conferencia depois de aplicar (deve voltar true nas primeiras chamadas e
-- false ao estourar o teto na mesma janela):
--
--   SELECT public.try_acquire_send_slot(id, 2, 1) FROM public.whatsapp_instances LIMIT 1;
