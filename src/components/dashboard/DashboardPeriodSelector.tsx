import { Filter } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useDashboardPeriod, DashboardPeriodKind } from '@/contexts/DashboardPeriodContext';

const OPTIONS: { value: DashboardPeriodKind; label: string }[] = [
  { value: 'today', label: 'Hoje' },
  { value: '7d', label: 'Últimos 7 dias' },
  { value: '30d', label: 'Últimos 30 dias' },
  { value: '90d', label: 'Últimos 90 dias' },
  { value: 'custom', label: 'Personalizado' },
];

export function DashboardPeriodSelector() {
  const { periodKind, setPeriodKind, customFrom, setCustomFrom, customTo, setCustomTo } = useDashboardPeriod();

  return (
    <div className="flex items-center gap-2">
      <Select value={periodKind} onValueChange={(v) => setPeriodKind(v as DashboardPeriodKind)}>
        <SelectTrigger className="h-9 w-[180px]">
          <Filter className="mr-1 h-3.5 w-3.5" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {OPTIONS.map((p) => (
            <SelectItem key={p.value} value={p.value}>
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {periodKind === 'custom' && (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9">
              {customFrom} → {customTo}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-3 space-y-2" align="end">
            <div className="space-y-1">
              <Label className="text-xs">De</Label>
              <Input type="date" value={customFrom} max={customTo} onChange={(e) => setCustomFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Até</Label>
              <Input type="date" value={customTo} min={customFrom} onChange={(e) => setCustomTo(e.target.value)} />
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
