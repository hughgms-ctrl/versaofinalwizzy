# Wizzy AI — Architecture Documentation

> Last updated: 2026-03-12

## 1. Overview

Wizzy AI is a multi-tenant SaaS platform for WhatsApp-based customer service, combining AI agents, CRM pipelines, flow automation, and document management in a unified workspace.

### Target Users
- Small-to-medium businesses needing automated WhatsApp customer support
- Sales teams managing leads through conversational pipelines
- Operations teams automating document workflows

---

## 2. System Architecture (C4 — Container Level)

```
┌──────────────────────────────────────────────────────┐
│                    USERS (Browser)                     │
│                                                        │
│  ┌─────────────────────────────────────────────────┐  │
│  │         React SPA (Vite + TypeScript)            │  │
│  │  • shadcn/ui + Tailwind CSS                     │  │
│  │  • React Query (server state)                   │  │
│  │  • React Router (client routing)                │  │
│  │  • XY Flow (flow builder)                       │  │
│  └───────────────────┬─────────────────────────────┘  │
└──────────────────────┼────────────────────────────────┘
                       │ HTTPS
                       ▼
┌──────────────────────────────────────────────────────┐
│               SUPABASE PLATFORM                       │
│                                                        │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │  PostgreSQL   │  │ Edge Functions│  │  Auth (JWT) │ │
│  │  + RLS        │  │  (Deno)      │  │  + RBAC     │ │
│  │  + Triggers   │  │  70+ funcs   │  │             │ │
│  └──────────────┘  └──────┬───────┘  └─────────────┘ │
│                           │                            │
│  ┌──────────────┐  ┌──────┴───────┐  ┌─────────────┐ │
│  │  Realtime     │  │  Storage     │  │  pg_net     │ │
│  │  (WebSocket)  │  │  (S3-compat) │  │  (HTTP)     │ │
│  └──────────────┘  └──────────────┘  └─────────────┘ │
└──────────────────────────────────────────────────────┘
                       │
                       ▼ External APIs
┌──────────────────────────────────────────────────────┐
│  • Z-API / UAZAPI (WhatsApp Business)                 │
│  • OpenAI (AI Agents)                                 │
│  • Google Calendar / Drive APIs                       │
│  • PDF Generation Service                             │
└──────────────────────────────────────────────────────┘
```

---

## 3. Architecture Decision Records (ADRs)

### ADR-001: Supabase as Backend-as-a-Service
- **Context**: Need for rapid development with auth, database, realtime, and storage
- **Decision**: Use Supabase (PostgreSQL + Edge Functions + Auth + Realtime)
- **Rationale**: Single platform for all backend needs; RLS for multi-tenancy; built-in JWT auth; realtime subscriptions for chat
- **Trade-offs**: Vendor lock-in; Edge Functions limited to Deno runtime

### ADR-002: Multi-Tenancy via Row-Level Security
- **Context**: Multiple organizations share the same database
- **Decision**: All tables include `organization_id`; RLS policies enforce isolation
- **Rationale**: PostgreSQL-native security at the database layer; no application-level filtering bugs can leak data
- **Trade-offs**: Complex policy management; requires SECURITY DEFINER functions to avoid recursion

### ADR-003: RBAC with Separate Roles Table
- **Context**: Need role-based access control without privilege escalation
- **Decision**: `user_roles` table separate from `profiles`; `has_role()` SECURITY DEFINER function
- **Rationale**: Prevents client-side role manipulation; supports multiple roles per user (org-level + platform-level)
- **Trade-offs**: Additional join required for role checks

### ADR-004: Edge Functions with verify_jwt = false
- **Context**: Supabase signing-keys system incompatible with default JWT verification
- **Decision**: Disable default JWT verification; validate manually via `getClaims()` in code
- **Rationale**: Allows webhooks and public endpoints while maintaining security for authenticated endpoints
- **Trade-offs**: Each function must implement its own auth check

### ADR-005: React + Vite + TypeScript Frontend
- **Context**: Need for fast development with type safety
- **Decision**: React 18 with Vite, TypeScript, shadcn/ui, Tailwind CSS
- **Rationale**: Industry-standard stack; shadcn/ui provides accessible, customizable components; Tailwind for consistent design system
- **Trade-offs**: Large bundle size with many dependencies

### ADR-006: WhatsApp Integration via Z-API/UAZAPI
- **Context**: Need WhatsApp Business API access
- **Decision**: Use Z-API as WhatsApp gateway; UAZAPI for instance management
- **Rationale**: Handles WhatsApp protocol complexity; webhook-based message delivery
- **Trade-offs**: Third-party dependency for core functionality

### ADR-007: AI Agent Architecture
- **Context**: Need configurable AI agents with different personas and knowledge bases
- **Decision**: AI agents defined in database with prompt templates; executed via Edge Functions calling OpenAI
- **Rationale**: Dynamic agent configuration without redeployment; training rules stored in DB
- **Trade-offs**: Latency from Edge Function → OpenAI chain

---

## 4. Security Architecture

### Authentication & Authorization
| Layer | Implementation |
|:---|:---|
| **Authentication** | Supabase Auth (JWT, email/password) |
| **Authorization** | RLS + `has_role()` + `user_can_access_module()` |
| **Role Storage** | `user_roles` table (never in profiles) |
| **Admin Access** | `is_platform_admin()` RPC, separate admin routes |
| **Module Permissions** | `user_permissions` table with per-module flags |

### Data Protection
| Measure | Status |
|:---|:---|
| RLS on all tables | ✅ Active |
| SECURITY DEFINER functions | ✅ For role checks |
| CSP headers | ✅ In index.html |
| HTML sanitization | ✅ `sanitizeHtml()` utility |
| XSS prevention in WhatsApp formatter | ✅ Character escaping |
| Input validation | ✅ Zod schemas on forms |
| Webhook token validation | ✅ `ZAPI_CLIENT_TOKEN` |

### Threat Model
| Threat | Mitigation |
|:---|:---|
| SQL Injection | Supabase SDK parameterized queries; no raw SQL |
| XSS | CSP + HTML sanitization + output escaping |
| Privilege Escalation | Roles in separate table; SECURITY DEFINER checks |
| Data Leakage (cross-tenant) | RLS policies on every table |
| Token Theft | JWT auto-expiry; HttpOnly considerations |
| Webhook Abuse | Token-based validation + 200 OK always returned |

---

## 5. Data Model (Core Entities)

```
organizations (tenant root)
├── profiles (users, FK → auth.users)
├── user_roles (RBAC, FK → auth.users)
├── user_permissions (module-level ACL)
├── workspaces (sub-divisions)
├── whatsapp_instances (WA connections)
├── contacts (customers)
│   ├── contact_tags
│   ├── contact_notes
│   ├── contact_files
│   └── contact_presence
├── conversations (chat threads)
│   ├── messages (individual messages)
│   ├── conversation_pipeline_positions
│   └── conversation_shares
├── pipelines → pipeline_columns
├── ai_agents → agent_training_rules
├── flows → flow_executions
├── campaigns → campaign_queue
├── document_templates → generated_documents → document_signatures
└── calendar_configs → calendar_bookings
```

---

## 6. Module Architecture

| Module | Frontend | Backend | Key Tables |
|:---|:---|:---|:---|
| **Auth** | `useAuth`, `ProtectedRoute` | Supabase Auth + triggers | `profiles`, `user_roles` |
| **Conversations** | `ConversationDetail`, `ConversationList` | `zapi-webhook`, Realtime | `conversations`, `messages` |
| **Contacts** | `ContactsPage` | RLS queries | `contacts`, `contact_tags` |
| **Pipeline** | `PipelineBoardV2` (DnD) | `stage-notification` | `pipelines`, `pipeline_columns` |
| **Flows** | `FlowCanvas` (XY Flow) | `flow-execute`, `flow-to-prompt` | `flows`, `flow_executions` |
| **AI Agents** | `AgentEditorPage` | `agent-orchestrator`, `generate-agent-prompt` | `ai_agents`, `agent_training_rules` |
| **Documents** | `TemplateEditor`, `PackEditor` | `generate-document-pdf`, `capture-signature` | `document_templates`, `generated_documents` |
| **Calendar** | `CalendarPage` (FullCalendar) | `google-calendar-*` | `calendar_configs`, `calendar_bookings` |
| **Admin** | `AdminPage` (isolated layout) | `admin-dashboard`, `admin-governance` | `admin_audit_logs`, `governance_prompts` |

---

## 7. Edge Functions Inventory

### WhatsApp Integration (12 functions)
`zapi-webhook`, `zapi-send-message`, `zapi-sync-chats`, `zapi-sync-messages`, `zapi-check-status`, `zapi-disconnect`, `zapi-contact-profile`, `zapi-message-actions`, `zapi-call`, `zapi-create-instance`, `zapi-get-qrcode`, `zapi-save-credentials`

### AI & Automation (6 functions)
`agent-orchestrator`, `generate-agent-prompt`, `analyze-conversation`, `train-ai-agent`, `flow-execute`, `flow-to-prompt`

### Documents (5 functions)
`generate-document-pdf`, `process-document-template`, `capture-signature`, `public-pack-form`, `unify-pack-fields`

### Scheduling & Campaigns (4 functions)
`process-scheduled-messages`, `process-campaign-queue`, `trigger-campaign-on-tag`, `process-flow-timeouts`

### Google Integrations (5 functions)
`google-calendar-auth`, `google-calendar-book`, `google-calendar-availability`, `google-drive-auth`, `google-drive-backup`

### Admin (3 functions)
`admin-dashboard`, `admin-governance`, `create-user`, `delete-user`

---

## 8. Testing Strategy

| Type | Tool | Coverage |
|:---|:---|:---|
| **Unit Tests** | Vitest + Testing Library | Auth, sanitization, formatters, routing |
| **Component Tests** | Vitest + JSDOM | ProtectedRoute, critical UI guards |
| **Edge Function Tests** | Deno test runner | Via `supabase--test_edge_functions` |

### Running Tests
```bash
npm test        # Run all tests
npm run test:watch  # Watch mode
```

---

## 9. Deployment

| Component | Platform | Method |
|:---|:---|:---|
| Frontend | Lovable (Vite build) | Auto-deploy on commit |
| Edge Functions | Supabase | Auto-deploy via Lovable |
| Database | Supabase PostgreSQL | Migrations (SQL) |
| Storage | Supabase Storage | 3 buckets: chat-media, flow-media, contact-files |

---

## 10. Governance & Compliance

- **Governance Dashboard**: Maturity score 0-100 across Security (30%), Backend (20%), Continuity (20%), Help (10%), UX (10%), Governance (10%)
- **Architecture Certification**: Auto-issued when score ≥ 85 and security ≥ 90%
- **Prompt Versioning**: All AI instructions tracked as versioned code in `governance_prompts`
- **Audit Logs**: Admin actions tracked in `admin_audit_logs`

---

## 11. Known Limitations & Roadmap

| Limitation | Impact | Planned Mitigation |
|:---|:---|:---|
| No persistent rate limiting | Medium | Redis/Upstash integration |
| No error monitoring (Sentry) | High | Planned integration |
| No API versioning | Medium | `/v1/` prefix for Edge Functions |
| No E2E tests | Medium | Playwright integration |
| No WAF/DDoS protection | Low | Cloudflare/Vercel proxy |
