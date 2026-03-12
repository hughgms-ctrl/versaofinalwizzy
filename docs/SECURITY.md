# Wizzy AI — Security Policy

> Last updated: 2026-03-12

## 1. Data Classification

| Classification | Examples | Protection |
|:---|:---|:---|
| **Confidential** | API keys, tokens, passwords | Supabase Secrets (vault); never in code |
| **Sensitive** | Customer phone numbers, messages, documents | RLS isolation; encrypted at rest (Supabase) |
| **Internal** | Organization settings, flow configs | RLS per organization |
| **Public** | Published booking pages, public forms | Public tokens with limited scope |

## 2. Authentication

- Email/password via Supabase Auth
- JWT tokens with automatic expiry and refresh
- Session persistence in localStorage (Supabase default)
- No social login currently (future: Google OAuth)

## 3. Authorization Model

### Roles
| Role | Scope | Capabilities |
|:---|:---|:---|
| `owner` | Organization | Full access to all modules |
| `admin` | Organization | Full access to all modules |
| `moderator` | Organization | Configurable per-module access |
| `user` | Organization | Restricted, permission-based access |
| `platform_admin` | Platform-wide | Admin panel access (separate login) |

### Implementation
- Roles stored in `user_roles` table (never in `profiles`)
- `has_role()` — SECURITY DEFINER function for DB-level checks
- `user_can_access_module()` — Per-module permission check
- `is_platform_admin()` — Platform admin verification

## 4. Data Isolation (Multi-Tenancy)

- **Row-Level Security (RLS)** enabled on all tables
- Every table includes `organization_id` column
- RLS policies use `get_user_org_id(auth.uid())` for automatic filtering
- Cross-tenant data access is impossible at the database level

## 5. Input Validation

- **Client-side**: Zod schemas for form validation
- **Server-side**: Edge Functions validate all inputs
- **HTML Sanitization**: `sanitizeHtml()` strips dangerous tags/attributes
- **WhatsApp Formatter**: Escapes HTML entities before rendering
- **SQL**: Parameterized queries only (Supabase SDK); no raw SQL execution

## 6. Content Security Policy (CSP)

```
default-src 'self';
script-src 'self' 'unsafe-inline' 'unsafe-eval';
style-src 'self' 'unsafe-inline';
connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.lovable.app;
img-src 'self' data: blob: https:;
font-src 'self' data:;
frame-src 'none';
object-src 'none';
```

## 7. Webhook Security

- Token-based validation via `ZAPI_CLIENT_TOKEN`
- Webhooks always return 200 OK (prevents provider deactivation)
- Instance matching: ID → Name → Token fallback chain

## 8. Secret Management

| Secret | Purpose | Storage |
|:---|:---|:---|
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side admin access | Supabase Secrets |
| `ZAPI_CLIENT_TOKEN` | Webhook authentication | Supabase Secrets |
| `UAZAPI_ADMIN_TOKEN` | Instance management | Supabase Secrets |
| `GOOGLE_CLIENT_ID/SECRET` | Calendar/Drive OAuth | Supabase Secrets |
| `SUPABASE_ANON_KEY` | Client-side (publishable) | Codebase (safe) |

## 9. Incident Response

1. **Detection**: Monitor Edge Function logs in Supabase Dashboard
2. **Containment**: Deactivate compromised WhatsApp instances via `deactivate_org_instances()`
3. **Recovery**: Restore from Google Drive backup if configured
4. **Post-mortem**: Log in `admin_audit_logs`

## 10. LGPD Compliance Notes

- User data stored in Brazil-region Supabase project
- Contact deletion cascades to conversations and messages
- Data export capability via admin functions
- Consent tracking: planned (not yet implemented)

## 11. Vulnerability Disclosure

Report security issues to the platform administrator through the admin panel.
