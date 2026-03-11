import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useGovernanceDashboard, useGovernancePrompts } from '@/hooks/useGovernance';
import { BookOpen, Copy, CheckCircle2, ChevronDown, FileText } from 'lucide-react';
import { toast } from 'sonner';

const PHASES = [
  { value: 'security', label: 'Segurança', number: 1 },
  { value: 'backend', label: 'Backend', number: 2 },
  { value: 'continuity', label: 'Backup & Continuidade', number: 3 },
  { value: 'help', label: 'Ajuda', number: 4 },
  { value: 'ux', label: 'UX / Educação', number: 5 },
  { value: 'governance', label: 'Governança', number: 6 },
];

// Map prompt categories to phase values
const CATEGORY_TO_PHASE: Record<string, string> = {
  'Segurança': 'security',
  'Backend': 'backend',
  'Infraestrutura': 'backend',
  'Continuidade': 'continuity',
  'Ajuda': 'help',
  'UX': 'ux',
  'Governança': 'governance',
};

// Built-in generic prompts
const BUILTIN_PROMPTS = [
  {
    phase: 'security',
    name: 'Implementar RBAC com papéis e permissões granulares',
    problem: 'Sem controle de acesso, qualquer usuário autenticado pode acessar dados e funcionalidades administrativas, expondo dados sensíveis e permitindo ações destrutivas.',
    content: `Roles MUST be stored in a separate table (user_roles). Never on profiles.\nCreate enum: CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');\nCreate table: user_roles (id, user_id, role, UNIQUE(user_id, role))\nCreate SECURITY DEFINER function: has_role(user_id, role) -> boolean\nUse in RLS policies: USING (has_role(auth.uid(), 'admin'))`,
  },
  {
    phase: 'security',
    name: 'Configurar RLS em todas as tabelas com dados de usuário',
    problem: 'Sem RLS, qualquer usuário pode ler, modificar ou deletar dados de outros usuários através de chamadas diretas à API.',
    content: `Every public table MUST have RLS enabled.\nUse SECURITY DEFINER helper functions to avoid recursive RLS.\nPattern: organization_id = get_user_org_id(auth.uid())\nNever use USING(true) for INSERT/UPDATE/DELETE operations.`,
  },
  {
    phase: 'security',
    name: 'Implementar Rate Limiting para endpoints críticos',
    problem: 'Sem rate limiting, o sistema fica vulnerável a ataques de força bruta, abuso de recursos de IA e scraping automatizado.',
    content: `Implement rate limiting on:\n- Auth endpoints (login, signup, reset)\n- AI/LLM calls (token-expensive)\n- Public webhooks\n- File uploads\nUse sliding window counters or token bucket algorithm.`,
  },
  {
    phase: 'backend',
    name: 'Validação server-side em todas as Edge Functions',
    problem: 'Sem validação server-side, dados maliciosos podem ser injetados, causando corrupção de dados ou acesso não autorizado.',
    content: `Every Edge Function must:\n1. Extract Bearer token\n2. Verify user via supabase.auth.getUser()\n3. Check permissions server-side\n4. Validate all input with Zod\n5. Never trust client-sent permissions`,
  },
  {
    phase: 'continuity',
    name: 'Configurar backup automatizado criptografado',
    problem: 'Sem backup, perda de dados por falha humana, ataque ou bug pode ser irreversível.',
    content: `Implement automated backup:\n- Google Drive / S3 integration\n- Configurable frequency\n- Encrypt sensitive data\n- Test restore regularly\n- Maintain backup logs`,
  },
  {
    phase: 'governance',
    name: 'Dashboard de maturidade técnica',
    problem: 'Sem métricas, não há como medir objetivamente a qualidade do projeto.',
    content: `Implement maturity scoring (0-100) across 6 dimensions:\n- Security (30%): RLS, RBAC, input validation\n- Backend (20%): Edge functions, DB design\n- Continuity (20%): Backups, monitoring\n- Help (10%): Documentation, error messages\n- UX (10%): Responsive, accessibility\n- Governance (10%): Versioned prompts, audit logs`,
  },
];

export function GovernanceLibraryTab() {
  const { data: dashData } = useGovernanceDashboard();
  const { data: promptsData, isLoading } = useGovernancePrompts();

  const checks = dashData?.checks || [];
  const dbPrompts = (promptsData?.prompts || []).filter((p: any) => p.is_generic);

  if (isLoading) {
    return <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-20" />)}</div>;
  }

  return (
    <div className="space-y-6">
      {PHASES.map((phase) => {
        const phaseChecks = checks.filter((c: any) => c.phase === phase.value);
        const doneCount = phaseChecks.filter((c: any) => c.status === 'done').length;
        const hasBlocker = phaseChecks.some((c: any) => c.is_blocker);

        // Get prompts for this phase (built-in + db generic prompts)
        const builtinForPhase = BUILTIN_PROMPTS.filter(p => p.phase === phase.value);
        const dbForPhase = dbPrompts.filter((p: any) => CATEGORY_TO_PHASE[p.category] === phase.value);
        const allPromptsForPhase = [...builtinForPhase, ...dbForPhase.map((p: any) => ({
          phase: phase.value,
          name: p.name,
          problem: p.description,
          content: p.content,
        }))];

        if (phaseChecks.length === 0 && allPromptsForPhase.length === 0) return null;

        return (
          <Card key={phase.value} className="overflow-hidden">
            <div className="px-6 pt-5 pb-4">
              {/* Phase header */}
              <div className="flex items-center gap-3 mb-3">
                <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
                  doneCount === phaseChecks.length && phaseChecks.length > 0 ? 'bg-emerald-100 dark:bg-emerald-950/40' : 'bg-muted'
                }`}>
                  {doneCount === phaseChecks.length && phaseChecks.length > 0 ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  ) : (
                    <span className="text-sm font-bold text-muted-foreground">{phase.number}</span>
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">FASE {phase.number} — {phase.label}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {doneCount}/{phaseChecks.length} completo
                    {hasBlocker && ' • BLOQUEANTE'}
                  </span>
                </div>
              </div>

              {/* Check items */}
              {phaseChecks.length > 0 && (
                <div className="space-y-1 ml-2 mb-4">
                  {phaseChecks.map((check: any) => (
                    <div key={check.id} className="flex items-center gap-2.5 py-1">
                      <CheckCircle2 className={`h-4.5 w-4.5 flex-shrink-0 ${
                        check.status === 'done' ? 'text-emerald-500' : 'text-muted-foreground/30'
                      }`} />
                      <span className={`text-sm ${check.status === 'done' ? 'text-muted-foreground' : 'text-foreground'}`}>
                        {check.name}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Generic prompts for this phase */}
              {allPromptsForPhase.length > 0 && (
                <div className="mt-3">
                  <div className="flex items-center gap-1.5 mb-3">
                    <FileText className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium text-primary">Prompts Genéricos para esta Fase</span>
                  </div>
                  <div className="space-y-2">
                    {allPromptsForPhase.map((prompt, idx) => (
                      <PromptCard key={idx} prompt={prompt} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function PromptCard({ prompt }: { prompt: { name: string; problem: string; content: string } }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-border rounded-lg px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm text-foreground">{prompt.name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{prompt.problem}</p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
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
          <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
          </Collapsible>
        </div>
      </div>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleContent>
          <pre className="text-xs bg-muted p-3 rounded-md mt-3 overflow-x-auto whitespace-pre-wrap max-h-48">
            {prompt.content}
          </pre>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
