// Mock data for the Legal Dashboard (Phase 1 — visual only)

export type PeriodKey = 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'custom';

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  today: 'Hoje',
  yesterday: 'Ontem',
  '7d': 'Últimos 7 dias',
  '30d': 'Últimos 30 dias',
  month: 'Este mês',
  custom: 'Personalizado',
};

export interface KpiData {
  key: string;
  label: string;
  value: number;
  delta: number; // percentage variation
  format: 'currency' | 'percent' | 'number';
}

export interface FunnelStage {
  key: string;
  label: string;
  count: number;
  conversion?: number; // % from previous stage
}

export interface AdMetric {
  key: string;
  label: string;
  value: string;
  hint: string;
  delta: number;
}

export interface MiniMetric {
  key: string;
  label: string;
  value: string;
  delta: number;
}

export interface ClientOption {
  id: string;
  name: string;
  type: string;
}

export const MOCK_CLIENTS: ClientOption[] = [
  { id: 'all', name: 'Todos os clientes', type: 'Visão geral do escritório' },
  { id: '1', name: 'Construtora Aurora Ltda.', type: 'Cível — Contratual' },
  { id: '2', name: 'Maria Silveira', type: 'Previdenciário' },
  { id: '3', name: 'Tech Foods S.A.', type: 'Trabalhista' },
  { id: '4', name: 'Pedro Henrique Almeida', type: 'Família' },
];

export const MOCK_KPIS: KpiData[] = [
  { key: 'revenue', label: 'Receita Líquida', value: 184250, delta: 12.5, format: 'currency' },
  { key: 'cogs', label: 'Custo dos Serviços', value: 42180, delta: -3.2, format: 'currency' },
  { key: 'marketing', label: 'Marketing', value: 13480, delta: 8.1, format: 'currency' },
  { key: 'taxes', label: 'Impostos / Taxas', value: 27640, delta: 1.0, format: 'currency' },
];

export const MOCK_FUNNEL: FunnelStage[] = [
  { key: 'lead', label: 'Lead', count: 1240 },
  { key: 'meeting', label: 'Reunião', count: 380, conversion: 30.6 },
  { key: 'proposal', label: 'Proposta', count: 142, conversion: 37.4 },
  { key: 'contract', label: 'Contrato Fechado', count: 47, conversion: 33.1 },
];

export const MOCK_PROFIT = {
  value: 84320,
  delta: 18.2,
  // 7 bars (last 7 periods) — relative heights 0–100
  spark: [42, 58, 51, 70, 64, 88, 76],
};

export const MOCK_AD_METRICS: AdMetric[] = [
  { key: 'cpm', label: 'CPM', value: 'R$ 18,40', hint: 'Custo por mil', delta: -4.2 },
  { key: 'ctr', label: 'CTR', value: '3,84%', hint: 'Taxa de cliques', delta: 6.7 },
  { key: 'cpc', label: 'CPC', value: 'R$ 0,48', hint: 'Custo por clique', delta: -2.1 },
  { key: 'cpa', label: 'CPA', value: 'R$ 287', hint: 'Custo por contrato', delta: -8.4 },
  { key: 'roas', label: 'ROAS', value: '4,2x', hint: 'Retorno sobre Ads', delta: 11.5 },
];

export const MOCK_MINI_METRICS: MiniMetric[] = [
  { key: 'roi', label: 'ROI', value: '187%', delta: 9.4 },
  { key: 'margin', label: 'Margem de Lucro', value: '42%', delta: 2.8 },
  { key: 'ticket', label: 'Ticket Médio', value: 'R$ 1.812', delta: 5.6 },
];

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatCompact(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}
