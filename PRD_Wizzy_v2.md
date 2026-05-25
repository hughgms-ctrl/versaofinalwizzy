# PRD — Wizzy v2
## Plataforma de Gestão Inteligente de Conversas WhatsApp

> Stack-alvo: Next.js 14 App Router · TypeScript strict · Supabase Auth+DB+Storage · Prisma ORM · Zod · Vercel

---

## 1. DIAGNÓSTICO DA VERSÃO ATUAL

### 1.1 Stack Atual

| Camada | Tecnologia |
|--------|-----------|
| Runtime | Vite + React 18 SPA (sem servidor) |
| Linguagem | TypeScript 5.8 |
| Roteamento | React Router DOM v6 |
| UI | shadcn/ui + Tailwind CSS + Radix UI |
| Banco | Supabase PostgreSQL (acessado direto do cliente) |
| Auth | Supabase Auth |
| ORM | **Nenhum** — Supabase JS direto nos componentes |
| Editor Visual | @xyflow/react (React Flow) |
| Rich Text | Tiptap (extensões completas) |
| Drag & Drop | @dnd-kit + @hello-pangea/dnd |
| Calendário | FullCalendar |
| Formulários | React Hook Form + Zod |
| Estado Servidor | TanStack Query v5 |
| Monitoramento | Sentry |
| Testes | Vitest (configurado, sem suíte real) |
| Deploy | Lovable (estático, sem SSR) |
| Pagamentos | Asaas |
| WhatsApp | Z-API (zapi_instance_id / zapi_token) |

### 1.2 O que está bem feito ✅

- TypeScript em todo o projeto
- shadcn/ui garante acessibilidade e consistência visual
- TanStack Query v5 para cache do lado cliente
- Sentry integrado para rastreamento de erros
- Zod e React Hook Form para validação client-side
- @xyflow/react para o editor visual de flows
- Tiptap com extensões completas para editor de documentos
- Multi-tenant via `organization_id` em todas as tabelas (96 tabelas)
- Modelo de permissões granular (`user_permissions`)
- Módulo de Governance completo com scoring e certificação
- Sistema de Workspaces para multi-contexto dentro da org
- Pacotes de plataforma (`platform_packages`) para onboarding guiado
- Módulo de assinatura digital completo com OTP, selfie, geolocalização

### 1.3 O que precisa ser refatorado ⚠️

- **SPA pura sem servidor**: toda lógica roda no cliente — sem API layer
- **Supabase JS direto nos componentes**: sem camada de serviço ou repositório
- **Zero validação server-side**: RLS do Supabase é a única barreira
- **`.env` com chaves reais commitado no repositório público** (CRÍTICO)
- **Arquivos de debug na raiz**: `check_stuck.*`, `debug_*.ts`, `test_*.ts` em produção
- **Dois gerenciadores de pacotes conflitantes**: `bun.lock` + `package-lock.json`
- **Driver `postgres` raw** junto do Supabase JS — duplicidade e risco
- **Sem API para execuções de flow**: lógica de `flow_executions` com timeout no cliente
- **Chaves de API (OpenAI, Gemini, Z-API)** armazenadas em texto puro no banco

### 1.4 Riscos Críticos 🔴

| Risco | Severidade | Detalhe |
|-------|-----------|---------|
| Chaves expostas no Git público | CRÍTICO | `.env` com Supabase URL + anon key commitado — rotacionar NOW |
| Ausência de API server-side | ALTO | Usuário autenticado pode manipular dados de outras orgs se RLS falhar |
| Sem validação de input no servidor | ALTO | Dados maliciosos podem ser inseridos via SDK diretamente |
| Execução de flows no cliente | ALTO | `flow_executions` com `timeout_at` dependem de polling client-side |
| Chaves de WhatsApp (zapi_token) em texto | ALTO | Deveriam ser criptografadas em repouso |
| Chaves de IA (openai_api_key, gemini_api_key) em texto | ALTO | `integration_configs` expõe chaves de API em texto puro |

---

## 2. INVENTÁRIO COMPLETO DE FUNCIONALIDADES

> Extraído diretamente do App.tsx (50 rotas) e do schema do banco (96 tabelas).

### 2.1 Autenticação e Organização
- Login / Cadastro / Recuperação de senha (Supabase Auth)
- Multi-tenant por `organization_id` em todas as entidades
- Perfis de usuário: nome completo, avatar, telefone
- Papéis: `admin`, `agent`
- Permissões granulares por módulo (`user_permissions`):
  - Módulos: conversations, pipeline, flows, reports, agents, settings, team, scheduled, calendar, operations, dashboard
  - Filtros de conversa por tipo (`all`, `assigned`, `tag`)
  - Tags de conversa permitidas por usuário
  - Acesso por pipeline específico
- Fingerprinting de sessão para segurança
- Bloqueio por IP/fingerprint

### 2.2 Dashboard (`/dashboard`)
- Métricas da organização em tempo real
- Uso por período: mensagens enviadas/recebidas, requisições IA, custo IA, contatos
- Gráficos com Recharts

### 2.3 Conversas WhatsApp (`/conversations`)
- Lista de conversas com busca e filtros múltiplos
- Status de conversa: `open`, `closed` + status customizados com cor e ordem
- Modos de atendimento: `pendente`, `bot`, `humano`
- Atribuição a agente humano (`assigned_to`)
- Atribuição a agente de IA (`ai_agent_id`)
- Intervenção humana com registro de quem e quando
- Departamentos por conversa
- Fonte de lead por conversa
- Contagem de não lidas
- Compartilhamento de conversa com outros usuários (com nota)
- Histórico de mudança de estágio no pipeline
- Presença do contato em tempo real (expires em 30s)
- Sincronização com Z-API (oldest_synced_message_id)
- Auto-close configurável por horas
- Tipos de mensagem: texto, imagem, áudio, vídeo, documento, sticker, localização
- Transcrição de áudio automática
- Bot ativo por conversa

### 2.4 Contatos (`/contacts`)
- CRUD completo: telefone, nome, email, avatar
- Metadados customizados (jsonb livre)
- Tags por contato (com rastreamento de quem adicionou e como: manual/auto)
- Notas por contato
- Arquivos por contato com organização em pastas
- CRM customizável por contato (campos livres jsonb)
- Fontes de lead configuráveis
- Segmentação por workspace

### 2.5 Pipeline / CRM (`/pipeline`)
- Múltiplos pipelines por organização com descrição
- Colunas customizáveis com cor e ordenação
- Drag & drop de conversas entre colunas
- Tags automáticas ao entrar em coluna
- Notificações configuráveis por estágio (usuários, template de mensagem)
- Pipeline sequencial: ao concluir vai para o próximo pipeline/coluna
- Assignee padrão por pipeline
- Coluna de conclusão configurável
- Histórico de mudanças de estágio (manual/bot/automático)
- Filtro de pipelines por workspace

### 2.6 Agentes de IA (`/agents`, `/agents/:agentId`)
- CRUD de agentes: nome, descrição, avatar, persona, prompt_base
- Base de conhecimento por agente (jsonb array)
- Papel funcional configurável (recepção, vendas, suporte, etc.)
- Papéis customizáveis pela organização (`agent_function_roles`)
- Associação a flows específicos, tags e colunas de pipeline
- Organização em pastas
- Regras de qualificação: critérios de classificação de lead com peso
- Regras de treinamento por agente, flow ou nó específico:
  - Situação + regra + mensagem original + feedback
  - Vinculada a mensagem específica para rastreabilidade
- Logs de execução: input, resposta, ferramentas usadas, tempo de execução
- Master Prompt (`/master-agent/:promptId`):
  - Prompt orquestrador com sequência de agentes
  - Trigger: desabilitado / por tags / por keywords
  - Ativo por workspace com modelo de IA configurável

### 2.7 Flows / Automação (`/flows`, `/flow-builder`)
- CRUD de flows com editor visual React Flow
- Nodes e edges armazenados como JSON
- Variáveis de flow configuráveis
- Tipos de trigger: manual, keyword, tag, pipeline, agendado
- Configuração de trigger detalhada (jsonb)
- Master prompt por flow
- Visibilidade seletiva por workspace
- Visível ou não no chat
- Organização em pastas com hierarquia (parent_id)
- Posição e ordenação
- Execuções de flow:
  - Status: running, completed, failed, timeout
  - Nó atual rastreado
  - Variáveis de contexto (jsonb)
  - Log completo de execução (jsonb array)
  - Timeout configurável
  - Passo de remarketing
- Logs por nó: input, output, tipo de nó — rastreabilidade completa
- Contador de disparos total

### 2.8 Campanhas (`/campaigns`)
- CRUD de campanhas com trigger por keyword
- Tipos de match: `exact`, `contains`, `startsWith`
- Vinculação a flow
- Janela de horário de ativação (start_time / end_time)
- Fila de envio por contato com status e timestamp
- Contador de disparos

### 2.9 Mensagens Agendadas (`/scheduled`)
- CRUD de mensagens agendadas
- Tipos de conteúdo: texto, mídia (com URL e tipo), flow
- Recorrência: once, daily, weekly, monthly
- Data de fim da recorrência
- Próxima execução e última execução rastreadas
- Contador de execuções
- Targets: contato individual ou todos de uma tag
- Fila por contato com status individual
- Delay entre contatos configurável (anti-spam)
- Nome descritivo para identificação
- Filtro por workspace

### 2.10 Equipe (`/team`)
- Listagem e gestão de membros
- Departamentos: nome, cor, ordenação, padrão
- Workspaces (espaços de trabalho isolados):
  - Nome, descrição, cor, instância WhatsApp
  - Filtro por tags de contato
  - Membros por workspace
  - Templates de workspace: master prompt + agentes + flows + tags + pipeline pré-configurados
  - Config de funil por workspace (pipeline + colunas)
  - Config de agente por workspace (agentes + master prompt + modelo IA)
  - Assignee padrão de operações

### 2.11 Calendário (`/calendar`)
- Visualização de agenda (day grid, time grid, list)
- Integração com Google Calendar via OAuth
  - Refresh token persistido
  - Email da conta conectada
  - ID do calendário selecionado
  - Regras de disponibilidade por dia da semana (horário início/fim)
  - Duração padrão de reunião em minutos
  - Slug público para página de agendamento
- Página pública de agendamento (`/agendar/:slug`):
  - Bookings vinculados a contato e conversa
  - Google Event ID rastreado

### 2.12 Relatórios (`/reports`)
- Métricas de uso por período
- Conversas, IA, armazenamento, contatos

### 2.13 Ferramentas (`/tools`)

#### Widgets / Botões de Captação (`/tools/buttons`, `/tools/buttons/:widgetId`)
- CRUD completo de widgets
- Customização visual: cor do botão, cor do texto, tamanho, posição (bottom-right, etc.), ícone, border-radius
- Formulário de captura configurável: nome, email, CPF, WhatsApp (cada campo: habilitado + obrigatório)
- Campos customizados adicionais (tipo: text, select, etc.) com ordem
- Integrações: register_only / disparar flow / criar conversa
- Pixel de tracking: código + nome do evento customizável
- Mensagem de sucesso ou redirecionamento por URL
- Organização em pastas com hierarquia
- Tags automáticas ao submeter
- Submissões rastreadas: IP, user-agent, referrer, URL da página
- Status de processamento da submissão
- Formulário público (`/form`) e formulário de pack (`/pack-form`)

#### Documentos (`/tools/documents`)
- **Templates** com editor rich text HTML (Tiptap):
  - Campos dinâmicos (jsonb array de field definitions)
  - Logo customizável
  - Categoria
  - Método de assinatura padrão
  - Auto-envio por WhatsApp após geração
  - Organização em pastas (kind: template / pack / both)
- **Pacotes de documentos**: múltiplos templates em um pack com campos compartilhados, token público, auto-WhatsApp
- **Documentos gerados**:
  - Preenchimento interno ou público (`/preencher-contrato/:token`)
  - PDF gerado e armazenado
  - Status: draft, pending, signed
  - Grupo de submissão para rastrear múltiplos docs juntos
  - PDF assinado separado
- **Assinatura digital completa**:
  - Múltiplos signatários com papel e ordem
  - Métodos por signatário: manuscrita, OTP SMS, OTP email, selfie
  - Evidência de assinatura: hash do documento, IP, dispositivo, localização, selfie URL, geolocalização (jsonb), código de verificação
  - Página pública de assinatura (`/sign/:token`)
  - Verificação pública de autenticidade (`/verificar/:codigo`)
  - Expiração configurável
  - PDF com evidências (receipt_pdf_url)

#### Quiz / Formulário Inteligente (`/tools/quiz`, `/tools/quiz/builder`)
- CRUD de quizzes com builder
- Tipos de pergunta: short_text, long_text, single_choice, multiple_choice, rating, date, e outros
- Lógica condicional por questão (jsonb)
- Settings por questão (configurações extras jsonb)
- Tema visual customizável: cor primária, fonte, background
- Tela de boas-vindas configurável (título, descrição, botão, show/hide)
- Tela de encerramento configurável
- Settings globais: nome obrigatório, email, telefone, barra de progresso, auto-trigger WhatsApp
- Token público para acesso externo (`/q/:token`)
- Submissões rastreadas: respondente, respostas (jsonb array), contato, conversa, trigger WhatsApp

### 2.14 Integrações (`/integrations`)
- **Configuração de IA por função**:
  - Funções: geral, agentes, resumo de conversa, geração de prompt, geração de flow, transcrição
  - Provedores por função: Lovable (próprio), OpenAI, Gemini
  - Modelo selecionável por função
  - Chaves de API armazenadas por provedor
- **WhatsApp via Z-API**:
  - Múltiplas instâncias por organização
  - Status: pending, connected, disconnected
  - Label por instância
  - Status padrão para novas conversas
  - Departamento padrão
  - Assignee padrão (nenhum, específico, round-robin)
  - Bloqueio de chamadas
  - Logs de conexão com detalhes de eventos
- **Google Drive**:
  - OAuth com refresh token
  - Pasta de destino configurável
  - Frequência de backup: manual, daily, weekly
  - Seleção do que incluir: tags, arquivos, notas, pipeline, conversas
  - Logs de backup com contagem e tamanho
- **Pacotes de plataforma**: ativação de pacotes pré-configurados para a organização

### 2.15 Configurações (`/settings`)
- Dados da organização: nome, logo, timezone, auto-close em horas
- Gestão de instâncias WhatsApp
- Departamentos (CRUD)
- Status customizados de conversa (CRUD com cor e ordem)
- Fontes de lead (CRUD com cor e ordem)
- Tags (CRUD com cor e descrição)
- **Base de conhecimento da organização**:
  - Nome, site, telefone, email, endereço, horário de funcionamento
  - Métodos de pagamento, tom de voz, diferenciais, sobre
  - FAQs (jsonb array)
  - Campos customizados livres
- **Follow-up templates**:
  - Steps sequenciais de acompanhamento com mensagens
  - Horário silencioso (quiet_start / quiet_end)
  - Ação ao concluir: mover para pipeline/coluna específica

### 2.16 Perfil (`/profile`)
- Nome completo, avatar, telefone

### 2.17 Planos e Billing (`/plans`)
- Visualização do plano atual com status (trial, active, cancelled)
- Data de início/fim do período
- Status de pagamento
- Planos disponíveis com preço mensal e anual
- Modo IA: own_api ou plataforma gerenciada
- Limites por plano: storage, conversas, membros, requisições IA/mês
- Features e módulos habilitados por plano
- Integração com Asaas (customer_id + subscription_id)
- Eventos de billing rastreados
- Métricas de uso atuais vs. limites

### 2.18 Rotas Públicas (sem autenticação)
- `/` e `/landing` — Landing page
- `/auth` — Login e cadastro
- `/form` — Formulário público de widget
- `/pack-form` — Formulário de pacote de documentos
- `/q/:token` — Quiz público
- `/sign/:token` — Assinatura pública de documento
- `/signature/:documentId` — Página de assinatura interna
- `/verificar` e `/verificar/:codigo` — Verificação de documento
- `/agendar/:slug` — Agendamento público via calendar booking
- `/preencher-contrato/:token` — Preenchimento público de contrato

### 2.19 Área Administrativa (`/admin/*`)
- Login separado com proteção independente
- Dashboard de visão geral da plataforma
- **Clientes**: gestão de todas as organizações
- **Planos**: CRUD de planos da plataforma (preços, limites, features, módulos)
- **API**: gestão de chaves de API da plataforma por provedor (budget mensal, custo atual)
- **Governance**:
  - Checks por fase com peso, descrição e flag de bloqueador
  - Score histórico com dimensões: security, backend, continuity, help, ux, governance
  - Snapshots de estado com nível de risco e certificação
  - Prompts de governance versionados com motivo de mudança
  - Certificações emitidas e revogadas
  - Log de ações administrativas
- **Segurança**: fingerprints, IPs bloqueados, auditoria de ações admin
- **Histórico**: log de ações da plataforma
- **Monitoramento**: saúde do sistema
- **Docs**: documentação interna
- **Configurações globais** (`platform_settings`): chave-valor jsonb

### 2.20 Módulo de Cases / Operações
Acessível via permissão `can_access_operations`:
- CRUD de cases (judicial e administrativo)
- **Categorias**: kind (judicial/admin), slug, ícone, cor
- **Status customizados**: com flag is_closed e is_default, por workspace
- **Templates de case**:
  - Dados padrão judiciais e administrativos (jsonb)
  - Assignee, status e categoria padrão
  - Tasks padrão com dias para vencimento e horário padrão
- **Tasks de case**: título, descrição, assignee, data, status (todo/doing/done), obrigatório
- **Prazos críticos**: title, descrição, data, flag fatal, notificação antecipada em dias
- **Triggers automáticos**: ao entrar em coluna de pipeline, cria case pelo template
- **Log de atividade**: registro de todas as ações no case
- **Notificações de task**: canal WhatsApp, dias antes, ao criar, ao atrasar

### 2.21 Notificações em Tempo Real
- Provider global de notificações
- Notificações de tasks de case
- Notificações de estágio de pipeline

---

## 3. ARQUITETURA PROPOSTA — WIZZY v2

### 3.1 Stack Completa

```
Framework:       Next.js 14 (App Router) + TypeScript strict
Auth:            Supabase Auth com @supabase/ssr (cookies SSR)
Database:        Supabase PostgreSQL (MESMO banco — zero migração de dados)
ORM:             Prisma 7 (gerado via prisma db pull do banco atual)
Validação:       Zod em todas as API Routes + React Hook Form no client
UI:              shadcn/ui + Tailwind CSS (100% mantidos)
Flow Editor:     @xyflow/react (mantido)
Rich Text:       Tiptap com todas as extensões (mantido)
Drag & Drop:     @dnd-kit (mantido)
Calendário:      FullCalendar (mantido)
Estado client:   TanStack Query v5 (mantido)
Tempo real:      Supabase Realtime (subscriptions mantidas no client)
Deploy:          Vercel (Edge Functions para webhooks Z-API e Asaas)
Monitoramento:   Sentry + Vercel Analytics
Pagamentos:      Asaas (mantido)
WhatsApp:        Z-API (mantido)
```

### 3.2 Regra de Ouro da Arquitetura

```
Client Component
  → TanStack Query hook
    → fetch() para Next.js API Route
      → Zod.parse(body)           ← valida input no servidor
        → getServerUser()          ← pega organizationId da sessão
          → Service.method()       ← lógica de negócio
            → Prisma query         ← sempre com { where: { organizationId } }
```

**NUNCA:** componente React → Supabase JS para mutações  
**NUNCA:** API Route → Prisma sem checar `organizationId` da sessão  
**SEMPRE:** `organizationId` vem de `getServerUser()`, jamais do body/query  
**SEMPRE:** `findById` usa `findFirst({ where: { id, organizationId } })` — nunca `findUnique({ where: { id } })`

### 3.3 Segurança em Camadas

```
Layer 1: middleware.ts         → redireciona unauthenticated
Layer 2: getServerUser()       → valida sessão e pega organizationId
Layer 3: Zod schemas           → valida shape e tipos dos dados
Layer 4: Service com Prisma    → filtra sempre por organizationId
Layer 5: Supabase RLS          → última linha de defesa (mantida)
```

### 3.4 Estrutura de Diretórios

```
wizzy-v2/
├── app/
│   ├── (public)/
│   │   ├── page.tsx                        # Landing
│   │   ├── auth/page.tsx
│   │   ├── form/page.tsx
│   │   ├── pack-form/page.tsx
│   │   ├── q/[token]/page.tsx
│   │   ├── sign/[token]/page.tsx
│   │   ├── signature/[documentId]/page.tsx
│   │   ├── verificar/[[...codigo]]/page.tsx
│   │   ├── agendar/[slug]/page.tsx
│   │   └── preencher-contrato/[token]/page.tsx
│   ├── (app)/
│   │   ├── layout.tsx
│   │   ├── dashboard/page.tsx
│   │   ├── conversations/page.tsx
│   │   ├── contacts/page.tsx
│   │   ├── pipeline/page.tsx
│   │   ├── agents/page.tsx
│   │   ├── agents/[agentId]/page.tsx
│   │   ├── master-agent/[promptId]/page.tsx
│   │   ├── flows/page.tsx
│   │   ├── flow-builder/page.tsx
│   │   ├── team/page.tsx
│   │   ├── reports/page.tsx
│   │   ├── settings/page.tsx
│   │   ├── scheduled/page.tsx
│   │   ├── profile/page.tsx
│   │   ├── tools/page.tsx
│   │   ├── tools/buttons/page.tsx
│   │   ├── tools/buttons/[widgetId]/page.tsx
│   │   ├── tools/documents/page.tsx
│   │   ├── tools/quiz/page.tsx
│   │   ├── tools/quiz/builder/page.tsx
│   │   ├── integrations/page.tsx
│   │   ├── campaigns/page.tsx
│   │   ├── calendar/page.tsx
│   │   └── plans/page.tsx
│   ├── (admin)/
│   │   └── admin/
│   │       ├── login/page.tsx
│   │       ├── page.tsx
│   │       ├── clients/page.tsx
│   │       ├── plans/page.tsx
│   │       ├── api/page.tsx
│   │       ├── governance/page.tsx
│   │       ├── security/page.tsx
│   │       ├── history/page.tsx
│   │       ├── monitoring/page.tsx
│   │       └── docs/page.tsx
│   └── api/
│       ├── webhooks/zapi/route.ts           # Edge Function
│       ├── webhooks/asaas/route.ts          # Edge Function
│       ├── agents/route.ts
│       ├── agents/[id]/route.ts
│       ├── agents/[id]/training-rules/route.ts
│       ├── flows/route.ts
│       ├── flows/[id]/route.ts
│       ├── flows/[id]/execute/route.ts
│       ├── conversations/route.ts
│       ├── conversations/[id]/route.ts
│       ├── conversations/[id]/messages/route.ts
│       ├── contacts/route.ts
│       ├── contacts/[id]/route.ts
│       ├── pipeline/route.ts
│       ├── campaigns/route.ts
│       ├── scheduled-messages/route.ts
│       ├── documents/route.ts
│       ├── widgets/route.ts
│       ├── quiz/route.ts
│       ├── calendar/route.ts
│       ├── cases/route.ts
│       └── admin/route.ts
├── lib/
│   ├── prisma.ts
│   ├── supabase/server.ts
│   ├── supabase/client.ts
│   └── auth.ts                              # getServerUser()
├── services/
│   ├── agent.service.ts
│   ├── flow.service.ts
│   ├── flow-execution.service.ts
│   ├── conversation.service.ts
│   ├── contact.service.ts
│   ├── campaign.service.ts
│   ├── document.service.ts
│   ├── widget.service.ts
│   ├── quiz.service.ts
│   ├── calendar.service.ts
│   ├── pipeline.service.ts
│   ├── scheduled-message.service.ts
│   ├── case.service.ts
│   └── organization.service.ts
├── schemas/
│   ├── agent.schema.ts
│   ├── flow.schema.ts
│   ├── conversation.schema.ts
│   ├── contact.schema.ts
│   ├── document.schema.ts
│   ├── widget.schema.ts
│   ├── quiz.schema.ts
│   ├── case.schema.ts
│   └── common.schema.ts
├── hooks/                                   # TanStack Query hooks
├── components/
│   ├── ui/                                  # shadcn/ui mantidos
│   ├── flow-editor/
│   ├── conversations/
│   ├── agents/
│   ├── documents/
│   └── shared/
├── contexts/
│   ├── SidebarContext.tsx
│   ├── WorkspaceContext.tsx
│   └── PrivacyContext.tsx
├── prisma/
│   └── schema.prisma                        # Gerado via prisma db pull
├── middleware.ts
└── CLAUDE.md
```

---

## 4. PLANO DE MIGRAÇÃO — 6 FASES

> **Princípio:** o banco de dados não muda. Zero migração de dados. A v1 continua rodando em paralelo durante a migração.

### FASE 0 — Segurança Imediata (Fazer AGORA, antes de qualquer código)
- [ ] Rotacionar a anon key e URL do Supabase (expostas no `.env` público)
- [ ] Remover `.env` do repositório Git
- [ ] Adicionar `.env*` ao `.gitignore`
- [ ] Limpar histórico do Git com BFG Cleaner ou `git filter-repo`
- [ ] Rotacionar tokens Z-API se estiverem expostos
- [ ] Verificar se há outros segredos nos arquivos de debug commitados

### FASE 1 — Setup do Projeto (Dias 1-3)
- [ ] Criar repositório `wizzy-v2` privado
- [ ] `npx create-next-app@14 wizzy-v2 --typescript --tailwind --app`
- [ ] Configurar TypeScript strict: `"strict": true, "noUncheckedIndexedAccess": true`
- [ ] Instalar e configurar shadcn/ui (copiar `components.json` da v1)
- [ ] Instalar `@supabase/ssr` e configurar `lib/supabase/server.ts` e `client.ts`
- [ ] Instalar Prisma: `npm install prisma @prisma/client`
- [ ] `npx prisma db pull` — gera schema.prisma a partir do banco atual
- [ ] Configurar `lib/prisma.ts` com singleton e connection pooling
- [ ] Configurar variáveis de ambiente (sem `NEXT_PUBLIC_` para segredos)
- [ ] Configurar `middleware.ts` para proteção de rotas e redirect de auth
- [ ] Instalar Sentry e configurar
- [ ] Instalar TanStack Query v5

### FASE 2 — Auth e Layout Base (Dias 3-7)
- [ ] Implementar `getServerUser()` — retorna `{ user, organizationId, profile, role }`
- [ ] Implementar layout `(app)/layout.tsx` com AuthGuard server-side
- [ ] Migrar Sidebar e seus sub-componentes da v1
- [ ] Migrar `WorkspaceContext`, `SidebarContext`, `PrivacyContext`
- [ ] Implementar `NotificationProvider`
- [ ] Implementar rotas públicas: Landing, Auth
- [ ] Implementar Admin login e `AdminProtectedRoute`
- [ ] Testar fluxo completo de login → dashboard → logout

### FASE 3 — Core do Produto (Dias 7-18)
- [ ] **Conversas** (prioridade máxima — coração do produto):
  - `ConversationService` com todos os filtros
  - API Routes: GET list, GET by id, POST assign, POST close, PATCH status
  - `MessageService`: GET messages, POST send (texto + mídia)
  - Migrar componentes de chat da v1
  - Subscriptions Supabase Realtime (mantidas no client)
- [ ] **Contatos**: CRUD + tags + notas + arquivos + CRM
- [ ] **Pipeline**: CRUD pipelines/colunas + drag & drop + posições
- [ ] **Dashboard**: métricas + gráficos

### FASE 4 — Agentes e Automação (Dias 18-28)
- [ ] **Agentes**: CRUD + regras de qualificação + regras de treinamento + logs
- [ ] **Master Prompts**: CRUD + configuração de trigger
- [ ] **Flows**: CRUD + migrar editor React Flow da v1
- [ ] **Execução de Flows**: mover lógica de timeout para Edge Function/cron
- [ ] **Campanhas**: CRUD + fila de envio
- [ ] **Mensagens Agendadas**: CRUD + recorrência

### FASE 5 — Ferramentas (Dias 28-40)
- [ ] **Widgets/Botões**: CRUD + editor + formulário público `/form`
- [ ] **Documentos**: templates + geração + assinatura digital completa
- [ ] **Quiz**: builder + formulário público `/q/:token`
- [ ] **Calendário**: integração Google Calendar + agendamento público
- [ ] **Integrações**: Z-API + Google Drive + configuração de IA
- [ ] **Cases/Operações**: CRUD completo

### FASE 6 — Admin, Testes e Deploy (Dias 40-50)
- [ ] Área administrativa completa (todos os sub-módulos)
- [ ] Configurações, Perfil, Planos
- [ ] Follow-up templates, Base de conhecimento
- [ ] Relatórios
- [ ] Suíte de testes (Vitest + Testing Library para componentes críticos)
- [ ] Deploy inicial na Vercel (staging)
- [ ] Smoke tests completos em staging
- [ ] Cutover: apontar `wizzybr.com` para v2
- [ ] Monitorar por 48h com Sentry

---

## 5. EXEMPLOS DE CÓDIGO — PADRÕES OBRIGATÓRIOS

### lib/auth.ts
```typescript
import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function getServerUser() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) redirect('/auth')
  
  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id, full_name, avatar_url')
    .eq('user_id', user.id)
    .single()
  
  if (!profile?.organization_id) redirect('/auth')
  
  return {
    user,
    organizationId: profile.organization_id,
    profile,
  }
}
```

### API Route — GET + POST
```typescript
// app/api/agents/route.ts
import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/auth'
import { AgentService } from '@/services/agent.service'
import { AgentCreateSchema } from '@/schemas/agent.schema'

export async function GET() {
  const { organizationId } = await getServerUser()
  const agents = await AgentService.findAll(organizationId)
  return NextResponse.json(agents)
}

export async function POST(req: Request) {
  const { organizationId } = await getServerUser()
  const body = AgentCreateSchema.parse(await req.json())
  const agent = await AgentService.create(organizationId, body)
  return NextResponse.json(agent, { status: 201 })
}
```

### Service — com organizationId obrigatório
```typescript
// services/agent.service.ts
import { prisma } from '@/lib/prisma'
import type { z } from 'zod'
import type { AgentCreateSchema } from '@/schemas/agent.schema'

type AgentCreateInput = z.infer<typeof AgentCreateSchema>

export const AgentService = {
  async findAll(organizationId: string) {
    return prisma.aiAgent.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    })
  },

  async findById(organizationId: string, id: string) {
    // findFirst com double-check — NUNCA findUnique só por id
    return prisma.aiAgent.findFirst({
      where: { id, organizationId },
    })
  },

  async create(organizationId: string, data: AgentCreateInput) {
    return prisma.aiAgent.create({
      data: { ...data, organizationId },
    })
  },

  async update(organizationId: string, id: string, data: Partial<AgentCreateInput>) {
    return prisma.aiAgent.updateMany({
      where: { id, organizationId }, // updateMany garante isolamento
      data,
    })
  },

  async delete(organizationId: string, id: string) {
    return prisma.aiAgent.deleteMany({
      where: { id, organizationId },
    })
  },
}
```

### Zod Schema
```typescript
// schemas/agent.schema.ts
import { z } from 'zod'

export const AgentCreateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  persona: z.string().optional(),
  promptBase: z.string().optional(),
  functionRole: z.string().default('recepcao'),
  isActive: z.boolean().default(true),
  knowledgeBase: z.array(z.unknown()).default([]),
})

export const AgentUpdateSchema = AgentCreateSchema.partial()
export type AgentCreateInput = z.infer<typeof AgentCreateSchema>
export type AgentUpdateInput = z.infer<typeof AgentUpdateSchema>
```

### TanStack Query Hook
```typescript
// hooks/use-agents.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export function useAgents() {
  return useQuery({
    queryKey: ['agents'],
    queryFn: () => fetch('/api/agents').then(r => r.json()),
  })
}

export function useCreateAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: AgentCreateInput) =>
      fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents'] }),
  })
}
```
