-- campaigns.flow_id nunca ganhou ON DELETE nas migrations rastreadas (tabela
-- campaigns foi criada fora desse histórico) -- ficou implicitamente RESTRICT,
-- bloqueando silenciosamente a exclusão de um fluxo que ainda tem campanha
-- vinculada. Todas as outras FKs que apontam pra flows(id) já são CASCADE ou
-- SET NULL; esta alinha campaigns com o mesmo padrão -- uma campanha sem
-- fluxo não faz sentido de qualquer forma, então some junto quando o fluxo é
-- apagado (ver conversa com o usuário: "se apagar o fluxo, a campanha
-- também deve ser possível apagar separadamente").
ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_flow_id_fkey;
ALTER TABLE public.campaigns
  ADD CONSTRAINT campaigns_flow_id_fkey
  FOREIGN KEY (flow_id) REFERENCES public.flows(id) ON DELETE CASCADE;
