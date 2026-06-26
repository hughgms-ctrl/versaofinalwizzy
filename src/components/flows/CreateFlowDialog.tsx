import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCreateFlow, useFlows } from '@/hooks/useFlows';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { enforceEntryCreationLimit } from '@/lib/entryFlow';
import { Loader2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface CreateFlowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When creating inside a folder, the flow is created directly in it. */
  folderId?: string | null;
  folderName?: string | null;
  /** Workspaces the parent folder belongs to — the new flow inherits them. */
  folderWorkspaceIds?: string[];
}

export function CreateFlowDialog({ open, onOpenChange, folderId, folderName, folderWorkspaceIds }: CreateFlowDialogProps) {
  const navigate = useNavigate();
  const createFlow = useCreateFlow();
  const { data: existingFlows = [] } = useFlows();
  const { selectedWorkspaceId, availableWorkspaces, isAdmin } = useWorkspaceContext();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  // Set default workspace when dialog opens
  useEffect(() => {
    if (open) {
      if (!isAdmin && selectedWorkspaceId) {
        setWorkspaceId(selectedWorkspaceId);
      } else if (isAdmin) {
        setWorkspaceId(selectedWorkspaceId || 'all');
      }
    }
  }, [open, isAdmin, selectedWorkspaceId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) return;
    if (!enforceEntryCreationLimit('max_flows', existingFlows.length, 'fluxos')) return;

    // When creating inside a folder that belongs to workspaces, inherit them.
    const inheritsWorkspace = !!folderId && !!folderWorkspaceIds && folderWorkspaceIds.length > 0;

    try {
      const flow = await createFlow.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        folder_id: folderId ?? null,
        workspace_id: inheritsWorkspace ? folderWorkspaceIds![0] : (workspaceId === 'all' ? null : workspaceId),
        workspace_ids: inheritsWorkspace ? folderWorkspaceIds : undefined,
      });
      
      onOpenChange(false);
      setName('');
      setDescription('');
      setWorkspaceId(null);
      
      if (flow && typeof flow === 'object' && 'id' in flow) {
        navigate(`/flow-builder?id=${(flow as { id: string }).id}`);
      }
    } catch (error) {
      // Error is handled by the mutation
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Novo Fluxo</DialogTitle>
            <DialogDescription>
              {folderId
                ? <>Será criado dentro da pasta <span className="font-semibold text-foreground">{folderName}</span>.</>
                : 'Crie um novo fluxo de automação para seus atendimentos.'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Nome do Fluxo</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Boas-vindas"
                autoFocus
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="description">Descrição (opcional)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descreva o objetivo deste fluxo..."
                rows={3}
              />
            </div>

            {folderId && folderWorkspaceIds && folderWorkspaceIds.length > 0 ? (
              <div className="grid gap-2">
                <Label>Workspace</Label>
                <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-input bg-muted/50 text-sm text-muted-foreground">
                  Herdado da pasta
                </div>
              </div>
            ) : (
            <div className="grid gap-2">
              <Label>Workspace</Label>
              {isAdmin ? (
                <Select
                  value={workspaceId || 'all'}
                  onValueChange={(val) => setWorkspaceId(val === 'all' ? 'all' : val)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o workspace" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os Workspaces</SelectItem>
                    {availableWorkspaces.map(ws => (
                      <SelectItem key={ws.id} value={ws.id}>
                        <div className="flex items-center gap-2">
                          <div
                            className="h-2.5 w-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: ws.color }}
                          />
                          {ws.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-input bg-muted/50 text-sm">
                  {(() => {
                    const ws = availableWorkspaces.find(w => w.id === workspaceId);
                    if (ws) {
                      return (
                        <>
                          <div
                            className="h-2.5 w-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: ws.color }}
                          />
                          {ws.name}
                        </>
                      );
                    }
                    return <span className="text-muted-foreground">Workspace atual</span>;
                  })()}
                </div>
              )}
            </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={!name.trim() || createFlow.isPending}>
              {createFlow.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Criar Fluxo
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
