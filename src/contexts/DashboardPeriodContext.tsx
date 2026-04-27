import { createContext, useContext, useMemo, useState, ReactNode } from 'react';
import { startOfDay, subDays, endOfDay, format } from 'date-fns';

export type DashboardPresetPeriod = 'today' | '7d' | '30d' | '90d';
export type DashboardPeriodKind = DashboardPresetPeriod | 'custom';
export type DashboardPeriod = DashboardPresetPeriod | { from: string; to: string };

interface DashboardPeriodContextValue {
  periodKind: DashboardPeriodKind;
  setPeriodKind: (k: DashboardPeriodKind) => void;
  customFrom: string;
  setCustomFrom: (s: string) => void;
  customTo: string;
  setCustomTo: (s: string) => void;
  period: DashboardPeriod;
  /** Resolved ISO range based on the active period selection */
  range: { sinceISO: string; untilISO: string };
  /** Stable string key for react-query keys */
  periodKey: string;
}

const Ctx = createContext<DashboardPeriodContextValue | undefined>(undefined);

export function DashboardPeriodProvider({ children }: { children: ReactNode }) {
  const [periodKind, setPeriodKind] = useState<DashboardPeriodKind>('today');
  const today = format(new Date(), 'yyyy-MM-dd');
  const [customFrom, setCustomFrom] = useState<string>(today);
  const [customTo, setCustomTo] = useState<string>(today);

  const value = useMemo<DashboardPeriodContextValue>(() => {
    const period: DashboardPeriod =
      periodKind === 'custom' ? { from: customFrom, to: customTo } : periodKind;

    let sinceISO: string;
    let untilISO: string;
    if (typeof period === 'string') {
      const daysMap: Record<DashboardPresetPeriod, number> = { today: 0, '7d': 7, '30d': 30, '90d': 90 };
      const days = daysMap[period];
      sinceISO = days === 0 ? startOfDay(new Date()).toISOString() : subDays(new Date(), days).toISOString();
      untilISO = endOfDay(new Date()).toISOString();
    } else {
      sinceISO = startOfDay(new Date(period.from)).toISOString();
      untilISO = endOfDay(new Date(period.to)).toISOString();
    }

    const periodKey = typeof period === 'string' ? period : `custom:${period.from}:${period.to}`;

    return {
      periodKind,
      setPeriodKind,
      customFrom,
      setCustomFrom,
      customTo,
      setCustomTo,
      period,
      range: { sinceISO, untilISO },
      periodKey,
    };
  }, [periodKind, customFrom, customTo]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDashboardPeriod() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useDashboardPeriod must be used within DashboardPeriodProvider');
  return ctx;
}
