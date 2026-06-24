-- Mark all 4 remaining items as done
UPDATE governance_checks 
SET status = 'done', 
    notes = 'Rate limiting implementado via in-memory store com janela de 60s e máximo de 60 req/min para admin e 300 req/min para webhooks. Implementado em admin-governance e zapi-webhook.',
    updated_at = now()
WHERE name = 'Rate limiting implementado' AND status = 'pending';

UPDATE governance_checks 
SET status = 'done', 
    notes = 'Validação de token de webhook implementada no zapi-webhook. Verifica x-webhook-token ou x-api-key contra ZAPI_CLIENT_TOKEN configurado nos secrets.',
    updated_at = now()
WHERE name = 'Validação de webhook signatures' AND status = 'pending';

UPDATE governance_checks 
SET status = 'done', 
    notes = 'Proteção implementada: enforceRowLimit() limita queries a 500 rows, MAX_RESPONSE_SIZE de 5MB, rate limiting previne scraping em massa.',
    updated_at = now()
WHERE name = 'Proteção contra exfiltração de dados' AND status = 'pending';

UPDATE governance_checks 
SET status = 'done', 
    notes = 'Documentação das APIs internas registrada na tabela governance_prompts como referência técnica. Inclui todas as Edge Functions com endpoints, métodos e autenticação.',
    updated_at = now()
WHERE name = 'Documentação de APIs internas' AND status = 'pending';

-- Insert API documentation as governance prompt
INSERT INTO governance_prompts (name, category, criticality, status, description, content, is_generic)
VALUES (
  'Documentação de APIs Internas',
  'help',
  'medium',
  'documented',
  'Referência técnica de todas as Edge Functions do sistema.',
  '## Edge Functions - Referência Técnica

### Autenticação & Usuários
- **create-user** (POST) - Cria usuário na organização. Auth: JWT admin/owner.
- **delete-user** (POST) - Remove usuário. Auth: JWT admin/owner.

### WhatsApp (ZAPI)
- **zapi-webhook** (POST) - Recebe eventos do UAZAPI (mensagens, status, conexão). Auth: Token webhook. Rate limit: 300/min.
- **zapi-send-message** (POST) - Envia mensagem WhatsApp. Auth: JWT. Body: {conversationId, content, type}.
- **zapi-sync-chats** (POST) - Sincroniza chats da instância. Auth: Service Role.
- **zapi-sync-messages** (POST) - Sincroniza mensagens. Auth: Service Role.
- **zapi-check-status** (POST) - Verifica status da instância. Auth: JWT.
- **zapi-create-instance** (POST) - Cria nova instância WhatsApp. Auth: JWT admin.
- **zapi-get-qrcode** (GET) - Retorna QR code para conexão. Auth: JWT.
- **zapi-configure-webhook** (POST) - Configura URL do webhook na instância. Auth: JWT admin.
- **zapi-save-credentials** (POST) - Salva credenciais da instância. Auth: JWT admin.
- **zapi-disconnect** (POST) - Desconecta instância. Auth: JWT admin.
- **zapi-contact-profile** (POST) - Busca perfil do contato no WhatsApp. Auth: JWT.
- **zapi-message-actions** (POST) - Ações em mensagens (reagir, deletar). Auth: JWT.
- **zapi-send-presence** (POST) - Envia presença (digitando, gravando). Auth: JWT.
- **zapi-load-older-messages** (POST) - Carrega mensagens anteriores. Auth: JWT.
- **zapi-call** (POST) - Proxy genérico para UAZAPI. Auth: JWT.
- **zapi-crm** (POST) - Operações CRM via UAZAPI. Auth: JWT.

### Flows & Automação
- **flow-execute** (POST) - Executa um flow. Auth: Service Role / JWT.
- **flow-to-prompt** (POST) - Converte flow em prompt textual. Auth: JWT.
- **prompt-to-flow** (POST) - Gera flow a partir de prompt. Auth: JWT.
- **process-flow-timeouts** (POST) - Processa timeouts de flows. Auth: Cron/Service Role.
- **generate-remarketing-messages** (POST) - Gera mensagens de remarketing. Auth: Service Role.
- **process-scheduled-messages** (POST) - Processa mensagens agendadas. Auth: Cron/Service Role.
- **trigger-campaign-on-tag** (POST) - Dispara campanha ao adicionar tag. Auth: DB Trigger.

### IA & Agentes
- **agent-orchestrator** (POST) - Orquestra agentes de IA. Auth: Service Role.
- **generate-agent-prompt** (POST) - Gera prompt do agente. Auth: JWT.
- **train-ai-agent** (POST) - Treina agente com regras. Auth: JWT admin.
- **analyze-conversation** (POST) - Analisa conversa com IA. Auth: JWT.
- **transcribe-audio** (POST) - Transcreve áudio. Auth: JWT.
- **transcribe-media** (POST) - Transcreve mídia. Auth: JWT.

### Documentos
- **process-document-template** (POST) - Processa template de documento. Auth: JWT.
- **generate-document-pdf** (POST) - Gera PDF do documento. Auth: JWT/Token.
- **public-template** (GET) - Template público. Auth: Token público.
- **public-pack-form** (POST) - Formulário público de pack. Auth: Token público.
- **public-form-submit** (POST) - Submit de formulário público. Auth: Nenhum.
- **unify-pack-fields** (POST) - Unifica campos de packs. Auth: JWT.
- **capture-signature** (POST) - Captura assinatura. Auth: Token público.

### Google Integrations
- **google-calendar-auth** (POST) - Auth OAuth Google Calendar. Auth: JWT.
- **google-calendar-availability** (GET) - Disponibilidade. Auth: JWT/Público.
- **google-calendar-book** (POST) - Agendar reunião. Auth: JWT/Público.
- **google-drive-auth** (POST) - Auth OAuth Google Drive. Auth: JWT.
- **google-drive-backup** (POST) - Backup para Drive. Auth: JWT admin.
- **google-drive-restore** (POST) - Restaurar do Drive. Auth: JWT admin.

### Admin
- **admin-dashboard** (GET/POST) - Dashboard administrativo. Auth: JWT platform_admin. Rate limit: 60/min.
- **admin-governance** (GET/POST) - Governança técnica. Auth: JWT platform_admin. Rate limit: 60/min.

### Widgets
- **widget-submit** (POST) - Submit de widget externo. Auth: Nenhum (público).

### Notificações
- **stage-notification** (POST) - Notifica mudança de estágio. Auth: Service Role.

### Segurança Implementada
- Rate Limiting: admin-governance (60/min), zapi-webhook (300/min)
- Webhook Auth: Token validation via x-webhook-token header
- Row Limits: MAX_EXPORT_ROWS = 500 por query
- Response Size: MAX_RESPONSE_SIZE = 5MB
- Input Validation: Zod schemas em admin-governance
- RLS: Todas as tabelas com Row Level Security ativo',
  false
) ON CONFLICT DO NOTHING;;
