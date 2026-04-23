import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Check, Copy, Lock, Sparkles } from 'lucide-react';
import {
  usePlatformPackages, useActivatedPackages, useActivatePackage,
} from '@/hooks/usePlatformPackages';
import { CloneFromCatalogDialog } from './CloneFromCatalogDialog';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { cn } from '@/lib/utils';

export function CatalogTab({ canManage }: { canManage: boolean }) {
  const { data: areas = [], isLoading: la } = usePlatformPackages({ kind: 'area' });
  const { data: objectives = [], isLoading: lo } = usePlatformPackages({ kind: 'objective' });
  const { data: activated = [] } = useActivatedPackages();
  const activate = useActivatePackage();
  const { selectedWorkspaceId } = useWorkspaceContext();

  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneInitial, setCloneInitial] = useState<string | null>(null);
  const [activatingId, setActivatingId] = useState<string | null>(null);

  const activatedIds = useMemo(() => new Set(activated.map((a) => a.package_id)), [activated]);
  const all = [...areas, ...objectives].filter((p) => p.is_published);

  const handleActivate = async (id: string) => {
    setActivatingId(id);
    try {
      await activate.mutateAsync(id);
    } finally {
      setActivatingId(null);
    }
  };

  if (la || lo) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  if (all.length === 0) {
    return (
      <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
        Nenhum pacote disponível no catálogo.
      </CardContent></Card>
    );
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {all.map((pkg) => {
          const isActivated = activatedIds.has(pkg.id);
          const showClone = canManage && pkg.is_clonable && !pkg.is_locked;
          return (
            <Card
              key={pkg.id}
              className={cn('transition-all', isActivated && 'border-primary/50 bg-primary/5')}
            >
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-2xl">{pkg.icon || '📦'}</div>
                  <div className="flex flex-wrap gap-1 justify-end">
                    <Badge variant="outline" className="text-[10px]">
                      {pkg.kind === 'area' ? 'Área' : 'Objetivo'}
                    </Badge>
                    {pkg.is_locked && (
                      <Badge variant="secondary" className="text-[10px]">
                        <Lock className="h-2.5 w-2.5 mr-1" />Bloqueado
                      </Badge>
                    )}
                    {isActivated && (
                      <Badge variant="default" className="text-[10px]">
                        <Check className="h-2.5 w-2.5 mr-1" />Ativo
                      </Badge>
                    )}
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold text-sm">{pkg.name}</h3>
                  {pkg.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{pkg.description}</p>
                  )}
                </div>
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    className="flex-1"
                    variant={isActivated ? 'outline' : 'default'}
                    onClick={() => handleActivate(pkg.id)}
                    disabled={activatingId === pkg.id}
                  >
                    {activatingId === pkg.id
                      ? <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      : <Sparkles className="h-3 w-3 mr-1" />}
                    {isActivated ? 'Reaplicar' : 'Ativar'}
                  </Button>
                  {showClone && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setCloneInitial(pkg.id); setCloneOpen(true); }}
                      title="Duplicar como meu"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                {showClone && !selectedWorkspaceId && (
                  <p className="text-[10px] text-muted-foreground">
                    Selecione um workspace para poder duplicar.
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <CloneFromCatalogDialog
        open={cloneOpen}
        onOpenChange={(o) => { setCloneOpen(o); if (!o) setCloneInitial(null); }}
        initialPackageId={cloneInitial}
      />
    </>
  );
}
