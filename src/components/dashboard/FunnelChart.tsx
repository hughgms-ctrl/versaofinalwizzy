import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Settings2, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { usePipelines, usePipelineColumns } from '@/hooks/usePipelines';
import { useFunnelConfig, useSaveFunnelConfig } from '@/hooks/useFunnelConfig';
import { useFunnelData, type FunnelPeriod, type FunnelPresetPeriod } from '@/hooks/useFunnelData';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { toast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';

const PERIOD_OPTIONS: { value: FunnelPresetPeriod | 'custom'; label: string }[] = [
  { value: 'today', label: 'Hoje' },
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: '90d', label: '90 dias' },
  { value: 'custom', label: 'Personalizado' },
];

export function FunnelChart() {
  const { data: allPipelines = [] } = usePipelines();
  const { selectedWorkspaceId } = useWorkspaceContext();
  const { data: config, isLoading: loadingConfig } = useFunnelConfig();
  const saveConfig = useSaveFunnelConfig();

  const [periodKind, setPeriodKind] = useState<FunnelPresetPeriod | 'custom'>('30d');
  const today = format(new Date(), 'yyyy-MM-dd');
  const [customFrom, setCustomFrom] = useState<string>(today);
  const [customTo, setCustomTo] = useState<string>(today);
  const period: FunnelPeriod = periodKind === 'custom'
    ? { from: customFrom, to: customTo }
    : periodKind;
  const [dialogOpen, setDialogOpen] = useState(false);

  // Filter pipelines strictly by selected workspace (or show all when "All workspaces")
  const pipelines = useMemo(() => {
    if (!selectedWorkspaceId) return allPipelines;
    return allPipelines.filter((p: any) => {
      const ws = Array.isArray(p.workspace_ids) ? p.workspace_ids : [];
      return ws.includes(selectedWorkspaceId);
    });
  }, [allPipelines, selectedWorkspaceId]);

  // Dialog draft state
  const [draftPipelineId, setDraftPipelineId] = useState<string>('');
  const [draftColumnIds, setDraftColumnIds] = useState<string[]>([]);

  const configuredPipelineVisible = useMemo(
    () => !!config?.pipeline_id && pipelines.some((pipeline) => pipeline.id === config.pipeline_id),
    [config?.pipeline_id, pipelines]
  );

  const pipelineId = configuredPipelineVisible ? config?.pipeline_id || null : pipelines[0]?.id || null;
  const { data: pipelineColumns = [], isLoading: loadingPipelineColumns } = usePipelineColumns(pipelineId);
  const { data: draftColumns = [], isLoading: loadingDraftColumns } = usePipelineColumns(draftPipelineId || null);

  const columnIds = useMemo(() => {
    const availableColumnIds = new Set(pipelineColumns.map((column) => column.id));

    if (configuredPipelineVisible && config?.column_ids?.length) {
      const validConfiguredColumns = config.column_ids.filter((columnId) => availableColumnIds.has(columnId));
      if (validConfiguredColumns.length >= 2) return validConfiguredColumns;
    }

    return pipelineColumns.slice(0, 4).map((column) => column.id);
  }, [configuredPipelineVisible, config?.column_ids, pipelineColumns]);

  const { data: funnelData = [], isLoading: loadingData } = useFunnelData(
    pipelineId,
    columnIds,
    period
  );

  useEffect(() => {
    if (loadingConfig || saveConfig.isPending) return;
    if (!pipelineId || columnIds.length < 2) return;

    const currentPipelineId = configuredPipelineVisible ? config?.pipeline_id || null : null;
    const currentColumnIds = configuredPipelineVisible ? config?.column_ids || [] : [];
    const isSameConfig =
      currentPipelineId === pipelineId &&
      currentColumnIds.length === columnIds.length &&
      currentColumnIds.every((columnId, index) => columnId === columnIds[index]);

    if (!isSameConfig) {
      saveConfig.mutate({ pipeline_id: pipelineId, column_ids: columnIds });
    }
  }, [
    columnIds,
    config?.column_ids,
    config?.pipeline_id,
    configuredPipelineVisible,
    loadingConfig,
    pipelineId,
    saveConfig,
  ]);

  // Init draft when opening dialog
  useEffect(() => {
    if (dialogOpen) {
      setDraftPipelineId(pipelineId || '');
      setDraftColumnIds(columnIds);
    }
  }, [dialogOpen, pipelineId, columnIds]);

  // Reset columns when pipeline changes in draft
  useEffect(() => {
    if (dialogOpen && draftPipelineId !== config?.pipeline_id) {
      setDraftColumnIds([]);
    }
  }, [draftPipelineId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggleColumn = (id: string) => {
    setDraftColumnIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 4) {
        toast({ title: 'Máximo 4 etapas', description: 'Desmarque uma para selecionar outra', variant: 'destructive' });
        return prev;
      }
      return [...prev, id];
    });
  };

  const handleSave = async () => {
    if (!draftPipelineId || draftColumnIds.length < 2) {
      toast({ title: 'Selecione ao menos 2 etapas', variant: 'destructive' });
      return;
    }
    // Reorder column_ids by their pipeline order
    const ordered = draftColumns
      .filter((c) => draftColumnIds.includes(c.id))
      .map((c) => c.id);
    await saveConfig.mutateAsync({ pipeline_id: draftPipelineId, column_ids: ordered });
    setDialogOpen(false);
  };

  // Build stages with column metadata
  const stages = useMemo(() => {
    return columnIds
      .map((cid) => {
        const col = pipelineColumns.find((c) => c.id === cid);
        const data = funnelData.find((d) => d.column_id === cid);
        return col
          ? { id: cid, label: col.name, count: data?.count || 0 }
          : null;
      })
      .filter(Boolean) as { id: string; label: string; count: number }[];
  }, [columnIds, pipelineColumns, funnelData]);

  const isConfigured = !!pipelineId && columnIds.length >= 2;
  const max = stages.length > 0 ? Math.max(...stages.map((s) => s.count), 1) : 1;
  const totalConv =
    stages.length >= 2 && stages[0].count > 0
      ? ((stages[stages.length - 1].count / stages[0].count) * 100).toFixed(1)
      : '0';

  // SVG funnel
  const width = 800;
  const height = 220;
  const padY = 16;
  const stepW = stages.length > 0 ? width / stages.length : width;
  const points = stages.map((s, i) => {
    const ratio = s.count / max;
    const h = (height - padY * 2) * ratio;
    const x = i * stepW + stepW / 2;
    const yTop = (height - h) / 2;
    const yBot = yTop + h;
    return { x, yTop, yBot };
  });
  const topPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.yTop}`).join(' ');
  const botPath = points.slice().reverse().map((p) => `L ${p.x},${p.yBot}`).join(' ');
  const fullPath = points.length > 0 ? `${topPath} ${botPath} Z` : '';

  return (
    <div className="metric-card">
      <div className="metric-card-gradient" />
      <div className="relative">
        {/* Header */}
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Performance de Funil</h3>
            <p className="text-sm text-muted-foreground">
              {isConfigured
                ? 'Conversões entre as etapas escolhidas do pipeline'
                : 'Configure o pipeline e as 4 etapas que servem de marco'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isConfigured && (
              <>
                <Select value={periodKind} onValueChange={(v) => setPeriodKind(v as FunnelPresetPeriod | 'custom')}>
                  <SelectTrigger className="h-9 w-[150px]">
                    <Filter className="mr-1 h-3.5 w-3.5" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PERIOD_OPTIONS.map((p) => (
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
              </>
            )}

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="h-9">
                  <Settings2 className="mr-1.5 h-4 w-4" />
                  Configurar
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Configurar Funil</DialogTitle>
                  <DialogDescription>
                    Escolha o pipeline e até 4 colunas que serão os marcos do funil.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label>Pipeline</Label>
                    <Select value={draftPipelineId} onValueChange={setDraftPipelineId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um pipeline" />
                      </SelectTrigger>
                      <SelectContent>
                        {pipelines.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Etapas do funil ({draftColumnIds.length}/4)</Label>
                    {draftPipelineId && loadingDraftColumns ? (
                      <Skeleton className="h-32 w-full rounded-lg" />
                    ) : draftColumns.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nenhuma coluna disponível.</p>
                    ) : (
                      <div className="max-h-64 space-y-1.5 overflow-y-auto rounded-lg border border-border p-2">
                        {draftColumns.map((col) => {
                          const checked = draftColumnIds.includes(col.id);
                          return (
                            <label
                              key={col.id}
                              className="flex cursor-pointer items-center gap-3 rounded-md p-2 hover:bg-secondary/50"
                            >
                              <Checkbox checked={checked} onCheckedChange={() => handleToggleColumn(col.id)} />
                              <div className="h-3 w-3 rounded-full" style={{ backgroundColor: col.color }} />
                              <span className="text-sm text-foreground">{col.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      A ordem segue a ordem das colunas no pipeline. Selecione no mínimo 2.
                    </p>
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleSave} disabled={saveConfig.isPending}>
                    {saveConfig.isPending ? 'Salvando...' : 'Salvar'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Body */}
        {loadingConfig || (pipelineId && loadingPipelineColumns) ? (
          <Skeleton className="h-[320px] w-full rounded-xl" />
        ) : !isConfigured ? (
          <div className="flex h-[280px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-secondary/30 p-6 text-center">
            <Settings2 className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">Funil não configurado</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Clique em "Configurar" para escolher um pipeline e selecionar até 4 colunas que servirão
              como etapas do funil deste workspace.
            </p>
          </div>
        ) : (
          <>
            {/* Conversion badge */}
            <div className="mb-3 flex justify-end">
              <span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
                Conversão total {totalConv}%
              </span>
            </div>

            {/* Stage labels */}
            <div
              className="mb-3 grid gap-2"
              style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0,1fr))` }}
            >
              {stages.map((s, i) => {
                const conv =
                  i > 0 && stages[i - 1].count > 0
                    ? ((s.count / stages[i - 1].count) * 100).toFixed(1)
                    : null;
                return (
                  <div key={s.id} className="flex items-center gap-2">
                    <div className="flex-1 rounded-xl border border-border bg-secondary/40 px-3 py-2">
                      <p className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">
                        {s.label}
                      </p>
                      <p className="text-xl font-bold tabular-nums text-foreground">
                        {loadingData ? '—' : s.count.toLocaleString('pt-BR')}
                      </p>
                      {conv !== null && (
                        <p className="text-[11px] font-medium text-primary tabular-nums">{conv}% conv.</p>
                      )}
                    </div>
                    {i < stages.length - 1 && (
                      <ArrowRight className="hidden h-4 w-4 shrink-0 text-muted-foreground/50 lg:block" />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Funnel SVG */}
            <div className="relative h-[200px] w-full">
              {loadingData ? (
                <Skeleton className="h-full w-full rounded-xl" />
              ) : (
                <svg
                  viewBox={`0 0 ${width} ${height}`}
                  preserveAspectRatio="none"
                  className="h-full w-full"
                >
                  <defs>
                    <linearGradient id="dashboardFunnelGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.9" />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.55" />
                    </linearGradient>
                  </defs>
                  {fullPath && (
                    <path
                      d={fullPath}
                      fill="url(#dashboardFunnelGradient)"
                      stroke="hsl(var(--primary))"
                      strokeOpacity="0.6"
                      strokeWidth="1.5"
                    />
                  )}
                  {points.map((p, i) => (
                    <line
                      key={i}
                      x1={p.x}
                      x2={p.x}
                      y1="0"
                      y2={height}
                      stroke="hsl(var(--border))"
                      strokeOpacity="0.4"
                      strokeDasharray="3 3"
                    />
                  ))}
                </svg>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
