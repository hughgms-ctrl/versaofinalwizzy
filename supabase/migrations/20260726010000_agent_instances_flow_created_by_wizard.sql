-- Marca se o FLUXO de uma orquestração foi criado pela própria orquestração
-- (do zero, ou a partir de um template) -- nesse caso o fluxo é de uso único
-- e vale perguntar se apaga junto quando a orquestração é excluída. Fluxos
-- IMPORTADOS (ImportFlowDialog, "puxar um fluxo que já existe") pré-existiam
-- e podem estar em uso em outro lugar -- nunca são apagados automaticamente
-- (ver conversa com o usuário: regra de exclusão de orquestração).
ALTER TABLE agent_instances
  ADD COLUMN IF NOT EXISTS flow_created_by_wizard boolean NOT NULL DEFAULT false;
