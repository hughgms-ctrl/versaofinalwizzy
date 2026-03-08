

# Etapa 1: Reestruturar Integrações em Abas + Preparar Google Drive e Agenda

## Resumo

Reorganizar a página de Integrações em 4 abas (IA, Agenda, Drive, WhatsApp) e começar a implementar a infraestrutura do Google Drive como camada de backup complementar ao Supabase/UAZAPI.

O Drive **não substitui** o backup atual. Ele funciona como uma camada extra de segurança: ao desconectar/reconectar o WhatsApp, além de puxar dados do UAZAPI (dados recentes), o sistema restaura dados históricos do Drive (conversas, tags, notas, pipeline, mídias).

## Arquitetura do Drive Backup

```text
Dados atuais:  UAZAPI ──→ Supabase (fonte primária)
Backup extra:  Supabase ──→ Google Drive (backup periódico)

Ao reconectar:
  1. UAZAPI sync (dados recentes)
  2. Drive restore (dados históricos que podem ter se perdido)
  3. Merge inteligente (sem duplicar)
```

## O que será implementado agora

### 1. Reestruturar IntegrationsPage em abas
- Extrair conteúdo AI atual para `src/components/integrations/AITab.tsx`
- Criar `src/components/integrations/CalendarTab.tsx` (placeholder inicial)
- Criar `src/components/integrations/DriveTab.tsx` (config OAuth + backup)
- Criar `src/components/integrations/WhatsAppTab.tsx` (placeholder, link para Settings)
- Atualizar `src/pages/IntegrationsPage.tsx` com Tabs (IA, Agenda, Drive, WhatsApp)

### 2. Tabelas para Drive
- **`drive_configs`**: `organization_id`, `google_refresh_token`, `google_access_token`, `google_email`, `folder_id`, `backup_frequency` (daily/weekly/manual), `last_backup_at`, `backup_includes` (jsonb: conversations, tags, notes, pipeline, files), `is_connected`
- **`drive_backup_logs`**: `organization_id`, `started_at`, `completed_at`, `status` (running/completed/failed), `file_count`, `data_size_bytes`, `error_message`

### 3. Tabelas para Calendar
- **`calendar_configs`**: `organization_id`, `google_refresh_token`, `google_access_token`, `google_email`, `calendar_id`, `availability_rules` (jsonb), `meeting_duration_minutes`, `booking_slug`, `is_connected`
- **`calendar_bookings`**: `organization_id`, `contact_id`, `conversation_id`, `google_event_id`, `starts_at`, `ends_at`, `client_name`, `client_phone`, `client_email`, `internal_summary`, `status`

### 4. Edge Functions (Drive)
- **`google-drive-auth`**: OAuth2 code exchange + refresh token storage
- **`google-drive-backup`**: Exporta conversas, tags, notas, pipeline, mídias como JSON + arquivos para pasta do Drive
- **`google-drive-restore`**: Lista backups no Drive, importa e faz merge sem duplicar

### 5. Edge Functions (Calendar - placeholder)
- **`google-calendar-auth`**: OAuth2 flow

### 6. UI do DriveTab
- Botão "Conectar Google Drive" (OAuth)
- Status de conexão (email conectado)
- Seletor de frequência de backup (diário/semanal/manual)
- Checkboxes do que incluir no backup
- Botão "Fazer backup agora"
- Histórico de backups (últimos 10)
- Botão "Restaurar último backup"

## Pré-requisitos de Secrets
- **`GOOGLE_CLIENT_ID`** e **`GOOGLE_CLIENT_SECRET`**: Precisarão ser configurados pelo usuário via Google Cloud Console

## Arquivos

| Arquivo | Ação |
|---------|------|
| `src/pages/IntegrationsPage.tsx` | Refatorar com Tabs |
| `src/components/integrations/AITab.tsx` | NOVO - conteúdo AI extraído |
| `src/components/integrations/DriveTab.tsx` | NOVO - config + backup |
| `src/components/integrations/CalendarTab.tsx` | NOVO - placeholder |
| `src/components/integrations/WhatsAppTab.tsx` | NOVO - placeholder |
| `src/hooks/useDriveConfig.ts` | NOVO - CRUD drive_configs |
| `src/hooks/useCalendarConfig.ts` | NOVO - CRUD calendar_configs |
| Migration | 4 tabelas + RLS |
| `supabase/functions/google-drive-auth/index.ts` | NOVO |
| `supabase/functions/google-drive-backup/index.ts` | NOVO |
| `supabase/functions/google-drive-restore/index.ts` | NOVO |
| `supabase/functions/google-calendar-auth/index.ts` | NOVO |
| `supabase/config.toml` | Registrar novas functions |

