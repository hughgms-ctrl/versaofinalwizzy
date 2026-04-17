import { ChevronDown, Plus, Scale, Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { MOCK_CLIENTS, PERIOD_LABELS, type ClientOption, type PeriodKey } from '@/data/legalDashboardMock';

interface Props {
  client: ClientOption;
  onClientChange: (c: ClientOption) => void;
  period: PeriodKey;
  onPeriodChange: (p: PeriodKey) => void;
  onAddAdCost: () => void;
}

export function LegalDashboardHeader({ client, onClientChange, period, onPeriodChange, onAddAdCost }: Props) {
  const initials = client.name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      {/* Client selector */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="group flex items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2 text-left backdrop-blur-sm transition hover:border-primary/40 hover:bg-accent">
            <Avatar className="h-10 w-10 border border-border">
              <AvatarFallback className="bg-gradient-primary text-primary-foreground text-sm font-semibold">
                {client.id === 'all' ? <Scale className="h-5 w-5" /> : initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-sm font-semibold text-foreground">{client.name}</p>
                <ChevronDown className="h-4 w-4 text-muted-foreground transition group-hover:text-foreground" />
              </div>
              <p className="truncate text-xs text-muted-foreground">{client.type}</p>
            </div>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-72">
          <DropdownMenuLabel>Filtrar por cliente</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {MOCK_CLIENTS.map((c) => (
            <DropdownMenuItem key={c.id} onClick={() => onClientChange(c)}>
              <div className="flex flex-col">
                <span className="text-sm font-medium">{c.name}</span>
                <span className="text-xs text-muted-foreground">{c.type}</span>
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Right actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={onAddAdCost}
          className="rounded-xl bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Adicionar custo de Ads
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="rounded-xl">
              <CalendarIcon className="mr-1.5 h-4 w-4 text-primary" />
              {PERIOD_LABELS[period]}
              <ChevronDown className="ml-1.5 h-4 w-4 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48">
            {(Object.keys(PERIOD_LABELS) as PeriodKey[]).map((p) => (
              <DropdownMenuItem key={p} onClick={() => onPeriodChange(p)}>
                {PERIOD_LABELS[p]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
