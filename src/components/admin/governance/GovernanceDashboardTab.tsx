import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useGovernanceDashboard, useIssueCertification, useRecordScore } from '@/hooks/useGovernance';
import {
  Shield, Server, RefreshCw, HelpCircle, Palette, ScrollText,
  Award, AlertTriangle, TrendingUp, CheckCircle2, XCircle
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

const PHASE_CONFIG: Record<string, { label: string; icon: React.ElementType; weight: string }> = {
  security: { label: 'Segurança', icon: Shield, weight: '30%' },
  backend: { label: 'Backend', icon: Server, weight: '20%' },
  continuity: { label: 'Continuidade', icon: RefreshCw, weight: '20%' },
  help: { label: 'Ajuda', icon: HelpCircle, weight: '10%' },
  ux: { label: 'UX', icon: Palette, weight: '10%' },
  governance: { label: 'Governança', icon: ScrollText, weight: '10%' },
};

export function GovernanceDashboardTab() {
  const { data, isLoading } = useGovernanceDashboard();
  const issueCert = useIssueCertification();
  const recordScore = useRecordScore();

  if (isLoading) {
    return <div className="space-y-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-40" />)}</div>;
  }

  const { scores, canCertify, currentCertification, currentCertValid, scoreHistory } = data || {};
  const totalScore = scores?.totalScore || 0;
  const riskLevel = scores?.riskLevel || 'low';
  const riskColors = { low: 'text-emerald-600', medium: 'text-amber-600', high: 'text-destructive' };
  const riskLabels = { low: 'Baixo', medium: 'Médio', high: 'Alto' };

  return (
    <div className="space-y-6">
      {/* Score + Certification + Risk */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Maturity Score */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Score de Maturidade
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2 mb-3">
              <span className="text-5xl font-bold">{totalScore}</span>
              <span className="text-xl text-muted-foreground mb-1">/100</span>
            </div>
            <Progress value={totalScore} className="h-3 mb-2" />
            <Button variant="outline" size="sm" className="mt-2" onClick={() => recordScore.mutate()}>
              Registrar Score
            </Button>
          </CardContent>
        </Card>

        {/* Risk Analysis */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Análise de Risco
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold mb-2 ${riskColors[riskLevel as keyof typeof riskColors]}`}>
              {riskLabels[riskLevel as keyof typeof riskLabels]}
            </div>
            <p className="text-sm text-muted-foreground">
              {(scores?.criticalFailures || []).length} falha(s) crítica(s) aberta(s)
            </p>
            {(scores?.criticalFailures || []).length > 0 && (
              <div className="mt-3 space-y-1">
                {scores.criticalFailures.slice(0, 3).map((f: any) => (
                  <div key={f.id} className="text-xs flex items-center gap-1.5 text-destructive">
                    <XCircle className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">{f.name}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Certification */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Award className="h-5 w-5 text-primary" />
              Certificação
            </CardTitle>
          </CardHeader>
          <CardContent>
            {currentCertValid ? (
              <div className="space-y-2">
                <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-sm px-3 py-1">
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  Arquitetura Aprovada
                </Badge>
                <p className="text-xs text-muted-foreground">
                  Score: {currentCertification?.score}/100 · Segurança: {currentCertification?.security_score}%
                </p>
                <p className="text-xs text-muted-foreground">
                  Emitida em {new Date(currentCertification?.issued_at).toLocaleDateString('pt-BR')}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  {canCertify
                    ? 'Requisitos atingidos! Emita a certificação.'
                    : 'Score ≥ 85 e Segurança ≥ 90% necessários. Sem falhas críticas.'}
                </p>
                <Button
                  size="sm"
                  disabled={!canCertify || issueCert.isPending}
                  onClick={() => issueCert.mutate()}
                >
                  <Award className="h-4 w-4 mr-2" />
                  Emitir Certificação
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Phase Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dimensões</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {Object.entries(PHASE_CONFIG).map(([phase, cfg]) => {
              const phaseScore = scores?.phaseScores?.[phase] || 0;
              const maxScore = parseInt(cfg.weight);
              const pct = maxScore > 0 ? Math.round((phaseScore / maxScore) * 100) : 0;
              const Icon = cfg.icon;
              return (
                <div key={phase} className="flex items-center gap-3 p-3 rounded-lg border border-border">
                  <Icon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">{cfg.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {phaseScore.toFixed(0)}/{maxScore} ({cfg.weight})
                      </span>
                    </div>
                    <Progress value={pct} className="h-2" />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Temporal Evolution */}
      {scoreHistory && scoreHistory.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Evolução Temporal
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={scoreHistory.map((s: any) => ({
                  ...s,
                  date: new Date(s.recorded_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
                }))}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" className="text-xs" />
                  <YAxis domain={[0, 100]} className="text-xs" />
                  <Tooltip />
                  <Line type="monotone" dataKey="total_score" name="Score Total" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="security_score" name="Segurança" stroke="#ef4444" strokeWidth={1} dot={false} strokeDasharray="4 4" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}