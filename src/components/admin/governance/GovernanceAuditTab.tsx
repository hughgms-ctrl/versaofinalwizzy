import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useGovernanceDashboard, useGovernancePrompts } from '@/hooks/useGovernance';
import { Target, Code2, Layers, Monitor, CheckCircle2, AlertTriangle } from 'lucide-react';

// Map prompt categories to audit dimensions
const AUDIT_DIMENSIONS = [
  { key: 'Backend', label: 'Backend', icon: Code2 },
  { key: 'Frontend', label: 'Frontend', icon: Layers },
  { key: 'Segurança', label: 'Segurança', icon: Target },
  { key: 'UX', label: 'UX / Educação', icon: Monitor },
  { key: 'Infraestrutura', label: 'Infraestrutura', icon: Code2 },
  { key: 'Governança', label: 'Governança', icon: Layers },
];

export function GovernanceAuditTab() {
  const { data: dashData, isLoading: dashLoading } = useGovernanceDashboard();
  const { data: promptsData, isLoading: promptsLoading } = useGovernancePrompts();

  const isLoading = dashLoading || promptsLoading;

  if (isLoading) {
    return <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16" />)}</div>;
  }

  const prompts = promptsData?.prompts || [];
  const checks = dashData?.checks || [];

  // Calculate audit per dimension: how many prompts are implemented vs total
  const dimensions = AUDIT_DIMENSIONS.map(dim => {
    const dimPrompts = prompts.filter((p: any) => p.category === dim.key);
    const total = dimPrompts.length;
    const implemented = dimPrompts.filter((p: any) => p.status === 'implemented').length;
    const pct = total > 0 ? Math.round((implemented / total) * 100) : 0;
    return { ...dim, total, implemented, pct };
  }).filter(d => d.total > 0);

  // Critical failures
  const criticalFailures = checks.filter((c: any) => c.is_blocker && c.status !== 'done');

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-5 w-5 text-muted-foreground" />
            Relatório de Risco Estrutural
          </CardTitle>
          <p className="text-sm text-muted-foreground">Análise automática de implementação vs prompts registrados</p>
        </CardHeader>
        <CardContent className="space-y-5">
          {dimensions.map(dim => {
            const Icon = dim.icon;
            return (
              <div key={dim.key} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Icon className="h-4.5 w-4.5 text-muted-foreground" />
                    <span className="font-medium text-sm text-foreground">{dim.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">{dim.implemented}/{dim.total} ({dim.pct}%)</span>
                    {dim.pct === 100 ? (
                      <CheckCircle2 className="h-4.5 w-4.5 text-emerald-500" />
                    ) : (
                      <AlertTriangle className="h-4.5 w-4.5 text-amber-500" />
                    )}
                  </div>
                </div>
                <Progress value={dim.pct} className="h-2.5" />
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Falhas Detectadas */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-muted-foreground" />
            Falhas Detectadas ({criticalFailures.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {criticalFailures.length === 0 ? (
            <div className="flex items-center gap-2 text-emerald-600">
              <CheckCircle2 className="h-4.5 w-4.5" />
              <span className="text-sm">Nenhuma falha detectada</span>
            </div>
          ) : (
            <div className="space-y-2">
              {criticalFailures.map((f: any) => (
                <div key={f.id} className="flex items-start gap-2.5 py-1.5">
                  <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{f.name}</p>
                    {f.description && <p className="text-xs text-muted-foreground">{f.description}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
