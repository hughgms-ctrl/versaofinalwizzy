import { useState } from 'react';
import { AGENT_FUNCTION_ROLES } from '@/hooks/useAIAgents';
import { AgentOrchestration, useToggleOrchestration, useDeleteOrchestration } from '@/hooks/useAgentOrchestrations';
import { useSaveAgentInstanceAsTemplate } from '@/hooks/useAgentInstances';
import { usePlatformAdmin } from '@/hooks/usePlatformAdmin';
import { Workflow, Trash2, ArrowRight, BookmarkPlus, Pencil, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

// Dialog de "Salvar como template" -- tira uma foto do fluxo+agente ATUAIS da
// orquestração e vira um novo template na galeria curada GLOBAL. Só admin de
// plataforma consegue (galeria = curadoria -- ver conversa com o usuário).
function SaveAsTemplateDialog({ instanceId, defaultName, open, onOpenChange }: {
  instanceId: string;
  defaultName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const saveAsTemplate = useSaveAgentInstanceAsTemplate();
  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');

  const handleSave = () => {
    saveAsTemplate.mutate(
      { instanceId, name: name.trim(), description: description.trim() || undefined, category: category.trim() || undefined },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Salvar como template</DialogTitle>
          <DialogDescription>Tira uma foto do fluxo e do agente como estão agora e publica na galeria curada global.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-2">
            <Label htmlFor="template-name">Nome do template</Label>
            <Input id="template-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="template-description">Descrição (opcional)</Label>
            <Textarea id="template-description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="template-category">Categoria (opcional)</Label>
            <Input id="template-category" placeholder="Ex.: beneficios_inss" value={category} onChange={(e) => setCategory(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={!name.trim() || saveAsTemplate.isPending} onClick={handleSave}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface OrchestrationListItemProps {
  orchestration: AgentOrchestration;
  onEdit: (instanceId: string) => void;
}

// Cartão PRÓPRIO da orquestração -- nome do fluxo, nunca o nome do agente por
// trás (ver conversa com o usuário: "eu vou criar uma orquestração e vai
// aparecer separado"). O(s) agente(s) usados aqui continuam com seus
// próprios cartões em "Agentes", intocados.
export function OrchestrationListItem({ orchestration, onEdit }: OrchestrationListItemProps) {
  const toggleOrchestration = useToggleOrchestration();
  const deleteOrchestration = useDeleteOrchestration();
  const { isPlatformAdmin } = usePlatformAdmin();
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const roleLabel = orchestration.functionRole
    ? AGENT_FUNCTION_ROLES.find(r => r.value === orchestration.functionRole)?.label || orchestration.functionRole
    : null;

  return (
    <div
      className={cn(
        "gradient-border-card group p-4 cursor-pointer",
        !orchestration.isActive && "opacity-60"
      )}
      onClick={() => onEdit(orchestration.id)}
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="gradient-icon-box h-10 w-10 bg-gradient-to-br from-violet-500 to-indigo-600">
                <Workflow className="h-5 w-5 text-white" />
              </div>
              <div className={cn(
                "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card",
                orchestration.isActive ? "bg-accent-foreground" : "bg-muted-foreground/40"
              )} />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-foreground truncate text-sm">{orchestration.name}</h3>
              <div className="flex items-center gap-1 mt-0.5">
                <Workflow className="h-3 w-3 text-violet-500" />
                <span className="text-xs text-violet-500 font-medium">Orquestração</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
            <Switch
              checked={orchestration.isActive}
              onCheckedChange={(checked) => toggleOrchestration.mutate({
                instanceId: orchestration.id,
                flowId: orchestration.flowId,
                campaignId: orchestration.campaignId,
                isActive: checked,
              })}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => onEdit(orchestration.id)}>
                  <Pencil className="h-3.5 w-3.5 mr-2" /> Editar orquestração
                </DropdownMenuItem>
                {isPlatformAdmin && (
                  <DropdownMenuItem onClick={() => setSaveTemplateOpen(true)}>
                    <BookmarkPlus className="h-3.5 w-3.5 mr-2" /> Salvar como template
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => deleteOrchestration.mutate(orchestration.id)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {isPlatformAdmin && (
              <SaveAsTemplateDialog
                instanceId={orchestration.id}
                defaultName={orchestration.name}
                open={saveTemplateOpen}
                onOpenChange={setSaveTemplateOpen}
              />
            )}
          </div>
        </div>

        <div className="flex items-center justify-between">
          {roleLabel ? (
            <Badge variant="secondary" className="text-xs font-medium px-2.5 py-0.5 rounded-full">
              {roleLabel}
            </Badge>
          ) : <span />}
          <div className="flex items-center gap-1 text-xs text-muted-foreground group-hover:text-primary transition-colors">
            <span>Editar orquestração</span>
            <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>
      </div>
    </div>
  );
}
