import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useGovernancePrompts } from '@/hooks/useGovernance';
import { BookOpen, Copy, Shield, Server, RefreshCw, HelpCircle, Palette, ScrollText } from 'lucide-react';
import { toast } from 'sonner';

const PHASE_ICONS: Record<string, React.ElementType> = {
  security: Shield,
  backend: Server,
  continuity: RefreshCw,
  help: HelpCircle,
  ux: Palette,
  governance: ScrollText,
  frontend: Palette,
  infrastructure: Server,
  logs: ScrollText,
};

const PHASE_LABELS: Record<string, string> = {
  security: 'Segurança',
  backend: 'Backend',
  continuity: 'Continuidade',
  help: 'Ajuda',
  ux: 'UX',
  governance: 'Governança',
  frontend: 'Frontend',
  infrastructure: 'Infraestrutura',
  logs: 'Logs',
};

// These are generic, reusable prompts that can be copied for any new project
const BUILTIN_PROMPTS = [
  {
    category: 'security',
    name: 'RBAC com User Roles',
    problem: 'Evitar privilege escalation armazenando roles na tabela de profiles.',
    content: `Roles MUST be stored in a separate table (user_roles). Never on profiles.
Create enum: CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');
Create table: user_roles (id, user_id, role, UNIQUE(user_id, role))
Create SECURITY DEFINER function: has_role(user_id, role) -> boolean
Use in RLS policies: USING (has_role(auth.uid(), 'admin'))`,
  },
  {
    category: 'security',
    name: 'RLS em Todas as Tabelas',
    problem: 'Garantir que nenhuma tabela seja acessível sem política de segurança.',
    content: `Every public table MUST have RLS enabled.
Use SECURITY DEFINER helper functions to avoid recursive RLS.
Pattern: organization_id = get_user_org_id(auth.uid())
Never use USING(true) for INSERT/UPDATE/DELETE operations.`,
  },
  {
    category: 'security',
    name: 'Validação Server-Side em Edge Functions',
    problem: 'Impedir que usuários manipulem requisições para acessar dados não autorizados.',
    content: `Every Edge Function must:
1. Extract Bearer token from Authorization header
2. Verify user via supabase.auth.getUser()
3. Check user role/permissions server-side
4. Use service_role client only for cross-org operations
5. Validate all input with Zod schemas`,
  },
  {
    category: 'backend',
    name: 'Estrutura de Edge Functions',
    problem: 'Padronizar a criação de Edge Functions com CORS, auth e error handling.',
    content: `Standard Edge Function template:
- CORS headers for OPTIONS preflight
- Auth verification via Bearer token
- Try/catch with proper error responses
- Service role client for privileged operations
- Input validation before processing`,
  },
  {
    category: 'continuity',
    name: 'Backup via Google Drive',
    problem: 'Garantir recuperação de dados em caso de perda.',
    content: `Implement automated backup system:
- Google Drive integration with OAuth2
- Configurable backup frequency (manual/daily/weekly)
- Backup includes: conversations, contacts, files, pipeline, tags
- Restore capability from backup files
- Backup logs with status tracking`,
  },
  {
    category: 'ux',
    name: 'Design System com Tokens Semânticos',
    problem: 'Evitar cores hardcoded e garantir consistência visual.',
    content: `All colors must use semantic design tokens from index.css.
Never use hardcoded colors (text-white, bg-black) in components.
Use: bg-background, text-foreground, bg-primary, bg-muted, etc.
Define custom tokens in :root for brand-specific colors.
Ensure proper contrast in both light and dark modes.`,
  },
  {
    category: 'governance',
    name: 'Dashboard de Maturidade',
    problem: 'Medir objetivamente a qualidade técnica do projeto.',
    content: `Implement maturity scoring (0-100) across 6 dimensions:
- Security (30%): RLS, RBAC, input validation, rate limiting
- Backend (20%): Edge functions, DB design, error handling
- Continuity (20%): Backups, monitoring, disaster recovery
- Help (10%): Documentation, onboarding, error messages
- UX (10%): Responsive design, accessibility, performance
- Governance (10%): Versioned prompts, audit logs, certifications`,
  },
];

export function GovernanceLibraryTab() {
  const { data, isLoading } = useGovernancePrompts();

  // Combine builtin + user-created generic prompts
  const allPrompts = [...BUILTIN_PROMPTS];

  // Group by category
  const grouped = allPrompts.reduce((acc: Record<string, typeof BUILTIN_PROMPTS>, p) => {
    if (!acc[p.category]) acc[p.category] = [];
    acc[p.category].push(p);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <BookOpen className="h-5 w-5 text-primary" />
        <div>
          <h3 className="font-medium">Biblioteca de Prompts Genéricos</h3>
          <p className="text-xs text-muted-foreground">Prompts reutilizáveis para qualquer projeto novo. Copie com um clique.</p>
        </div>
      </div>

      {Object.entries(grouped).map(([cat, items]) => {
        const Icon = PHASE_ICONS[cat] || ScrollText;
        const label = PHASE_LABELS[cat] || cat;
        return (
          <Card key={cat}>
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Icon className="h-4 w-4 text-primary" />
                {label}
                <Badge variant="outline" className="ml-auto">{items.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              {items.map((prompt, idx) => (
                <div key={idx} className="border border-border rounded-lg p-3">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-medium text-sm">{prompt.name}</p>
                      <p className="text-xs text-muted-foreground">{prompt.problem}</p>
                    </div>
                    <Button
                      variant="outline" size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(prompt.content);
                        toast.success('Prompt copiado!');
                      }}
                    >
                      <Copy className="h-3.5 w-3.5 mr-1" />
                      Copiar
                    </Button>
                  </div>
                  <pre className="text-xs bg-muted p-2 rounded overflow-x-auto whitespace-pre-wrap max-h-32">
                    {prompt.content}
                  </pre>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}