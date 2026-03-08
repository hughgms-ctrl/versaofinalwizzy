

# Plano: Sistema Profissional de Estágios + Histórico + Notificações

## Conceito

As **colunas do Pipeline** passam a ser os **estágios oficiais** do lead (como HubSpot/Pipedrive). Toda movimentação é registrada com histórico, e colunas específicas podem disparar notificações por WhatsApp para membros da equipe.

## 1. Banco de Dados (2 novas tabelas)

### `conversation_stage_history`
Registra cada movimentação de estágio para auditoria e timeline.

```sql
CREATE TABLE conversation_stage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  pipeline_id uuid NOT NULL,
  from_column_id uuid,
  to_column_id uuid NOT NULL,
  changed_by_type text NOT NULL DEFAULT 'manual',  -- 'manual', 'flow', 'ai'
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  organization_id uuid NOT NULL
);
ALTER TABLE conversation_stage_history ENABLE ROW LEVEL SECURITY;
-- Policies...
```

### `stage_notifications`
Configura quais colunas disparam alerta WhatsApp e para quem.

```sql
CREATE TABLE stage_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id uuid NOT NULL,
  column_id uuid NOT NULL,
  notify_user_ids uuid[] NOT NULL DEFAULT '{}',
  message_template text,
  is_active boolean NOT NULL DEFAULT true,
  organization_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE stage_notifications ENABLE ROW LEVEL SECURITY;
-- Policies...
```

## 2. Frontend: Redesenho do Perfil do Contato

### `ConversationAttributesPanel.tsx` — Redesenho completo

Substituir a lista plana de dropdowns por um layout mais profissional:

```text
┌─ ESTÁGIO NO PIPELINE ─────────────────────┐
│  Pipeline: [Vendas v]                      │
│  ● Novo → ● Qualificado → ○ Proposta → ○  │
│  (stepper visual, clicável)                │
└────────────────────────────────────────────┘

┌─ ATRIBUTOS ────────────────────────────────┐
│  👤 Responsável   [João Silva v]           │
│  🏢 Departamento  [Comercial v]            │
│  📍 Origem        [WhatsApp v]             │
│  🤖 Modo          IA  [Intervir]           │
└────────────────────────────────────────────┘
```

- **Pipeline Stage Stepper**: Mostra todas as colunas do pipeline como bolinhas conectadas. A atual fica destacada. Clicar em outra move a conversa.
- **Atributos em grid compacto** com ícones, sem separadores pesados.
- O dropdown "Status" separado é removido (o estágio do pipeline É o status).

### `ContactProfileTabs.tsx` — Nova aba "Histórico"

Adicionar aba com ícone de `History` mostrando timeline de movimentações:

```text
12/03 14:00 — Movido para "Qualificado" (por João)
12/03 10:30 — Tag "Lead Quente" adicionada
11/03 09:00 — Conversa iniciada
```

### `ContactProfilePanel.tsx` — Reorganizar layout

- Subir a seção de **Tags** para logo após os atributos (mais visível).
- Compactar "Informações" (telefone, email) em uma linha.
- Mover "Nota Rápida" para dentro da aba "Notas".

## 3. Hook: `useStageHistory.ts`

- `useStageHistory(conversationId)` — busca histórico da conversa.
- Exportar `useLogStageChange()` — mutation para registrar movimentações.

## 4. Atualizar `useMoveConversation` em `usePipelines.ts`

Após mover a conversa no pipeline:
1. Registrar em `conversation_stage_history` (from → to, quem moveu).
2. Verificar `stage_notifications` — se a coluna destino tem notificação configurada, invocar edge function.

## 5. Edge Function: `stage-notification`

Recebe `{ conversationId, columnId, organizationId }`, busca configs de notificação, e envia mensagem WhatsApp via `zapi-send-message` para cada usuário configurado. Template padrão: "🔔 Lead *{nome}* entrou no estágio *{coluna}*".

## 6. `PipelineSettingsDialog.tsx` — Aba "Notificações"

Adicionar seção dentro do dialog de configuração do pipeline:
- Para cada coluna, toggle "Notificar quando lead entrar".
- Selecionar quais membros da equipe recebem a notificação.
- Campo de template customizável da mensagem.

## Resumo de Arquivos

| Ação | Arquivo |
|------|---------|
| Migration | `conversation_stage_history` + `stage_notifications` |
| Criar | `src/hooks/useStageHistory.ts` |
| Redesenhar | `src/components/conversations/ConversationAttributesPanel.tsx` |
| Editar | `src/components/conversations/ContactProfilePanel.tsx` |
| Editar | `src/components/conversations/ContactProfileTabs.tsx` |
| Editar | `src/hooks/usePipelines.ts` (log + notificação no move) |
| Editar | `src/components/pipeline/PipelineSettingsDialog.tsx` |
| Criar | `supabase/functions/stage-notification/index.ts` |

