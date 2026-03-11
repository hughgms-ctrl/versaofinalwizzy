import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useGovernanceDashboard, useIssueCertification, useRecordScore } from '@/hooks/useGovernance';
import {
  Shield, AlertTriangle, TrendingUp, Award
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

const PHASE_CONFIG: Record<string, { label: string; weight: string }> = {
  security: { label: 'Segurança', weight: '30%' },
  backend: { label: 'Backend', weight: '20%' },
  continuity: { label: 'Continuidade', weight: '20%' },
  help: { label: 'Ajuda', weight: '10%' },
  ux: { label: 'UX', weight: '10%' },
  governance: { label: 'Governança', weight: '10%' },
};

function CircularScore({ score, size = 120, strokeWidth = 8, label }: { score: number; size?: number; strokeWidth?: number; label?: string }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 85 ? 'hsl(142, 71%, 45%)' : score >= 60 ? 'hsl(38, 92%, 50%)' : 'hsl(0, 84%, 60%)';

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke="hsl(var(--muted))" strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke={color} strokeWidth={strokeWidth}
            strokeDasharray={circumference} strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-700 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-foreground">{score}</span>
          <span className="text-xs text-muted-foreground">/100</span>
        </div>
      </div>
      {label && <span className="text-xs text-muted-foreground text-center">{label}</span>}
    </div>
  );
}

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
  const criticalCount = (scores?.criticalFailures || []).length;

  const riskConfig = {
    low: { label: 'Risco Baixo', color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/30', icon: Shield },
    medium: { label: 'Risco Médio', color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/30', icon: AlertTriangle },
    high: { label: 'Risco Alto', color: 'text-destructive', bg: 'bg-red-50 dark:bg-red-950/30', icon: AlertTriangle },
  };
  const risk = riskConfig[riskLevel as keyof typeof riskConfig] || riskConfig.low;
  const RiskIcon = risk.icon;

  return (
    <div className="space-y-6">
      {/* Top 3 Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Score de Maturidade */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              Score de Maturidade
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center pb-4">
            <CircularScore score={totalScore} size={140} strokeWidth={10} />
            <span className="text-sm text-muted-foreground mt-1">Score Geral</span>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => recordScore.mutate()}>
              <TrendingUp className="h-3.5 w-3.5 mr-1.5" />
              Registrar Snapshot
            </Button>
          </CardContent>
        </Card>

        {/* Indicador de Risco */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              Indicador de Risco
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center pb-4">
            <div className={`rounded-xl p-6 w-full flex flex-col items-center ${risk.bg}`}>
              <RiskIcon className={`h-10 w-10 mb-2 ${risk.color}`} />
              <span className={`text-lg font-bold ${risk.color}`}>{risk.label}</span>
              <span className="text-xs text-muted-foreground mt-1">{criticalCount} falha(s) detectada(s)</span>
            </div>
            {criticalCount === 0 && (
              <div className="flex items-center gap-1.5 mt-3 text-emerald-600 text-sm">
                <Shield className="h-4 w-4" />
                Nenhuma falha detectada
              </div>
            )}
          </CardContent>
        </Card>

        {/* Selo de Certificação */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Award className="h-4 w-4 text-muted-foreground" />
              Selo de Certificação
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center pb-4">
            {currentCertValid ? (
              <>
                <div className="rounded-full bg-emerald-50 dark:bg-emerald-950/30 p-4 mb-2">
                  <Award className="h-10 w-10 text-emerald-600" />
                </div>
                <span className="font-bold text-sm text-emerald-700 dark:text-emerald-400 tracking-wide">ARQUITETURA APROVADA</span>
                <span className="text-xs text-muted-foreground mt-1">
                  Certificado em {new Date(currentCertification?.issued_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="text-xs text-muted-foreground">Score: {currentCertification?.score}/100</span>
              </>
            ) : (
              <>
                <div className="rounded-full bg-muted p-4 mb-2">
                  <Award className="h-10 w-10 text-muted-foreground" />
                </div>
                <span className="text-sm text-muted-foreground text-center">
                  {canCertify ? 'Requisitos atingidos!' : 'Score ≥ 85 e Segurança ≥ 90%'}
                </span>
                <Button
                  size="sm" className="mt-3"
                  disabled={!canCertify || issueCert.isPending}
                  onClick={() => issueCert.mutate()}
                >
                  <Award className="h-3.5 w-3.5 mr-1.5" />
                  Emitir Certificação
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Score por Categoria */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Score por Categoria (pesos)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {Object.entries(PHASE_CONFIG).map(([phase, cfg]) => {
              const phaseScore = scores?.phaseScores?.[phase] || 0;
              const maxScore = parseInt(cfg.weight);
              const pct = maxScore > 0 ? Math.round((phaseScore / maxScore) * 100) : 0;
              return (
                <CircularScore key={phase} score={pct} size={90} strokeWidth={6} label={`${cfg.label} (${cfg.weight})`} />
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Evolução Temporal */}
      {scoreHistory && scoreHistory.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
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
                  <Line type="monotone" dataKey="total_score" name="Score Total" stroke="hsl(142, 71%, 45%)" strokeWidth={2} dot={false} />
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
