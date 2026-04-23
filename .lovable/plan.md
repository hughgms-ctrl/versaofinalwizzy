

## Melhorar status: adicionar "Encerrada" + clarificar "Não lidas"

### Conceito final (3 status + 1 filtro independente)

**Status do atendimento** (derivado/manual):

| Status | Cor | Quando |
|---|---|---|
| **Aberto** | 🔴 Vermelho | Última msg do cliente, sem resposta. Precisa atenção. |
| **Em andamento** | 🟢 Verde | Você (humano/IA) respondeu por último. Bola com o cliente. |
| **Encerrada** | ⚪ Cinza claro | Atendimento finalizado (manual ou auto por inatividade). Sai da caixa principal mas o histórico fica acessível. Se cliente mandar nova msg, **reabre automaticamente** como "Aberto". |
| **Arquivada** | ⚫ Cinza escuro | Conversa removida da caixa por decisão manual (spam, engano). Diferente de encerrada — não reabre sozinha. |

**Filtro independente:**
- **Não lidas** = `unread_count > 0`. Mostra um **contador no badge** ("3 não lidas") e pode ser ativado em cima de qualquer status. Não é um status, é uma lente.

### Como funciona "Encerrada" na prática

1. **Encerramento manual**: botão "Encerrar atendimento" no menu da conversa. Útil quando o cliente se despede.
2. **Encerramento automático** (configurável por organização):
   - Padrão: 24 horas sem nova mensagem após resposta nossa → auto-encerra.
   - Configurável em Settings: "Encerrar atendimento após X horas de inatividade" (ou desligar).
3. **Reabertura automática**: se o cliente mandar nova mensagem em conversa encerrada, ela volta para "Aberto" automaticamente. O operador é notificado normalmente.
4. **Não some do banco**: filtro padrão da caixa esconde encerradas, mas há toggle "Mostrar encerradas" e elas aparecem na busca.

### Diferença Encerrada × Arquivada

| | Encerrada | Arquivada |
|---|---|---|
| Por quê? | Atendimento concluído | Conversa indesejada (spam, teste) |
| Reabre se cliente escrever? | ✅ Sim, vira Aberta | ❌ Não, fica arquivada |
| Aparece em métricas? | ✅ Sim ("Atendimentos encerrados hoje") | ❌ Não |
| Frequência esperada | Maioria das conversas vai pra cá | Raro |

### Mudanças técnicas

**1. Banco** (`conversations`)
- Adicionar campo `closed_at timestamptz` (NULL = não encerrada). Não criar coluna nova de status — o `status` existente vira `'closed'` quando encerrada manualmente, e mantemos `'archived'` para arquivada.
- Trigger: ao inserir nova mensagem `inbound` em conversa com `status='closed'`, voltar para `status='open'` e zerar `closed_at`.

**2. Helper** (`src/lib/conversationStatus.ts`)
- Novo status derivado `'encerrada'` quando `status='closed'` ou `closed_at < now() - autocloseHours`.
- Ordem de prioridade: `archived > closed > derivado(inbound/outbound)`.

**3. UI**
- **Lista (`ConversationList.tsx`)**: badge cinza "Encerrada" + esconde da view padrão.
- **Filtros (`ConversationFilters.tsx`)**: submenu Status agora tem **Todos / Aberto / Em andamento / Encerradas / Arquivadas**. Adicionar checkbox separado **"Apenas não lidas"** que combina com qualquer status.
- **Menu de ação**: adicionar **"Encerrar atendimento"** (e "Reabrir" quando já estiver encerrada). Manter "Arquivar" separado.
- **Cabeçalho da conversa**: badge derivado + botão rápido "Encerrar" quando estiver "Em andamento".

**4. Auto-encerramento**
- Cron job (Edge Function `auto-close-conversations`) roda a cada hora.
- Lê config da org (`organizations.auto_close_hours`, default `24`, `0 = desligado`).
- Marca `status='closed'`, `closed_at=now()` para conversas onde:
  - `status='open'`
  - última msg é `outbound`
  - última msg foi há mais de `auto_close_hours`.
- Cria log/atividade discreta para o operador ver no histórico.

**5. Configuração** (`SettingsPage.tsx` → seção "Atendimento")
- Slider/select: "Encerrar conversas automaticamente após **[24h ▾]** sem resposta do cliente" (Off / 6h / 12h / 24h / 48h / 72h / 7 dias).

**6. Dashboard**
- Métrica nova: **"Atendimentos encerrados hoje"** (via `closed_at::date = today`).
- Gráfico: Aberto / Em andamento / Encerradas / Arquivadas.
- Tempo médio de atendimento = `closed_at - created_at` (ou primeiro outbound → closed_at).

### O que NÃO muda
- "Não lidas" continua sendo um **filtro/contador** independente, baseado em `unread_count`. Não vira status.
- Service mode (Fila/Humano/IA) continua independente do status.
- Pipeline continua sendo a ferramenta para "estágio comercial" (lead → proposta → fechado), separado do status do atendimento.

### Arquivos a modificar/criar
- **Migração SQL**: adicionar `closed_at` em `conversations`, `auto_close_hours` em `organizations`, trigger de reabertura ao receber inbound.
- `src/lib/conversationStatus.ts` — incluir `'encerrada'`.
- `src/components/conversations/ConversationList.tsx` — badge encerrada + esconder da view padrão.
- `src/components/shared/ConversationFilters.tsx` — opções Encerrada/Arquivada separadas + checkbox "Apenas não lidas".
- `src/components/conversations/ConversationActionsMenu.tsx` — ações "Encerrar" / "Reabrir".
- `src/components/conversations/ConversationCardActions.tsx` — idem.
- `src/components/conversations/ConversationDetail.tsx` — botão rápido "Encerrar" no header + badge.
- `src/components/conversations/ContactProfilePanel.tsx` — badge derivado.
- `src/pages/ConversationsPage.tsx` — lógica de filtro com encerradas + filtro "não lidas".
- `src/pages/SettingsPage.tsx` (ou `WorkspacesSettings.tsx`) — config de horas para auto-encerramento.
- `src/hooks/useDashboardData.ts` — métricas baseadas em `closed_at`.
- `src/components/dashboard/ResolutionChart.tsx` — incluir "Encerradas".
- `supabase/functions/auto-close-conversations/index.ts` (novo) — cron de auto-encerramento.
- `supabase/config.toml` — agendar cron de hora em hora.

