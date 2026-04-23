import { useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  usePlatformPackages,
  useActivatedPackages,
  useActivatePackage,
} from '@/hooks/usePlatformPackages';
import { Loader2, Check, Sparkles, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ActivatePackageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ActivatePackageDialog({ open, onOpenChange }: ActivatePackageDialogProps) {
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [activatingId, setActivatingId] = useState<string | null>(null);

  const { data: areas = [], isLoading: loadingAreas } = usePlatformPackages({ kind: 'area' });
  const { data: objectives = [], isLoading: loadingObj } = usePlatformPackages({
    kind: 'objective',
    parentId: selectedAreaId,
  });
  const { data: activated = [] } = useActivatedPackages();
  const activate = useActivatePackage();

  const activatedIds = useMemo(() => new Set(activated.map((a) => a.package_id)), [activated]);

  const publishedAreas = areas.filter((a) => a.is_published);
  const publishedObjectives = objectives.filter((o) => o.is_published);

  const handleActivate = async (id: string) => {
    setActivatingId(id);
    try {
      await activate.mutateAsync(id);
    } finally {
      setActivatingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {selectedAreaId ? 'Escolha os objetivos' : 'Ativar pacote'}
          </DialogTitle>
          <DialogDescription>
            {selectedAreaId
              ? 'Cada objetivo cria fluxos, agentes e tags prontos para o seu negócio.'
              : 'Comece escolhendo a área que melhor descreve seu negócio.'}
          </DialogDescription>
        </DialogHeader>

        {!selectedAreaId ? (
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {loadingAreas ? (
              <div className="col-span-full flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : publishedAreas.length === 0 ? (
              <p className="col-span-full text-center text-sm text-muted-foreground py-8">
                Nenhuma área disponível ainda.
              </p>
            ) : (
              publishedAreas.map((area) => {
                const isActivated = activatedIds.has(area.id);
                return (
                  <Card
                    key={area.id}
                    className={cn(
                      'cursor-pointer transition-all hover:border-primary hover:shadow-md',
                      isActivated && 'border-primary/50 bg-primary/5'
                    )}
                    onClick={() => setSelectedAreaId(area.id)}
                  >
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-start justify-between">
                        <div className="text-2xl">{area.icon || '📦'}</div>
                        {isActivated && (
                          <Badge variant="default" className="text-[10px]">
                            <Check className="h-3 w-3 mr-1" />Ativo
                          </Badge>
                        )}
                      </div>
                      <h3 className="font-semibold text-sm">{area.name}</h3>
                      {area.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {area.description}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedAreaId(null)}
              className="-ml-2"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar para áreas
            </Button>

            {/* Activate the area itself if not yet activated */}
            {(() => {
              const area = areas.find((a) => a.id === selectedAreaId);
              if (!area || activatedIds.has(area.id)) return null;
              return (
                <Card className="border-primary/30 bg-primary/5">
                  <CardContent className="p-4 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-sm flex items-center gap-2">
                        {area.icon} Ativar área "{area.name}"
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Cria os agentes base e o master prompt da área.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleActivate(area.id)}
                      disabled={activatingId === area.id}
                    >
                      {activatingId === area.id && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                      Ativar área
                    </Button>
                  </CardContent>
                </Card>
              );
            })()}

            {loadingObj ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : publishedObjectives.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">
                Nenhum objetivo disponível para esta área.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {publishedObjectives.map((obj) => {
                  const isActivated = activatedIds.has(obj.id);
                  const isLoading = activatingId === obj.id;
                  return (
                    <Card key={obj.id} className={cn(isActivated && 'border-primary/50 bg-primary/5')}>
                      <CardContent className="p-4 space-y-2">
                        <div className="flex items-start justify-between">
                          <div className="text-xl">{obj.icon || '🎯'}</div>
                          {isActivated && (
                            <Badge variant="default" className="text-[10px]">
                              <Check className="h-3 w-3 mr-1" />Ativo
                            </Badge>
                          )}
                        </div>
                        <h4 className="font-semibold text-sm">{obj.name}</h4>
                        {obj.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {obj.description}
                          </p>
                        )}
                        <Button
                          size="sm"
                          variant={isActivated ? 'outline' : 'default'}
                          className="w-full"
                          onClick={() => handleActivate(obj.id)}
                          disabled={isLoading}
                        >
                          {isLoading && <Loader2 className="h-3 w-3 animate-spin mr-2" />}
                          {isActivated ? 'Reaplicar' : 'Ativar'}
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
