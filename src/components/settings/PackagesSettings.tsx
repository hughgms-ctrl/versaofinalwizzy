import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Package, Loader2 } from 'lucide-react';
import { ActivatePackageDialog } from './ActivatePackageDialog';
import { useActivatedPackages, usePlatformPackages } from '@/hooks/usePlatformPackages';

export function PackagesSettings() {
  const [open, setOpen] = useState(false);
  const { data: activated = [], isLoading } = useActivatedPackages();
  const { data: areas = [] } = usePlatformPackages({ kind: 'area' });
  const { data: objectives = [] } = usePlatformPackages({ kind: 'objective' });

  const allPackages = [...areas, ...objectives];
  const activatedDetails = activated
    .map((a) => allPackages.find((p) => p.id === a.package_id))
    .filter(Boolean);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Pacotes & Objetivos
          </CardTitle>
          <CardDescription>
            Ative pacotes prontos para sua área e objetivos específicos. Cada ativação cria agentes,
            fluxos, tags e pipelines configurados — você pode editar tudo depois.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={() => setOpen(true)} size="lg">
            <Sparkles className="h-4 w-4 mr-2" />
            Ativar pacote
          </Button>

          <div>
            <h3 className="text-sm font-medium mb-2">Já ativados</h3>
            {isLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : activatedDetails.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum pacote ativado ainda.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                {activatedDetails.map((pkg) => (
                  <div
                    key={pkg!.id}
                    className="flex items-center gap-2 rounded-lg border p-3 text-sm"
                  >
                    <span className="text-lg">{pkg!.icon || '📦'}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{pkg!.name}</p>
                      <Badge variant="outline" className="text-[10px]">
                        {pkg!.kind === 'area' ? 'Área' : 'Objetivo'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <ActivatePackageDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
