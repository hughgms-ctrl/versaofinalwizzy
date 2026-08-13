-- Painel do disparo em massa: acompanhar o progresso ao vivo.
--
-- O dialog de detalhes do agendamento (ScheduledMessageDetailDialog) assina
-- scheduled_message_contacts filtrando por scheduled_message_id para mostrar
-- enviados/faltam/não entregues conforme o motor processa. Sem a tabela na
-- publication, o frontend depende só do polling de 15s.
--
-- Idempotente: a publication reclama se a tabela já estiver adicionada.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.scheduled_message_contacts;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;  -- publication inexistente: nada a fazer
END $$;

-- REPLICA IDENTITY FULL para o payload do realtime trazer as colunas antigas
-- também (o frontend só invalida a query, mas o filtro por scheduled_message_id
-- depende da coluna estar presente no evento de UPDATE).
ALTER TABLE public.scheduled_message_contacts REPLICA IDENTITY FULL;
