import { useState } from 'react';
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
          <button className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-left backdrop-blur-sm transition hover:bg-white/10">
            <Avatar className="h-10 w-10 border border-white/10">
              <AvatarFallback className="bg-gradient-to-br from-teal-500 to-cyan-500 text-white text-sm font-semibold">
                {client.id === 'all' ? <Scale className="h-5 w-5" /> : initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-sm font-semibold text-white">{client.name}</p>
                <ChevronDown className="h-4 w-4 text-white/50 transition group-hover:text-white" />
              </div>
              <p className="truncate text-xs text-white/50">{client.type}</p>
            </div>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-72 border-white/10 bg-[#0f1424] text-white">
          <DropdownMenuLabel className="text-white/60">Filtrar por cliente</DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-white/10" />
          {MOCK_CLIENTS.map((c) => (
            <DropdownMenuItem
              key={c.id}
              onClick={() => onClientChange(c)}
              className="focus:bg-white/10 focus:text-white"
            >
              <div className="flex flex-col">
                <span className="text-sm font-medium">{c.name}</span>
                <span className="text-xs text-white/50">{c.type}</span>
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Right actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={onAddAdCost}
          className="rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 text-white shadow-[0_0_20px_-5px] shadow-teal-500/40 hover:from-teal-400 hover:to-cyan-400"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Adicionar custo de Ads
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="rounded-xl border-white/10 bg-white/5 text-white hover:bg-white/10 hover:text-white"
            >
              <CalendarIcon className="mr-1.5 h-4 w-4 text-teal-400" />
              {PERIOD_LABELS[period]}
              <ChevronDown className="ml-1.5 h-4 w-4 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48 border-white/10 bg-[#0f1424] text-white">
            {(Object.keys(PERIOD_LABELS) as PeriodKey[]).map((p) => (
              <DropdownMenuItem
                key={p}
                onClick={() => onPeriodChange(p)}
                className="focus:bg-white/10 focus:text-white"
              >
                {PERIOD_LABELS[p]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
