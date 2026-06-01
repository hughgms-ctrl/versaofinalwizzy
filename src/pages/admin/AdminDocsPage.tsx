import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { BookOpen, Shield, Code, Server, FileText, CheckCircle2 } from 'lucide-react';

interface AdminDocsContentProps {
  showHeader?: boolean;
}

export function AdminDocsContent({ showHeader = true }: AdminDocsContentProps) {
  return (
    <div className="space-y-6">
        {showHeader && (
        <div>
          <h1 className="text-3xl font-bold text-foreground">Documentação</h1>
          <p className="text-muted-foreground mt-1">
            Arquitetura, segurança e referência de API da plataforma
          </p>
        </div>
        )}

        <Tabs defaultValue="architecture" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="architecture" className="gap-2">
              <BookOpen className="h-4 w-4" />
              Arquitetura
            </TabsTrigger>
            <TabsTrigger value="security" className="gap-2">
              <Shield className="h-4 w-4" />
              Segurança
            </TabsTrigger>
            <TabsTrigger value="api" className="gap-2">
              <Code className="h-4 w-4" />
              API
            </TabsTrigger>
          </TabsList>

          <TabsContent value="architecture" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-primary" />
                  Arquitetura do Sistema
                </CardTitle>
                <CardDescription>Visão geral técnica — C4, ADRs e inventário</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <Section title="Stack Tecnológico">
                  <div className="grid gap-2 md:grid-cols-2">
                    <TechItem label="Frontend" value="React 18 + Vite + TypeScript" />
                    <TechItem label="UI" value="shadcn/ui + Tailwind CSS" />
                    <TechItem label="Estado" value="React Query (TanStack)" />
                    <TechItem label="Roteamento" value="React Router v6" />
                    <TechItem label="Backend" value="Supabase (PostgreSQL + Auth + Storage)" />
                    <TechItem label="Edge Functions" value="Deno (70+ funções)" />
                    <TechItem label="Fluxos" value="XY Flow (React Flow)" />
                    <TechItem label="Monitoramento" value="Sentry" />
                  </div>
                </Section>

                <Section title="Diagrama C4 — Nível Container">
                  <pre className="bg-muted p-4 rounded-lg text-xs overflow-x-auto font-mono leading-relaxed">
{`┌──────────────────────────────────────────┐
│            USERS (Browser)                │
│  ┌──────────────────────────────────────┐ │
│  │     React SPA (Vite + TypeScript)    │ │
│  │  shadcn/ui + Tailwind + React Query  │ │
│  └──────────────┬───────────────────────┘ │
└─────────────────┼─────────────────────────┘
                  │ HTTPS
┌─────────────────┼─────────────────────────┐
│           SUPABASE PLATFORM               │
│  ┌──────────────┴───────────────────────┐ │
│  │        Edge Functions (Deno)          │ │
│  │  70+ funções serverless               │ │
│  └──────────────┬───────────────────────┘ │
│  ┌──────────────┴───────────────────────┐ │
│  │     PostgreSQL + RLS + Auth           │ │
│  │     + Storage + Realtime              │ │
│  └──────────────────────────────────────┘ │
└───────────────────────────────────────────┘
                  │
        ┌─────────┴─────────┐
        │   Z-API (WhatsApp)  │
        │   OpenAI / Gemini   │
        │   Google Calendar   │
        └─────────────────────┘`}
                  </pre>
                </Section>

                <Section title="ADRs (Architecture Decision Records)">
                  <div className="space-y-3">
                    <ADRItem 
                      number={1}
                      title="Supabase como Backend-as-a-Service"
                      rationale="Elimina necessidade de gerenciar infra. RLS nativo garante multi-tenancy."
                    />
                    <ADRItem 
                      number={2}
                      title="Edge Functions (Deno) para lógica server-side"
                      rationale="Deploy integrado ao Supabase, cold start < 200ms, TypeScript nativo."
                    />
                    <ADRItem 
                      number={3}
                      title="React Query para estado do servidor"
                      rationale="Cache automático, revalidação, dedup de requests. Elimina Redux."
                    />
                    <ADRItem 
                      number={4}
                      title="XY Flow para visual flow builder"
                      rationale="Biblioteca React nativa para diagramas node-edge. Extensível com nós customizados."
                    />
                    <ADRItem 
                      number={5}
                      title="Roles em tabela separada (user_roles)"
                      rationale="Previne privilege escalation. Validação server-side com SECURITY DEFINER."
                    />
                  </div>
                </Section>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="security" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-primary" />
                  Modelo de Segurança
                </CardTitle>
                <CardDescription>Threat model, RBAC, isolamento de dados</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <Section title="Camadas de Proteção">
                  <div className="space-y-2">
                    <SecurityItem title="RLS (Row Level Security)" status="active" description="Todas as tabelas com políticas por organization_id" />
                    <SecurityItem title="has_role_in_org()" status="active" description="Verificação de role com escopo por organização" />
                    <SecurityItem title="CSP (Content Security Policy)" status="active" description="Restrição de origens de scripts e conexões" />
                    <SecurityItem title="Sanitização HTML" status="active" description="DOMParser remove scripts, iframes, event handlers" />
                    <SecurityItem title="Sentry Error Boundary" status="active" description="Captura e reporta erros em produção" />
                    <SecurityItem title="CI/CD Pipeline" status="active" description="Lint + TypeCheck + Testes em cada push" />
                  </div>
                </Section>

                <Section title="Vulnerabilidades Corrigidas">
                  <div className="space-y-2">
                    <VulnItem severity="critical" title="Privilege escalation via is_platform_admin()" fixed />
                    <VulnItem severity="critical" title="Cross-org escalation via has_role() sem escopo" fixed />
                    <VulnItem severity="critical" title="Profile injection em qualquer organização" fixed />
                    <VulnItem severity="critical" title="Transcrições expostas cross-tenant" fixed />
                    <VulnItem severity="critical" title="PII de formulários exposta (widget_submissions)" fixed />
                    <VulnItem severity="critical" title="Logs de IA expostos cross-tenant" fixed />
                    <VulnItem severity="warn" title="API keys visíveis para membros não-admin" fixed />
                    <VulnItem severity="warn" title="WhatsApp INSERT aberto para qualquer usuário" fixed />
                  </div>
                </Section>

                <Section title="RBAC — Controle de Acesso">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-2 text-muted-foreground font-medium">Recurso</th>
                          <th className="text-center py-2 text-muted-foreground font-medium">Owner</th>
                          <th className="text-center py-2 text-muted-foreground font-medium">Admin</th>
                          <th className="text-center py-2 text-muted-foreground font-medium">Agent</th>
                        </tr>
                      </thead>
                      <tbody className="text-foreground">
                        <RBACRow resource="Conversas" owner="✅" admin="✅" agent="✅ (próprias)" />
                        <RBACRow resource="Contatos" owner="✅" admin="✅" agent="✅" />
                        <RBACRow resource="API Keys (OpenAI/Gemini)" owner="✅" admin="✅" agent="❌" />
                        <RBACRow resource="WhatsApp Instances" owner="✅" admin="✅" agent="❌" />
                        <RBACRow resource="OAuth Tokens" owner="✅" admin="✅" agent="❌" />
                        <RBACRow resource="User Roles" owner="✅ (não platform_admin)" admin="❌" agent="❌" />
                        <RBACRow resource="Painel Admin" owner="❌" admin="❌" agent="❌ (só platform_admin)" />
                      </tbody>
                    </table>
                  </div>
                </Section>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="api" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Server className="h-5 w-5 text-primary" />
                  Referência de API — Edge Functions
                </CardTitle>
                <CardDescription>70+ funções serverless no Supabase Edge</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <Section title="Categorias de Funções">
                  <div className="grid gap-3 md:grid-cols-2">
                    <FunctionCategory 
                      title="WhatsApp (Z-API)"
                      count={18}
                      functions={['zapi-webhook', 'zapi-send-message', 'zapi-sync-chats', 'zapi-get-qrcode', 'zapi-create-instance']}
                    />
                    <FunctionCategory 
                      title="IA & Agentes"
                      count={6}
                      functions={['analyze-conversation', 'train-ai-agent', 'generate-agent-prompt', 'agent-orchestrator']}
                    />
                    <FunctionCategory 
                      title="Documentos"
                      count={6}
                      functions={['generate-document-pdf', 'process-document-template', 'capture-signature', 'public-template']}
                    />
                    <FunctionCategory 
                      title="Automação"
                      count={8}
                      functions={['flow-execute', 'flow-to-prompt', 'prompt-to-flow', 'process-campaign-queue', 'process-scheduled-messages']}
                    />
                    <FunctionCategory 
                      title="Google Integrations"
                      count={6}
                      functions={['google-calendar-auth', 'google-calendar-book', 'google-drive-auth', 'google-drive-backup']}
                    />
                    <FunctionCategory 
                      title="Admin & Auth"
                      count={4}
                      functions={['admin-dashboard', 'admin-governance', 'create-user', 'delete-user']}
                    />
                  </div>
                </Section>

                <Section title="Autenticação das Funções">
                  <div className="bg-muted p-4 rounded-lg text-sm space-y-2">
                    <p><strong>Método:</strong> Bearer token via <code className="bg-background px-1 rounded">Authorization</code> header</p>
                    <p><strong>JWT:</strong> Validado via Supabase Auth (anon key para públicas)</p>
                    <p><strong>Service Role:</strong> Apenas para funções internas (nunca exposta ao client)</p>
                    <p><strong>Webhook:</strong> Validação via <code className="bg-background px-1 rounded">x-webhook-token</code> header</p>
                  </div>
                </Section>

                <Section title="Padrão de Invocação">
                  <pre className="bg-muted p-4 rounded-lg text-xs overflow-x-auto font-mono">
{`// Client-side (React)
const { data } = await supabase.functions.invoke('function-name', {
  body: { param1: 'value' },
});

// Ou via URL direta
const url = \`https://\${VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/function-name\`;
const res = await fetch(url, {
  method: 'POST',
  headers: {
    'Authorization': \`Bearer \${session.access_token}\`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ param1: 'value' }),
});`}
                  </pre>
                </Section>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
    </div>
  );
}

export default function AdminDocsPage() {
  return (
    <AdminLayout>
      <AdminDocsContent />
    </AdminLayout>
  );
}

// Sub-components

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground mb-3 uppercase tracking-wider">{title}</h3>
      {children}
    </div>
  );
}

function TechItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-1.5 px-3 rounded-lg bg-muted/50">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

function ADRItem({ number, title, rationale }: { number: number; title: string; rationale: string }) {
  return (
    <div className="border border-border rounded-lg p-3">
      <div className="flex items-center gap-2 mb-1">
        <Badge variant="outline" className="text-xs">ADR-{String(number).padStart(3, '0')}</Badge>
        <span className="text-sm font-medium text-foreground">{title}</span>
      </div>
      <p className="text-xs text-muted-foreground">{rationale}</p>
    </div>
  );
}

function SecurityItem({ title, status, description }: { title: string; status: 'active' | 'inactive'; description: string }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <CheckCircle2 className={`h-4 w-4 mt-0.5 flex-shrink-0 ${status === 'active' ? 'text-emerald-500' : 'text-destructive'}`} />
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function VulnItem({ severity, title, fixed }: { severity: 'critical' | 'warn'; title: string; fixed: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-muted/50">
      <div className="flex items-center gap-2">
        <Badge className={
          severity === 'critical'
            ? 'bg-destructive/10 text-destructive border-destructive/20 text-[10px]'
            : 'bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px]'
        }>
          {severity === 'critical' ? 'CRÍTICO' : 'AVISO'}
        </Badge>
        <span className="text-sm text-foreground">{title}</span>
      </div>
      {fixed && <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px]">CORRIGIDO</Badge>}
    </div>
  );
}

function RBACRow({ resource, owner, admin, agent }: { resource: string; owner: string; admin: string; agent: string }) {
  return (
    <tr className="border-b border-border/50">
      <td className="py-2">{resource}</td>
      <td className="text-center py-2">{owner}</td>
      <td className="text-center py-2">{admin}</td>
      <td className="text-center py-2">{agent}</td>
    </tr>
  );
}

function FunctionCategory({ title, count, functions }: { title: string; count: number; functions: string[] }) {
  return (
    <div className="border border-border rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-foreground">{title}</span>
        <Badge variant="outline" className="text-xs">{count} funções</Badge>
      </div>
      <div className="flex flex-wrap gap-1">
        {functions.map((fn) => (
          <code key={fn} className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{fn}</code>
        ))}
      </div>
    </div>
  );
}
