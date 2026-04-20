

# Painel Operacional Jurídico — Versão Completa

Painel dedicado ao time operacional, separado do pipeline comercial. Quando o comercial move um lead para um estágio-chave (ex: "Contrato assinado"), um **Caso** é aberto automaticamente em `/operations` com checklist de tarefas padrão e responsável pré-definido. O caso pode ser **Judicial** (com número de processo, vara, partes) ou **Administrativo** (ex: INSS, INMETRO, processos administrativos internos), com campos adaptáveis ao tipo.

## Como funciona para o usuário

**Comercial:** move o card para "Contrato assinado" no pipeline → cliente continua lá para acompanhamento, e em paralelo um Caso é aberto automaticamente em `/operations`.

**Operacional (`/operations`):** kanban com colunas configuráveis (A fazer, Em andamento, Aguardando cliente, Concluído). Ao abrir um Caso: drawer com abas Resumo, Tarefas, Documentos, Prazos, Timeline e Chat (reutiliza `PipelineChatModal`).

**Admin/Owner:** configura **Templates de Caso** por categoria (Judicial Trabalhista, Administrativo INSS, etc.) com tarefas padrão, dias para vencimento e responsável default por workspace. Configura **Gatilhos** (coluna do pipeline → template).

## Tipos de caso (judicial vs administrativo)

Campo `case_kind` em `cases` com valores:
- `judicial` — exibe campos: número do processo (CNJ), vara/órgão julgador, comarca, partes (autor/réu), tipo de ação (Trabalhista, Cível, Previdenciário, Tributário, Família, Criminal…)
- `administrative` — exibe campos: órgão (INSS, Receita Federal, Detran, Prefeitura, INMETRO…), número do protocolo/benefício, tipo de procedimento (Aposentadoria, Auxílio-doença, Recurso administrativo, Defesa fiscal…), instância

Templates declaram seu `case_kind` e a UI do caso renderiza o formulário/resumo apropriado. Tabela `case_categories` (seed por organização) lista as categorias dentro de cada kind para padronizar relatórios.

## Estrutura visual

```text
/operations
┌─────────────────────────────────────────────────────────────┐
│  Casos | Minhas Tarefas | Calendário de Prazos             │
├─────────────────────────────────────────────────────────────┤
│ [Workspace ▾] [Tipo: Judicial/Administrativo ▾] [Categ ▾]  │
│ [Responsável ▾] [Status ▾] [Prazo ▾]                        │
├──────────┬──────────────┬──────────────┬────────────────────┤
│ A fazer  │ Em andamento │ Aguardando   │ Concluído          │
│          │              │ cliente      │                    │
│ João S.  │ Maria P.     │ Pedro R.     │ Ana L.             │
│ ⚖ Trab.  │ 🏛 INSS Aux. │ ⚖ Cível      │ 🏛 Aposent.        │
│ 3 tarefas│ 1/5 tarefas  │ prazo 2d ⚠   │ ✓                  │
└──────────┴──────────────┴──────────────┴────────────────────┘

Drawer do Caso:
[ Resumo | Tarefas | Documentos | Prazos | Timeline | Chat ]

Resumo (Judicial):           Resumo (Administrativo):
- Nº processo (CNJ)          - Órgão (INSS / RFB / …)
- Vara / Comarca             - Nº protocolo / benefício
- Partes                     - Tipo de procedimento
- Tipo de ação               - Instância (1ª/recurso)
```

## Modelo de dados

- **`case_categories`** — `id, organization_id, kind ('judicial'|'administrative'), name, slug, icon, color`. Seed inicial por organização: judiciais (Trabalhista, Cível, Previdenciário, Tributário, Família, Criminal) e administrativos (INSS, Receita Federal, Detran, Prefeitura, Recurso Administrativo).
- **`case_templates`** — `id, organization_id, workspace_id, name, description, kind ('judicial'|'administrative'), category_id, default_assignee_id, default_status_id`.
- **`case_template_tasks`** — `id, template_id, title, description, days_to_due, order, is_mandatory`.
- **`case_statuses`** — `id, organization_id, workspace_id, name, color, order, is_default, is_closed` (kanban configurável).
- **`case_triggers`** — `id, organization_id, pipeline_id, column_id, template_id, is_active`.
- **`cases`** — `id, organization_id, workspace_id, contact_id, conversation_id, template_id, status_id, assignee_id, kind ('judicial'|'administrative'), category_id, title, priority, opened_at, closed_at, judicial_data jsonb, administrative_data jsonb, metadata jsonb`. Os jsonb evitam colunas vazias quando o tipo não se aplica.
- **`case_tasks`** — `id, case_id, organization_id, title, description, assignee_id, due_date, completed_at, completed_by, order, status ('todo'|'doing'|'done'|'blocked'), created_by`.
- **`case_deadlines`** — `id, case_id, title, due_date, is_fatal, notify_days_before, completed_at`.
- **`case_activity_log`** — `id, case_id, actor_id, action, payload jsonb, created_at`.

RLS padrão: `organization_id = get_user_org_id(auth.uid())`, com filtro adicional por workspace para usuários restritos. Owners/admins enxergam tudo.

## Atribuição programada por workspace

Tabela já coberta por `case_templates.default_assignee_id` (responsável default por template) **e** `workspaces.default_operations_assignee_id` (novo campo: fallback do workspace). Lógica de atribuição ao criar caso: template → workspace default → criador. Pode ser trocada manualmente a qualquer momento.

## Automação

1. **Trigger SQL** em `conversation_pipeline_positions` (AFTER INSERT/UPDATE): se a nova `column_id` casa com `case_triggers` ativo, chama `create_case_from_template(...)` que:
   - Insere `cases` com `kind` e `category_id` herdados do template, jsonb específico vazio para preenchimento posterior.
   - Materializa `case_tasks` a partir de `case_template_tasks` com `due_date = now() + days_to_due * interval '1 day'`.
   - Resolve responsável: template → workspace → criador.
2. **Edge function `case-notifications`** (cron diário 08:00 `America/Sao_Paulo`): varre prazos em < 72h, gera `notifications` e opcionalmente envia WhatsApp ao responsável.
3. **Reaproveitamento**: anexos via bucket `contact-files`; chat via `PipelineChatModal`; notificações via `NotificationProvider`.

## Navegação e permissões

- Sidebar: novo item **"Operacional"** (ícone `Briefcase`), módulo `operations`, entre Pipeline e Fluxos.
- Nova flag `can_access_operations` em `user_permissions` + `operations` em `allowed_modules` dos planos (Pro+).
- Rotas: `/operations` (kanban), `/operations/tasks`, `/operations/deadlines`, `/operations/templates` (admin).

## Entregáveis

**Migração SQL:** 8 tabelas com RLS, coluna `default_operations_assignee_id` em `workspaces`, função `create_case_from_template()` SECURITY DEFINER, trigger `trg_case_from_pipeline_move`, seed de `case_statuses` e `case_categories` (judicial + administrativo) por organização existente.

**Frontend:**
- `src/pages/OperationsPage.tsx`, `MyTasksPage.tsx`, `DeadlinesCalendarPage.tsx`.
- `src/components/operations/`: `OperationsBoard.tsx`, `CaseCard.tsx`, `CaseDrawer.tsx`, `CaseSummaryJudicial.tsx`, `CaseSummaryAdministrative.tsx`, `CaseTasksList.tsx`, `CaseDeadlinesList.tsx`, `CaseTimeline.tsx`.
- `src/components/settings/CaseTemplatesSettings.tsx` (CRUD de templates, categorias e gatilhos).
- Hooks: `useCases`, `useCaseTasks`, `useCaseTemplates`, `useCaseTriggers`, `useCaseDeadlines`, `useCaseCategories`.

**Edge function:** `case-notifications` (cron de prazos).

## Fora do escopo desta entrega
- Consulta automática a tribunais (DataJud, PJe) ou a sistemas administrativos (Meu INSS) — fase 2.
- Geração automática de petições/recursos via IA — pode plugar no Flow Builder existente depois.
- App mobile nativo — interface será responsiva.

