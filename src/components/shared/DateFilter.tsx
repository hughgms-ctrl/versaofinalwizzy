import { useState, useMemo } from 'react';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays, subWeeks } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar as CalendarIcon, ChevronDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface DateRange {
  from: Date | undefined;
  to: Date | undefined;
}

export type DatePreset = 'all' | 'today' | 'yesterday' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'custom';

interface DateFilterProps {
  dateRange: DateRange;
  preset: DatePreset;
  onDateChange: (range: DateRange, preset: DatePreset) => void;
}

const presetLabels: Record<DatePreset, string> = {
  all: 'Todas as datas',
  today: 'Hoje',
  yesterday: 'Ontem',
  thisWeek: 'Esta semana',
  lastWeek: 'Semana passada',
  thisMonth: 'Este mês',
  custom: 'Personalizado',
};

export function DateFilter({ dateRange, preset, onDateChange }: DateFilterProps) {
  const [open, setOpen] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  
  const today = useMemo(() => new Date(), []);

  const handlePresetSelect = (newPreset: DatePreset) => {
    if (newPreset === 'custom') {
      setCustomMode(true);
      return;
    }
    
    let from: Date | undefined;
    let to: Date | undefined;
    
    switch (newPreset) {
      case 'today':
        from = startOfDay(today);
        to = endOfDay(today);
        break;
      case 'yesterday':
        const yesterday = subDays(today, 1);
        from = startOfDay(yesterday);
        to = endOfDay(yesterday);
        break;
      case 'thisWeek':
        from = startOfWeek(today, { weekStartsOn: 0 });
        to = endOfWeek(today, { weekStartsOn: 0 });
        break;
      case 'lastWeek':
        const lastWeek = subWeeks(today, 1);
        from = startOfWeek(lastWeek, { weekStartsOn: 0 });
        to = endOfWeek(lastWeek, { weekStartsOn: 0 });
        break;
      case 'thisMonth':
        from = startOfMonth(today);
        to = endOfMonth(today);
        break;
      case 'all':
      default:
        from = undefined;
        to = undefined;
        break;
    }
    
    setCustomMode(false);
    onDateChange({ from, to }, newPreset);
    setOpen(false);
  };

  const handleCustomDateSelect = (range: DateRange | undefined) => {
    if (range) {
      onDateChange(
        { 
          from: range.from ? startOfDay(range.from) : undefined, 
          to: range.to ? endOfDay(range.to) : undefined 
        }, 
        'custom'
      );
    }
  };

  const clearFilter = () => {
    onDateChange({ from: undefined, to: undefined }, 'all');
    setCustomMode(false);
  };

  const getDisplayLabel = () => {
    if (preset === 'all') return null;
    if (preset === 'custom' && dateRange.from) {
      if (dateRange.to && dateRange.from.getTime() !== dateRange.to.getTime()) {
        return `${format(dateRange.from, 'dd/MM', { locale: ptBR })} - ${format(dateRange.to, 'dd/MM', { locale: ptBR })}`;
      }
      return format(dateRange.from, 'dd/MM/yyyy', { locale: ptBR });
    }
    return presetLabels[preset];
  };

  const displayLabel = getDisplayLabel();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
          <CalendarIcon className="h-3.5 w-3.5" />
          Data
          {displayLabel && (
            <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px] bg-primary text-primary-foreground">
              {displayLabel}
            </Badge>
          )}
          <ChevronDown className="h-3 w-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2 z-50 bg-popover">
        {!customMode ? (
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground px-2 py-1">Filtrar por data</p>
            {(['all', 'today', 'yesterday', 'thisWeek', 'lastWeek', 'thisMonth', 'custom'] as DatePreset[]).map((p) => (
              <Button
                key={p}
                variant={preset === p ? 'default' : 'ghost'}
                size="sm"
                className="w-full justify-start h-8 text-xs"
                onClick={() => handlePresetSelect(p)}
              >
                {presetLabels[p]}
              </Button>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-2">
              <p className="text-xs font-semibold text-muted-foreground">Selecione o período</p>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => setCustomMode(false)}
              >
                Voltar
              </Button>
            </div>
            <Calendar
              mode="range"
              selected={dateRange.from ? { from: dateRange.from, to: dateRange.to } : undefined}
              onSelect={handleCustomDateSelect}
              locale={ptBR}
              numberOfMonths={1}
              className="pointer-events-auto"
            />
            {dateRange.from && (
              <div className="flex justify-end px-2">
                <Button size="sm" className="h-7 text-xs" onClick={() => setOpen(false)}>
                  Aplicar
                </Button>
              </div>
            )}
          </div>
        )}
        
        {preset !== 'all' && !customMode && (
          <div className="border-t border-border mt-2 pt-2">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={clearFilter}
              className="w-full h-8 text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5 mr-1.5" />
              Limpar filtro de data
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export const defaultDateFilter = {
  dateRange: { from: undefined, to: undefined } as DateRange,
  preset: 'all' as DatePreset,
};
