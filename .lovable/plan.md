

# Agenda Multi-Usuário com Painel de Calendário

## Resumo

Evoluir o sistema de agenda de "1 conta por organização" para "múltiplas contas Google por membro da equipe", com painel visual de calendário, seleção de agenda por funcionário, e geração automática de link do Google Meet.

## Mudanças no Banco de Dados

**Alterar `calendar_configs`**: Adicionar coluna `user_id` (uuid, referencia profiles.user_id) e `display_name` (text). Remover constraint unique de `organization_id` e criar unique em `(organization_id, user_id)`. Isso permite múltiplas contas por org.

**Alterar `calendar_bookings`**: Adicionar coluna `assigned_user_id` (uuid) para saber de qual membro é a agenda, e `meet_link` (text) para o link do Google Meet.

## Arquitetura Multi-Usuário

```text
Org "Empresa X"
├── João (owner)    → Google: joao@gmail.com   → calendar_configs row
├── Maria (admin)   → Google: maria@gmail.com  → calendar_configs row
└── Pedro (agent)   → Google: pedro@gmail.com  → calendar_configs row

Agendamento via IA:
  1. Agente verifica qual(is) agenda(s) usar (config do fluxo)
  2. Consulta disponibilidade de cada uma
  3. Agenda no horário mais próximo disponível
  4. Cria evento no Google Calendar com Meet link
```

## Componentes da CalendarTab

A aba Agenda será dividida em sub-abas internas:

1. **Contas Conectadas** — Lista de membros com agenda conectada. Cada membro conecta sua própria conta clicando "Entrar com Google". Owner/admin vê todas as contas.
2. **Calendário** — Visualização mensal/semanal/diária dos agendamentos. Filtro por membro. Mostra resumo interno ao clicar.
3. **Disponibilidade** — Regras de dias/horários por membro. Duração padrão da reunião.
4. **Link Público** — Gerar slug único por org. Ao acessar, cliente escolhe tipo de reunião e horário disponível.

## Edge Function `google-calendar-auth`

Atualizar para salvar `user_id` junto com `organization_id` no state do OAuth. Assim cada membro conecta sua própria conta.

## Edge Function `google-calendar-book` (nova)

- Recebe: `organization_id`, `assigned_user_id` (ou "random"), `starts_at`, `client_name`, `client_phone`, `internal_summary`
- Busca tokens do membro escolhido
- Cria evento no Google Calendar com `conferenceData` (Meet link automático)
- Salva booking no Supabase com `meet_link`

## Edge Function `google-calendar-availability` (nova)

- Recebe: `organization_id`, `user_id` (ou array de user_ids), `date`
- Busca eventos do dia via Google Calendar API
- Cruza com `availability_rules` do membro
- Retorna slots livres

## Página Pública `/agendar/:slug`

- Nova página `PublicBookingPage.tsx`
- Mostra calendário com dias disponíveis (consulta availability de todos os membros configurados)
- Cliente preenche nome, telefone, email
- Ao confirmar: chama `google-calendar-book` com atribuição automática (random ou próximo disponível)

## Arquivos

| Arquivo | Ação |
|---------|------|
| Migration SQL | Alterar `calendar_configs` (add `user_id`, `display_name`, unique constraint) e `calendar_bookings` (add `assigned_user_id`, `meet_link`) |
| `src/components/integrations/CalendarTab.tsx` | Reescrever com sub-abas: Contas, Calendário, Disponibilidade, Link |
| `src/hooks/useCalendarConfig.ts` | Adaptar para multi-user (listar todas configs da org) |
| `supabase/functions/google-calendar-auth/index.ts` | Incluir `user_id` no state e salvar por user |
| **NOVO** `supabase/functions/google-calendar-book/index.ts` | Criar evento + Meet link |
| **NOVO** `supabase/functions/google-calendar-availability/index.ts` | Consultar slots livres |
| **NOVO** `src/pages/PublicBookingPage.tsx` | Página pública de agendamento |
| `src/App.tsx` | Rota `/agendar/:slug` |
| `supabase/config.toml` | Registrar novas functions |

