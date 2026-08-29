-- B9 (docs/REVISAO_ESCALA_LANCAMENTO.md): lock por conversa para o
-- agent-orchestrator.
--
-- O debounce do zapi-webhook protege só a janela de 8 s. Durante a execução
-- (5–40 s+) uma nova mensagem abria um segundo orquestrador na MESMA conversa:
-- duas respostas ao contato e o estado (orchestration_state, handoff) de um
-- atropelando o do outro. O lock vive em conversations.metadata.ai_run_lock e
-- é adquirido/solto com UPDATE condicional — atômico, sem tabela nova.
--
-- O orquestrador funciona sem esta migration (sem lock, como antes); só passa
-- a serializar quando as funções existirem.
--
-- APLICAR À MÃO no SQL Editor (nunca supabase db push).

CREATE OR REPLACE FUNCTION public.try_acquire_ai_run_lock(_conversation uuid, _token text, _ttl_seconds integer DEFAULT 90)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH acquired AS (
    UPDATE public.conversations
    SET metadata = COALESCE(metadata, '{}'::jsonb)
                   || jsonb_build_object('ai_run_lock', jsonb_build_object('token', _token, 'at', now()))
    WHERE id = _conversation
      AND (
        metadata->'ai_run_lock' IS NULL
        OR (metadata->'ai_run_lock'->>'at') IS NULL
        OR (metadata->'ai_run_lock'->>'at')::timestamptz < now() - make_interval(secs => _ttl_seconds)
      )
    RETURNING id
  )
  SELECT EXISTS (SELECT 1 FROM acquired);
$$;

-- Solta só se o token for o nosso (um lock expirado e retomado por outro run
-- não pode ser derrubado pelo dono antigo). Devolve o metadata resultante para
-- o chamador ver se ficou mensagem pendente (ai_rerun_pending) durante o run.
CREATE OR REPLACE FUNCTION public.release_ai_run_lock(_conversation uuid, _token text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.conversations
  SET metadata = COALESCE(metadata, '{}'::jsonb) - 'ai_run_lock'
  WHERE id = _conversation
    AND metadata->'ai_run_lock'->>'token' = _token
  RETURNING metadata;
$$;

REVOKE ALL ON FUNCTION public.try_acquire_ai_run_lock(uuid, text, integer) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_ai_run_lock(uuid, text) FROM public, anon, authenticated;
