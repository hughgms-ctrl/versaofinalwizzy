import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { useAdminGovernance } from '@/hooks/useAdminDashboard';
import { ScrollText, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';

const phaseLabels: Record<string, string> = {
  security: 'Segurança',
  backend: 'Backend',
  continuity: 'Continuidade',
  ux: 'Experiência do Usuário',
};

const statusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  done: { label: 'Concluído', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20', icon: CheckCircle2 },
  pending: { label: 'Pendente', color: 'bg-amber-500/10 text-amber-600 border-amber-500/20', icon: Clock },
  failed: { label: 'Falhou', color: 'bg-destructive/10 text-destructive border-destructive/20', icon: AlertTriangle },
};

export default function AdminGovernancePage() {
  const { data, isLoading } = useAdminGovernance();
  const checks = data?.checks || [];

  // Calculate maturity score
  const totalWeight = checks.reduce((sum: number, c: any) => sum + (Number(c.weight) || 0), 0);
  const doneWeight = checks.filter((c: any) => c.status === 'done').reduce((sum: number, c: any) => sum + (Number(c.weight) || 0), 0);
  const maturityScore = totalWeight > 0 ? Math.round((doneWeight / totalWeight) * 100) : 0;

  // Group by phase
  const phases = checks.reduce((acc: Record<string, any[]>, check: any) => {
    const phase = check.phase || 'other';
    if (!acc[phase]) acc[phase] = [];
    acc[phase].push(check);
    return acc;
  }, {});

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Governança</h1>
          <p className="text-muted-foreground mt-1">Maturidade técnica e conformidade da plataforma</p>
        </div>

        {/* Maturity Score */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ScrollText className="h-5 w-5 text-primary" />
              Score de Maturidade
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              <div className="space-y-3">
                <div className="flex items-end gap-3">
                  <span className="text-5xl font-bold text-foreground">{maturityScore}</span>
                  <span className="text-xl text-muted-foreground mb-1">/100</span>
                </div>
                <Progress value={maturityScore} className="h-3" />
                <p className="text-sm text-muted-foreground">
                  {checks.filter((c: any) => c.status === 'done').length} de {checks.length} verificações concluídas
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Checks by phase */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-40 w-full" />)}
          </div>
        ) : (
          Object.entries(phases).map(([phase, items]) => (
            <Card key={phase}>
              <CardHeader>
                <CardTitle className="text-base">{phaseLabels[phase] || phase}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {(items as any[]).map((check: any) => {
                    const cfg = statusConfig[check.status] || statusConfig.pending;
                    const Icon = cfg.icon;
                    return (
                      <div key={check.id} className="flex items-start gap-3 py-2 border-b border-border last:border-0">
                        <Icon className="h-5 w-5 mt-0.5 flex-shrink-0 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-foreground">{check.name}</p>
                            {check.is_blocker && <Badge variant="destructive" className="text-xs">Blocker</Badge>}
                          </div>
                          <p className="text-sm text-muted-foreground">{check.description}</p>
                          {check.notes && <p className="text-xs text-muted-foreground mt-1 italic">{check.notes}</p>}
                        </div>
                        <Badge className={cfg.color}>{cfg.label}</Badge>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))
        )}

        {!isLoading && checks.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Nenhuma verificação de governança configurada.
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}