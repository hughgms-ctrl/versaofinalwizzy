-- Grupos de WhatsApp pertencem ao NÚMERO que os sincronizou, não à organização.
--
-- A UNIQUE antiga (organization_id, group_jid) fazia com que o mesmo grupo só
-- pudesse existir para UM número da organização: quando um segundo número
-- sincronizava, o upsert roubava a linha do primeiro. Por isso o sync antigo
-- apagava tudo que fosse de outra instância — e o resultado prático era a lista
-- de grupos de um número aparecendo (ou sumindo) no workspace de outro,
-- inclusive de números que nem estão mais conectados.
--
-- A chave real é (organização, número, grupo).

-- 1) Limpeza: linhas órfãs (o número que as sincronizou foi excluído; a FK é
--    ON DELETE SET NULL, então elas ficaram sem dono e apareciam para todos).
DELETE FROM public.whatsapp_groups
WHERE whatsapp_instance_id IS NULL;

-- 2) Nova chave por número. Só criamos depois de dropar a antiga; as linhas
--    existentes já são únicas em (org, group_jid), então nenhuma colide aqui.
ALTER TABLE public.whatsapp_groups
  DROP CONSTRAINT IF EXISTS whatsapp_groups_organization_id_group_jid_key;

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_groups_org_instance_jid_key
  ON public.whatsapp_groups (organization_id, whatsapp_instance_id, group_jid);

-- 3) Índice de leitura: a lista agora filtra sempre pelo número.
CREATE INDEX IF NOT EXISTS idx_whatsapp_groups_instance
  ON public.whatsapp_groups (whatsapp_instance_id);
