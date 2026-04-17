import { useState } from 'react';
import {
  Wallet,
  Briefcase,
  Megaphone,
  Receipt,
  TrendingUp,
  PiggyBank,
  Target,
  Scale,
} from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { LegalDashboardHeader } from '@/components/legal-dashboard/LegalDashboardHeader';
import { KpiCard } from '@/components/legal-dashboard/KpiCard';
import { FunnelChart } from '@/components/legal-dashboard/FunnelChart';
import { ProfitCard } from '@/components/legal-dashboard/ProfitCard';
import { AdMetricsRow } from '@/components/legal-dashboard/AdMetricsRow';
import { MiniMetricCard } from '@/components/legal-dashboard/MiniMetricCard';
import { AddAdCostDialog } from '@/components/legal-dashboard/AddAdCostDialog';
import {
  MOCK_AD_METRICS,
  MOCK_CLIENTS,
  MOCK_FUNNEL,
  MOCK_KPIS,
  MOCK_MINI_METRICS,
  MOCK_PROFIT,
  type ClientOption,
  type PeriodKey,
} from '@/data/legalDashboardMock';

const KPI_ICONS = {
  revenue: Wallet,
  cogs: Briefcase,
  marketing: Megaphone,
  taxes: Receipt,
} as const;

const MINI_ICONS = {
  roi: TrendingUp,
  margin: PiggyBank,
  ticket: Target,
} as const;

export default function LegalDashboardPage() {
  const [client, setClient] = useState<ClientOption>(MOCK_CLIENTS[0]);
  const [period, setPeriod] = useState<PeriodKey>('today');
  const [adDialogOpen, setAdDialogOpen] = useState(false);

  return (
    <MainLayout fullWidth>
      <div
        className="relative min-h-[calc(100vh-4rem)] bg-[#0a0e1a] p-4 md:p-8"
        style={{
          backgroundImage:
            'radial-gradient(circle at 0% 0%, rgba(20,184,166,0.08), transparent 50%), radial-gradient(circle at 100% 0%, rgba(6,182,212,0.06), transparent 50%), linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)',
          backgroundSize: '100% 100%, 100% 100%, 32px 32px, 32px 32px',
        }}
      >
        {/* Page title */}
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-xl border border-teal-400/30 bg-teal-500/10 p-2 text-teal-300 shadow-[0_0_18px_-4px] shadow-teal-500/40">
            <Scale className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white md:text-2xl">Dashboard Jurídico</h1>
            <p className="text-xs text-white/50">Visão financeira, funil de vendas e captação</p>
          </div>
        </div>

        {/* Header */}
        <LegalDashboardHeader
          client={client}
          onClientChange={setClient}
          period={period}
          onPeriodChange={setPeriod}
          onAddAdCost={() => setAdDialogOpen(true)}
        />

        {/* KPI grid */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {MOCK_KPIS.map((kpi) => (
            <KpiCard
              key={kpi.key}
              data={kpi}
              icon={KPI_ICONS[kpi.key as keyof typeof KPI_ICONS]}
              invertDelta={kpi.key === 'cogs' || kpi.key === 'taxes'}
            />
          ))}
        </div>

        {/* Funnel + Profit */}
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <FunnelChart stages={MOCK_FUNNEL} />
          </div>
          <ProfitCard value={MOCK_PROFIT.value} delta={MOCK_PROFIT.delta} spark={MOCK_PROFIT.spark} />
        </div>

        {/* Ad metrics */}
        <div className="mt-4">
          <AdMetricsRow metrics={MOCK_AD_METRICS} />
        </div>

        {/* Mini metrics */}
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {MOCK_MINI_METRICS.map((m) => (
            <MiniMetricCard key={m.key} data={m} icon={MINI_ICONS[m.key as keyof typeof MINI_ICONS]} />
          ))}
        </div>

        {/* Footer hint */}
        <p className="mt-6 text-center text-xs text-white/30">
          Dados demonstrativos · integrações reais (Meta Ads, Asaas, DataJud) chegam nas próximas fases
        </p>
      </div>

      <AddAdCostDialog open={adDialogOpen} onOpenChange={setAdDialogOpen} />
    </MainLayout>
  );
}
