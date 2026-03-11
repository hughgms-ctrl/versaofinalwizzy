

# Painel Administrativo -- Fase 1: Base de Dados + Acesso

## Resumo

Criar a infraestrutura do painel admin da plataforma: tabelas de planos, uso, chaves de API, governança e audit logs. Adicionar role `platform_admin`, atribuir ao seu usuário, criar a rota `/admin` protegida e o link na sidebar. Os planos de pagamento (Stripe) ficam para depois -- agora criamos apenas a estrutura.

## O que será criado

### Banco de Dados (Migration)

1. **Nova role** `platform_admin` no enum `app_role`
2. **Tabela `platform_plans`** -- estrutura de planos (sem dados de pagamento por enquanto)
   - name, slug, price_monthly, ai_mode (`own_api` | `platform_api`), storage_limit_bytes, max_conversations, max_team_members, max_ai_requests_month, features (jsonb), is_active
3. **Tabela `organization_plans`** -- liga org ao plano
   - organization_id, plan_id, status (active/trial/suspended/cancelled), trial_ends_at, current_period_start/end, payment_status (paid/pending/overdue), stripe_customer_id, stripe_subscription_id (campos preparados para Stripe futuro)
4. **Tabela `platform_api_keys`** -- chaves de IA da plataforma
   - provider, api_key_encrypted, is_active, monthly_budget, current_month_cost
5. **Tabela `organization_usage`** -- métricas de uso por org/mês
   - organization_id, period (YYYY-MM), storage_bytes, messages_sent, messages_received, ai_requests, ai_cost_usd, contacts_count
6. **Tabela `admin_audit_logs`** -- histórico de ações admin
   - action, entity_type, entity_id, performed_by, details (jsonb)
7. **Tabelas de governança:**
   - `governance_checks` -- checklist de maturidade (phase, name, weight, is_blocker, status, notes)
   - `governance_snapshots` -- histórico de scores (score_total + scores por dimensão)
   - `governance_prompts` -- biblioteca de prompts (name, category, content, criticality, status, related_files)
   - `governance_prompt_versions` -- versionamento (prompt_id, version, content, changed_by, reason)
8. **Função `is_platform_admin(uuid)`** -- SECURITY DEFINER para verificar acesso
9. **RLS** em todas as tabelas: apenas `platform_admin` pode ler/escrever
10. **Atribuir role** `platform_admin` ao usuário `d816224c-eead-4a6c-91f7-89c5560f8cde`
11. **Adicionar campos** na `organizations`: `storage_limit_bytes`, `storage_used_bytes`

### Frontend

1. **`src/hooks/usePlatformAdmin.ts`** -- hook que verifica se o usuário logado tem role `platform_admin`
2. **`src/pages/AdminPage.tsx`** -- página com tabs:
   - Visão Geral (cards de resumo placeholder)
   - Clientes (lista de orgs -- placeholder)
   - Planos (CRUD placeholder)
   - API & Custos (placeholder)
   - Governança (placeholder)
   - Segurança (placeholder)
   - Histórico (placeholder)
3. **`src/components/admin/AdminProtectedRoute.tsx`** -- wrapper que verifica `platform_admin`
4. **Atualizar `App.tsx`** -- adicionar rota `/admin`
5. **Atualizar `Sidebar.tsx`** -- mostrar link "Admin" com ícone Shield apenas para `platform_admin`

### Edge Function

1. **`admin-dashboard`** -- edge function com SECURITY DEFINER que busca dados cross-org (total de orgs, contatos, mensagens, storage). Verifica role `platform_admin` server-side antes de retornar dados.

## Segurança

- Role `platform_admin` separada no enum, nunca no profile
- Função `is_platform_admin()` como SECURITY DEFINER para RLS
- Edge function valida token + role server-side
- Sidebar só mostra link para `platform_admin`
- Rota protegida client-side E server-side

## Ordem de Implementação

1. Migration SQL (enum + todas as tabelas + RLS + atribuir role)
2. Hook `usePlatformAdmin`
3. `AdminProtectedRoute`
4. `AdminPage` com tabs e placeholders
5. Atualizar `App.tsx` e `Sidebar.tsx`
6. Edge function `admin-dashboard`

