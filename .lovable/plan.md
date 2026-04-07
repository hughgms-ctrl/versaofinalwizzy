

# Sistema de Assinaturas com Asaas

## Resumo

Construir o sistema completo de assinaturas integrado com Asaas (gateway de pagamento brasileiro), incluindo Landing Page pública, painel de upgrade dentro do app, e gerenciamento admin. Funcionalidades bloqueadas aparecerão "cinza" com CTA de upgrade.

---

## Estrutura dos 3 Planos (proposta)

```text
┌──────────────┬──────────────┬──────────────┐
│   STARTER    │     PRO      │  ENTERPRISE  │
├──────────────┼──────────────┼──────────────┤
│ Conversas    │ Conversas    │ Conversas    │
│ Pipeline     │ Pipeline     │ Pipeline     │
│ Contatos     │ Contatos     │ Contatos     │
│ Fluxos       │ Fluxos       │ Fluxos       │
│ Documentos   │ Documentos   │ Documentos   │
│ 3 membros    │ 10 membros   │ 50 membros   │
│ 1 GB storage │ 10 GB        │ 50 GB        │
│              │              │              │
│ ✗ IA         │ ✓ IA         │ ✓ IA         │
│ ✗ Agentes    │ ✓ Agentes    │ ✓ Agentes    │
│ ✗ Orquestr.  │ ✗ Orquestr.  │ ✓ Orquestr.  │
│ ✗ Relatórios │ ✓ Relatórios │ ✓ Relatórios │
│ ✗ Campanhas  │ ✓ Campanhas  │ ✓ Campanhas  │
│ ✗ Agenda     │ ✓ Agenda     │ ✓ Agenda     │
│              │              │              │
│ R$ 97/mês    │ R$ 197/mês   │ R$ 497/mês   │
│ R$ 970/ano   │ R$ 1.970/ano │ R$ 4.970/ano │
└──────────────┴──────────────┴──────────────┘
```

> Esses valores e módulos são ajustáveis. Confirme se essa distribuição faz sentido antes de implementar.

---

## O que será construído

### 1. Banco de Dados - Ajustes

- Adicionar colunas `price_yearly` e `allowed_modules` (jsonb com lista de módulos permitidos) na tabela `platform_plans`
- Adicionar colunas `asaas_customer_id`, `asaas_subscription_id` e `billing_cycle` (mensal/anual) na tabela `organization_plans`
- Criar tabela `billing_events` para registrar webhook events do Asaas (auditoria)

### 2. Edge Functions - Asaas

- **asaas-create-customer**: Cria cliente no Asaas ao registrar organização
- **asaas-create-subscription**: Cria assinatura PIX recorrente ou cartão
- **asaas-webhook**: Recebe notificações do Asaas (pagamento confirmado, falha, cancelamento) e atualiza `organization_plans`
- **asaas-change-plan**: Upgrade/downgrade de plano

### 3. Landing Page (`/landing`)

- Rota pública (sem login)
- Hero section com proposta de valor
- Seções de funcionalidades
- Tabela comparativa de planos com toggle Mensal/Anual
- Botão "Começar agora" que redireciona para `/auth` (cadastro)
- Design responsivo e profissional

### 4. Painel de Assinatura no App (`/settings` ou rota dedicada)

- Card com plano atual, status do pagamento e próximo vencimento
- Tabela comparativa com botão de upgrade
- Toggle Mensal/Anual
- Ao clicar "Assinar" ou "Upgrade", abre checkout do Asaas (link de pagamento)

### 5. Bloqueio de Módulos por Plano

- Hook `useCanAccessModule` já existe - será estendido para verificar os módulos permitidos no plano da organização
- Módulos bloqueados aparecem no menu em cinza com ícone de cadeado
- Ao clicar em módulo bloqueado, exibe modal "Faça upgrade para acessar" com link direto para a página de planos

### 6. Admin - Gerenciamento de Assinaturas

- Expandir AdminPlansPage para incluir `price_yearly` e `allowed_modules`
- Nova aba/seção de assinaturas ativas no painel admin com status de pagamento

---

## Ordem de Implementação

1. Ajustar banco (migrations para `platform_plans`, `organization_plans`, `billing_events`)
2. Landing Page pública
3. Edge Functions do Asaas (criar quando tiver API key)
4. Painel de upgrade no app
5. Bloqueio de módulos por plano
6. Admin - gerenciamento de assinaturas

---

## Pré-requisito

Antes de implementar a integração com Asaas, você precisará:
1. Criar conta no Asaas (https://www.asaas.com)
2. Gerar a API Key (sandbox para testes, produção depois)
3. Me fornecer a chave para eu salvar como secret do projeto

Posso começar pelos itens 1-2 (banco + landing page) enquanto você cria a conta no Asaas.

