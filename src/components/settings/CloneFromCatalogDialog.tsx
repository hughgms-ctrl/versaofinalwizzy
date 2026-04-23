import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Copy } from 'lucide-react';
import { usePlatformPackages } from '@/hooks/usePlatformPackages';
import { useCloneFromCatalog } from '@/hooks/useWorkspaceTemplates';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';

interface CloneFromCatalogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPackageId?: string | null;
}

export function CloneFromCatalogDialog({ open, onOpenChange, initialPackageId = null }: CloneFromCatalogDialogProps) {
  const { availableWorkspaces, selectedWorkspaceId } = useWorkspaceContext();
  const { data: areas = [] } = usePlatformPackages({ kind: 'area' });
  const { data: objectives = [] } = usePlatformPackages({ kind: 'objective' });
  const all = [...areas, ...objectives].filter((p) => p.is_published && p.is_clonable && !p.is_locked);

  const [packageId, setPackageId] = useState<string | null>(initialPackageId);
  const [workspaceId, setWorkspaceId] = useState<string | null>(selectedWorkspaceId);

  const clone = useCloneFromCatalog();

  const handleClone = async () => {
    if (!packageId || !workspaceId) return;
    await clone.mutateAsync({ package_id: packageId, workspace_id: workspaceId });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5" />
            Duplicar pacote do catálogo
          </DialogTitle>
          <DialogDescription>
            Cria uma cópia editável no seu workspace. Você pode ajustar antes de ativar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>Pacote</Label>
            <Select value={packageId || ''} onValueChange={(v) => setPackageId(v || null)}>
              <SelectTrigger><SelectValue placeholder="Selecione um pacote" /></SelectTrigger>
              <SelectContent>
                {all.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.icon} {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Workspace destino</Label>
            <Select value={workspaceId || ''} onValueChange={(v) => setWorkspaceId(v || null)}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {availableWorkspaces.map((w) => (
                  <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleClone} disabled={!packageId || !workspaceId || clone.isPending}>
            {clone.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Duplicar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
