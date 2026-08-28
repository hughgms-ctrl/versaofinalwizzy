-- Controle de chamadas por número (instância WhatsApp).
--
-- Até aqui o comportamento era fixo no código: toda instância Evolution era
-- criada com rejectCall=true + msgCall "No momento não atendemos chamadas...",
-- então QUALQUER ligação para um número conectado à Wizzy era cortada — inclusive
-- em números pessoais, onde a ligação é legítima e não tem nada a ver com o app.
--
-- A coluna block_calls já existia (migration 20260130071949) mas nunca foi lida
-- por lugar nenhum: era default false enquanto o comportamento real era rejeitar.
-- Aqui ela passa a ser a fonte de verdade, com default true (mantém o
-- comportamento atual para quem não mexer) e a mensagem vira configurável.

-- Guarda: block_calls veio da migration 20260130071949, mas o repo de migrations
-- ja divergiu do banco vivo antes. Se por acaso a coluna nao existir, cria.
ALTER TABLE public.whatsapp_instances
  ADD COLUMN IF NOT EXISTS block_calls boolean NOT NULL DEFAULT true;

DO $$
DECLARE
  has_msg_col boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'whatsapp_instances'
      AND column_name = 'call_reject_message'
  ) INTO has_msg_col;

  IF NOT has_msg_col THEN
    ALTER TABLE public.whatsapp_instances
      ADD COLUMN call_reject_message text;

    -- Backfill único: alinha as linhas existentes ao que o provedor de fato
    -- estava fazendo (rejeitando). Fica dentro do IF para que reaplicar a
    -- migration não desfaça a escolha de quem já liberou as chamadas.
    UPDATE public.whatsapp_instances SET block_calls = true WHERE block_calls = false;
  END IF;
END $$;

ALTER TABLE public.whatsapp_instances
  ALTER COLUMN block_calls SET DEFAULT true;

COMMENT ON COLUMN public.whatsapp_instances.block_calls IS
  'true = o provedor recusa chamadas recebidas neste número (comportamento padrão). false = a chamada toca normalmente no celular.';
COMMENT ON COLUMN public.whatsapp_instances.call_reject_message IS
  'Mensagem enviada ao recusar uma chamada. NULL usa o texto padrão. Ignorada quando block_calls = false.';
