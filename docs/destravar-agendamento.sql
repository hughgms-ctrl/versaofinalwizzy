-- ============================================================================
-- Destravar o disparo "Msg 17-08" (eabfa5ee-f3b1-4a7a-b53d-e454c98ee0bd)
--
-- ESTADO: status='processing' desde ~14:29 BRT, 37 enviados / 258 pendentes,
-- último envio real 14:11. O lock nunca é liberado: a cada ~3 min o job fica
-- "órfão", o cron o encontra (total:1) e não consegue clamá-lo (processed:0),
-- só carimba updated_at de novo. Resultado: gira para sempre sem enviar.
--
-- SEGURANÇA DO REENVIO: o progresso é por contato (scheduled_message_contacts).
-- Quem está 'sent' NÃO é reenviado — fetchPendingContactPage só pega 'pending'.
-- Como nada está em voo desde 14:11, não há risco de duplicar.
-- ============================================================================

-- PASSO 1 — devolver o job para a fila.
UPDATE public.scheduled_messages
SET status             = 'pending',
    batch_paused_until = NULL,   -- a pausa de 18 min já venceu às 14:29
    batch_sent_count   = 0,
    batch_current_target = NULL,
    error_message      = NULL
WHERE id = 'eabfa5ee-f3b1-4a7a-b53d-e454c98ee0bd'
  AND status = 'processing';

-- PASSO 2 — rodar SEPARADO, ~2 minutos depois, para ver o que o cron fez.
-- (statement própria de propósito: checar na mesma query veria o estado antigo)
--
 SELECT status,
       batch_sent_count,
        batch_current_target,
        to_char(updated_at AT TIME ZONE 'America/Sao_Paulo','HH24:MI:SS') AS updated_brt,
        to_char(batch_paused_until AT TIME ZONE 'America/Sao_Paulo','HH24:MI:SS') AS pausa_brt,
        (SELECT count(*) FROM public.scheduled_message_contacts
         WHERE scheduled_message_id = s.id AND status = 'sent')    AS enviados,
        (SELECT count(*) FROM public.scheduled_message_contacts
          WHERE scheduled_message_id = s.id AND status = 'pending') AS pendentes
 FROM public.scheduled_messages s
 WHERE s.id = 'eabfa5ee-f3b1-4a7a-b53d-e454c98ee0bd';
--
-- LEITURA DO RESULTADO:
  a) enviados > 37 (e batch_current_target preenchido) => era só o lock preso.
     O disparo voltou a andar sozinho; nada mais a fazer agora.
  b) status='processing', enviados=37, batch_current_target ainda NULL
     => o claim está pegando o job e morrendo ANTES do primeiro envio.
     É bug de código (claimScheduled/processContactCampaign), me avise.
