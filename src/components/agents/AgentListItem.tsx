import { useState } from 'react';
import { AIAgent, AGENT_FUNCTION_ROLES, useDeleteAIAgent } from '@/hooks/useAIAgents';
import { AgentFolder } from '@/hooks/useAgentFolders';
import { Bot, Trash2, Sparkles, ArrowRight, FolderInput, BookmarkPlus, Pencil, Workflow } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useUpdateAIAgent } from '@/hooks/useAIAgents';
import { useSaveAgentInstanceAsTemplate } from '@/hooks/useAgentInstances';
import { usePlatformAdmin } from '@/hooks/usePlatformAdmin';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { MoreHorizontal } from 'lucide-react';

interface AgentListItemProps {
  agent: AIAgent;
  folders?: AgentFolder[];
  onMoveToFolder?: (agentId: string, folderId: string | null) => void;
  instanceId?: string;
  onEdit?: (instanceId: string) => void;
}

// Dialog de "Salvar como template" -- tira uma foto do fluxo+agente ATUAIS da
// instância e vira um novo template na galeria curada GLOBAL. Só admin de
// plataforma consegue (galeria = curadoria; quem cria a própria orquestração
// só usa, não precisa que ela vire template -- ver conversa com o usuário).
// O componente pai já garante isPlatformAdmin antes de renderizar isso.
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

export function AgentListItem({ agent, folders = [], onMoveToFolder, instanceId, onEdit }: AgentListItemProps) {
  const navigate = useNavigate();
  const updateAgent = useUpdateAIAgent();
  const deleteAgent = useDeleteAIAgent();
  const { isPlatformAdmin } = usePlatformAdmin();
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const roleLabel = AGENT_FUNCTION_ROLES.find(r => r.value === agent.function_role)?.label || agent.function_role;
  const isOrchestration = !!instanceId;

  return (
    <div
      className={cn(
        "gradient-border-card group p-4 cursor-pointer",
        !agent.is_active && "opacity-60"
      )}
      onClick={() => (isOrchestration && onEdit ? onEdit(instanceId!) : navigate(`/agents/${agent.id}`))}
    >
      <div className="flex flex-col gap-3">
        {/* Top row: avatar + name + toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className={cn("gradient-icon-box h-10 w-10", isOrchestration && "bg-gradient-to-br from-violet-500 to-indigo-600")}>
                {isOrchestration ? <Workflow className="h-5 w-5 text-white" /> : <Bot className="h-5 w-5 text-white" />}
              </div>
              <div className={cn(
                "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card",
                agent.is_active ? "bg-accent-foreground" : "bg-muted-foreground/40"
              )} />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-foreground truncate text-sm">{agent.name}</h3>
              <div className="flex items-center gap-1 mt-0.5">
                {isOrchestration ? (
                  <>
                    <Workflow className="h-3 w-3 text-violet-500" />
                    <span className="text-xs text-violet-500 font-medium">Orquestração</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3 w-3 text-primary/70" />
                    <span className="text-xs text-muted-foreground">Agente</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
            <Switch
              checked={agent.is_active}
              onCheckedChange={(checked) => updateAgent.mutate({ id: agent.id, is_active: checked })}
            />
            {/* Move to folder / salvar como template / excluir */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {instanceId && onEdit && (
                  <DropdownMenuItem onClick={() => onEdit(instanceId)}>
                    <Pencil className="h-3.5 w-3.5 mr-2" /> Editar orquestração
                  </DropdownMenuItem>
                )}
                {instanceId && isPlatformAdmin && (
                  <DropdownMenuItem onClick={() => setSaveTemplateOpen(true)}>
                    <BookmarkPlus className="h-3.5 w-3.5 mr-2" /> Salvar como template
                  </DropdownMenuItem>
                )}
                {folders.length > 0 && onMoveToFolder && (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <FolderInput className="h-3.5 w-3.5 mr-2" /> Mover para pasta
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuItem onClick={() => onMoveToFolder(agent.id, null)}>
                        Sem pasta
                      </DropdownMenuItem>
                      {folders.map(f => (
                        <DropdownMenuItem key={f.id} onClick={() => onMoveToFolder(agent.id, f.id)}>
                          {f.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )}
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => deleteAgent.mutate(agent.id)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {instanceId && isPlatformAdmin && (
              <SaveAsTemplateDialog
                instanceId={instanceId}
                defaultName={agent.name}
                open={saveTemplateOpen}
                onOpenChange={setSaveTemplateOpen}
              />
            )}
          </div>
        </div>

        {/* Footer: badge + arrow */}
        <div className="flex items-center justify-between">
          <Badge variant="secondary" className="text-xs font-medium px-2.5 py-0.5 rounded-full">
            {roleLabel}
          </Badge>
          <div className="flex items-center gap-1 text-xs text-muted-foreground group-hover:text-primary transition-colors">
            <span>{isOrchestration ? 'Editar orquestração' : 'Configurar'}</span>
            <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>
      </div>
    </div>
  );
}
