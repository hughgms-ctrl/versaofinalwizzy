-- Orquestração passa a poder existir sem agente ainda (o agente entra depois,
-- como um nó ai-handoff montado direto no Flow Builder) -- ver redesenho da
-- criação guiada de orquestração (ApplyTemplateWizard -> CreateOrchestrationDialog).
ALTER TABLE agent_instances ALTER COLUMN ai_agent_id DROP NOT NULL;
