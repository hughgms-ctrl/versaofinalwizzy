# Wizzy Platform Operations

Este documento é a referência viva de funcionamento da Wizzy. Toda regra operacional importante deve ser registrada aqui quando a alteração entrar em commit.

Regra de manutenção:

- Atualizar este documento somente junto de uma mudança commitada.
- Se uma lógica de produto, cobrança, plano, permissão, onboarding, IA, gateway ou automação mudar, registrar a decisão aqui no mesmo commit.
- Não documentar intenção futura como se já estivesse em produção. Marcar claramente como "planejado" quando ainda não foi implementado.

## Pagamentos, Planos e Assinatura

Status desta seção: atualizada em 2026-06-03, com observação de que o deploy das Edge Functions de cobrança que estava bloqueado por limite da Supabase foi refeito com sucesso.

### Objetivo

A Wizzy opera como SaaS por workspace/organização. Cada organização deve ter um plano em `organization_plans`, vinculado a um plano comercial em `platform_plans`.

A assinatura controla:

- acesso inicial à plataforma;
- plano atual do workspace;
- status de pagamento;
- limites de uso;
- módulos liberados;
- modelo de IA;
- histórico de eventos de cobrança;
- possibilidade de pagar pendências ou trocar plano.

### Tabelas principais

`platform_plans`

Armazena os planos disponíveis da plataforma.

Campos e regras relevantes:

- `id`: identificador do plano.
- `name`: nome exibido, como Basic, Pro, Scale ou Max.
- `slug`: chave do plano, como `basic`, `pro`, `scale`, `max`.
- `price_monthly`: preço mensal.
- `price_yearly`: preço anual.
- `trial_days`: quantidade de dias de teste configurada.
- `allowed_modules`: módulos liberados no plano.
- `max_team_members`: limite de membros.
- `storage_limit_bytes`: limite de armazenamento.
- `ai_mode`: modo de IA, geralmente `own_api` ou `platform_api`.
- `features`: JSON com limites extras, gateway, flags e configurações comerciais.
- `features.trial_enabled`: liga ou desliga o teste grátis sem apagar `trial_days`.
- `features.trial_days`: cópia/apoio para dias de teste no JSON de features.
- `features.payment.asaas.billing_type`: tipo de cobrança no Asaas.
- `features.payment.stripe.monthly_price_id`: price id mensal no Stripe.
- `features.payment.stripe.yearly_price_id`: price id anual no Stripe.

`organization_plans`

Armazena o plano atual de cada organização.

Campos e regras relevantes:

- `organization_id`: organização/workspace dono da assinatura.
- `plan_id`: plano atual em `platform_plans`.
- `status`: status geral da assinatura, como `active`.
- `payment_status`: status financeiro/de acesso, como `paid`, `manual`, `trial`, `trialing`, `past_due` ou `canceled`.
- `billing_cycle`: `monthly` ou `yearly`.
- `current_period_end`: próximo vencimento ou fim do ciclo atual.
- `trial_ends_at`: fim do teste grátis, quando aplicável.
- `asaas_customer_id`: cliente no Asaas.
- `asaas_subscription_id`: assinatura no Asaas.
- `stripe_customer_id`: cliente no Stripe.
- `stripe_subscription_id`: assinatura no Stripe.

`billing_events`

Armazena eventos recebidos dos gateways de pagamento.

Uso:

- registrar webhooks do Asaas e Stripe;
- exibir histórico na página de assinatura;
- auditar pagamentos, atrasos, cancelamentos e eventos futuros.

Leitura no app:

- donos e admins da organização podem ler os eventos da própria organização;
- essa policy foi adicionada em `20260531152000_billing_events_org_read_policy.sql`.

`platform_settings`

Armazena configurações globais da plataforma.

Chaves relevantes:

- `payment_gateway_strategy`: gateway ativo e flags de Asaas/Stripe.
- `payment_gateway_connection_settings`: credenciais e URLs de checkout.
- `show_client_plans_menu`: controla se o menu lateral do cliente mostra a área de Assinatura.

### Planos comerciais

Os planos atuais usados pela interface são:

- Basic
- Pro
- Scale
- Max

Regras comerciais decididas:

- Basic pode ser usado como plano de teste grátis.
- Teste grátis deve ser ativável/desativável pelo admin.
- Teste grátis não deve exigir que o usuário cadastre chave OpenAI.
- No teste grátis, a ideia comercial é liberar apenas o básico da plataforma, com limites do Basic e sem ferramentas adicionais.
- Max é o plano com Wizzy AI usando API da plataforma.
- Quando o usuário já está em um plano maior, o botão de planos deve usar texto neutro como "Selecionar plano", não "Fazer upgrade".

Observação: a limitação fina do teste grátis por módulo e capacidade deve ser garantida pelas regras de plano, módulos e limites. Se novas restrições forem criadas, elas devem ser registradas aqui.

### Gestão de assinatura no app

A gestão de assinatura não fica mais dentro do Perfil como bloco principal. Ela tem página própria.

Rotas:

- `/subscription`: página de gestão de assinatura do workspace.
- `/plans`: página de seleção/troca de planos.

Menu lateral:

- O item exibido ao cliente é "Assinatura".
- O item aponta para `/subscription`.
- A exibição do item é controlada no admin pela configuração `show_client_plans_menu`.
- O texto no admin é "Exibir área de Assinatura para clientes".

Tela `/subscription`:

- mostra plano atual;
- mostra status financeiro;
- mostra próximo vencimento;
- mostra botão para pagar pendência quando aplicável;
- mostra botão "Alterar plano";
- mostra histórico de faturas/eventos com paginação.

Notas fiscais:

- Não foram implementadas ainda.
- A área de assinatura deve ser preparada para receber notas fiscais no futuro, mas nenhum menu ou bloco de nota fiscal deve ser exibido antes da implementação.

### Onboarding e bloqueio de acesso

Regra atual:

- Usuário sem plano ativo deve ser direcionado para `/subscription`.
- Usuário pode acessar `/subscription`, `/plans` e `/profile` mesmo sem plano ativo.
- Para acessar o restante da plataforma, precisa ter assinatura ativa ou teste válido.
- Membros/funcionários de workspace usam o plano da organização dona do workspace, não a organização do próprio perfil do usuário.
- Apenas `owner` e `admin` da organização do workspace podem acessar `/subscription`, `/plans`, menu de Assinatura, avisos de teste grátis e ações de upgrade.

Condição usada pelo app:

- `organization_plans.status === 'active'`
- `organization_plans.payment_status` em `paid` ou `manual`; ou
- `organization_plans.payment_status` em `trial` ou `trialing` com `trial_ends_at` no futuro.

Se a condição não for atendida, o usuário é redirecionado para `/subscription`.

### Checkout

Fluxo esperado:

1. Usuário acessa `/plans`.
2. Usuário seleciona um plano.
3. Frontend chama a Edge Function `billing-checkout`.
4. A função identifica o usuário autenticado.
5. A função identifica a organização do usuário.
6. A função busca o plano em `platform_plans`.
7. A função busca o gateway ativo em `platform_settings`.
8. A função calcula preço mensal ou anual.
9. A função aplica teste grátis somente se `features.trial_enabled === true`.
10. A função cria checkout no Asaas ou Stripe.
11. A função retorna a URL externa de pagamento.
12. Frontend redireciona o usuário para o checkout.

Regra de teste grátis no checkout:

- `trial_days` só deve valer quando `features.trial_enabled === true`.
- Se `features.trial_enabled` estiver falso, a função deve tratar o plano como sem teste, mesmo que `trial_days` tenha valor salvo.

Importante:

- Essa regra já foi commitada no código local.
- Em produção, ela só passa a valer depois do deploy da Edge Function `billing-checkout`.

### Gateways

A plataforma suporta dois gateways no desenho atual:

- Asaas
- Stripe

Gateway ativo:

- definido em `platform_settings.payment_gateway_strategy.active_provider`;
- valores esperados: `asaas` ou `stripe`.

Asaas:

- usa checkout hospedado;
- cria cobrança recorrente;
- usa `nextDueDate` considerando teste grátis quando ativo;
- webhook esperado: `/functions/v1/asaas-webhook`.

Stripe:

- usa Checkout Session em modo assinatura;
- usa Price IDs configurados no plano;
- aplica `subscription_data[trial_period_days]` quando teste grátis estiver ativo;
- webhook esperado: `/functions/v1/stripe-webhook`.

### Webhooks

`asaas-webhook`

Responsabilidades:

- receber eventos do Asaas;
- gravar o payload em `billing_events`;
- marcar plano como pago quando pagamento for confirmado;
- marcar plano como `past_due` em eventos de atraso;
- marcar plano como `canceled` em eventos de cancelamento/inativação.

`stripe-webhook`

Responsabilidades:

- receber eventos do Stripe;
- gravar o payload em `billing_events`;
- marcar plano como pago em `checkout.session.completed`;
- marcar plano como `past_due` em `invoice.payment_failed`;
- marcar plano como `canceled` em eventos de assinatura deletada ou pausada.

### Status financeiro

Status usados:

- `paid`: pagamento em dia.
- `manual`: uso liberado manualmente pelo admin, sem etiqueta de teste grátis.
- `trial`: teste grátis ativo.
- `trialing`: teste grátis ativo, nomenclatura compatível com gateways.
- `past_due`: pagamento atrasado.
- `canceled`: assinatura cancelada.

Comportamento esperado:

- `paid`, `manual`, `trial` e `trialing` liberam acesso, sendo que `trial` e `trialing` dependem de `trial_ends_at` no futuro.
- `past_due` deve permitir direcionamento para pagamento de pendência.
- `canceled` não deve liberar acesso geral.

### Pagamento atrasado

A tela `/subscription` deve mostrar opção de pagamento de pendência quando o status indicar atraso.

Regra atual:

- botão "Pagar pendência" chama novamente `billing-checkout` com o plano atual;
- fluxo leva o cliente para o checkout do gateway.

Observação:

- Uma lógica futura pode preferir recuperar invoice/checkout já existente do gateway.
- Se isso for implementado, documentar aqui.

### Histórico de faturas

O histórico atual é baseado em `billing_events`, não em uma tabela fiscal/contábil final.

Exibição:

- lista eventos recebidos do gateway;
- mostra tipo de evento;
- mostra data;
- mostra valor quando disponível no payload;
- usa paginação.

Notas fiscais:

- Planejado para outro momento.
- Não exibir no sistema até implementação real.

### Teste grátis

Decisão comercial atual:

- teste grátis deve ser ativável/desativável no painel admin;
- o admin pode liberar um plano em teste grátis para uma organização pela tela de Clientes;
- a liberação manual grava `payment_status = 'trial'` e `trial_ends_at`;
- para estender o teste, o admin salva novamente a organização com uma data maior;
- ao fim de `trial_ends_at`, o acesso geral deixa de ser liberado e o cliente volta para `/subscription`;
- o admin também pode usar `Uso liberado`, que grava `payment_status = 'manual'` e libera acesso sem exibir etiqueta de teste grátis;
- `Plano pago` deve representar assinatura real ou pagamento confirmado.
- inicialmente deve ser usado somente no Basic;
- deve preservar os dias configurados quando desligado;
- desligar o teste não deve obrigar apagar `trial_days`;
- o botão/landing pode exibir "Teste grátis por X dias" somente quando o teste estiver ativo.

Limitações desejadas para teste grátis:

- sem Wizzy AI pela API da plataforma;
- sem chave OpenAI do cliente obrigatória;
- sem ferramentas adicionais;
- limites do Basic;
- foco em experimentar o Wizzy Chat/CRM básico.

Ainda pendente:

- se a estratégia for teste sem cartão, será necessário criar um fluxo próprio de "iniciar teste" sem passar pelo checkout do gateway.
- o fluxo atual foi desenhado para checkout do gateway com suporte a trial, especialmente Stripe/Asaas conforme capacidades configuradas.

### Dependência das Edge Functions

Pagamentos dependem de Edge Functions para operar corretamente.

Funções críticas:

- `billing-checkout`
- `asaas-webhook`
- `stripe-webhook`

Sem essas funções:

- a plataforma pode carregar telas e dados simples;
- checkout pode falhar;
- confirmação de pagamento não é automática;
- plano pago pode não ser liberado automaticamente;
- atraso/cancelamento pode não ser refletido no app;
- eventos de cobrança podem não ser registrados.

### Estado do deploy

Commit local e remoto:

- `4177a27 Add subscription management and billing controls`

Build:

- `npm run build` passou.

Deploy Supabase em 2026-05-31:

- tentativa de deploy das funções falhou com status 402.
- mensagem: `Max number of functions reached for project, please upgrade Plan or disable spend cap`.

Funções que tiveram deploy bloqueado em 2026-05-31:

- `billing-checkout`
- `asaas-webhook`
- `stripe-webhook`
- `safe-record-actions`

Redeploy em 2026-06-03:

- `billing-checkout`: deploy concluído.
- `asaas-webhook`: deploy concluído.
- `stripe-webhook`: deploy concluído.
- `safe-record-actions`: deploy concluído.

Impacto anterior:

- o código novo existe no GitHub;
- o Lovable pode publicar o frontend;
- as Edge Functions em produção continuam na versão anterior até novo deploy.

Status atual:

- o bloqueio de deploy das funções acima foi resolvido;
- ainda é necessário validar checkout real, webhook real, pagamento atrasado e histórico em `/subscription`;
- também é necessário garantir que o gateway ativo e as chaves do Asaas/Stripe estejam configurados em `platform_settings` ou nos secrets da Supabase.

### Pixels e campanhas de tráfego

Ainda não implementado para checkout/assinatura nesta etapa.

Necessidade:

- campanhas de tráfego precisam rastrear visitas, cadastro, seleção de plano, início de checkout, teste grátis e compra.

Eventos recomendados:

- `PageView`: carregamento da landing/page.
- `ViewContent` ou `ViewPricing`: visualização da área de planos.
- `Lead`: lead capturado ou cadastro iniciado.
- `CompleteRegistration`: conta criada.
- `SelectPlan`: usuário escolheu um plano.
- `StartTrial`: usuário iniciou teste grátis.
- `InitiateCheckout`: usuário abriu checkout.
- `Purchase` ou `Subscribe`: pagamento confirmado.

Locais recomendados:

- landing page;
- tela de cadastro;
- página `/plans`;
- clique em selecionar plano;
- sucesso de checkout;
- webhook de pagamento confirmado.

Estratégia recomendada:

- usar pixel no navegador para eventos de navegação e intenção;
- usar conversão server-side para compra confirmada, porque o pagamento acontece fora da Wizzy;
- Meta Conversions API e Google Enhanced Conversions devem ser considerados;
- eventos server-side dependem de backend/Edge Function ou outro servidor confiável.

Regra importante:

- `Purchase` não deve ser disparado apenas no clique do botão.
- `Purchase` deve ser disparado quando o gateway confirmar pagamento via webhook.

### Pendências conhecidas

- Validar webhooks em ambiente real.
- Definir política final para teste grátis sem cartão ou com checkout.
- Implementar tracking/pixels para funil de aquisição.
- Implementar notas fiscais em etapa futura.
- Documentar qualquer nova regra de limite por plano quando for implementada.
