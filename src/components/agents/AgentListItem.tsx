import { AIAgent, AGENT_FUNCTION_ROLES, useDeleteAIAgent } from '@/hooks/useAIAgents';
import { AgentFolder } from '@/hooks/useAgentFolders';
import { Bot, Trash2, Sparkles, ArrowRight, FolderInput } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useUpdateAIAgent } from '@/hooks/useAIAgents';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent } from '@/components/ui/dropdown-menu';
import { MoreHorizontal } from 'lucide-react';

interface AgentListItemProps {
  agent: AIAgent;
  folders?: AgentFolder[];
  onMoveToFolder?: (agentId: string, folderId: string | null) => void;
}

export function AgentListItem({ agent, folders = [], onMoveToFolder }: AgentListItemProps) {
  const navigate = useNavigate();
  const updateAgent = useUpdateAIAgent();
  const deleteAgent = useDeleteAIAgent();
  const roleLabel = AGENT_FUNCTION_ROLES.find(r => r.value === agent.function_role)?.label || agent.function_role;

  return (
    <div
      className={cn(
        "gradient-border-card group p-4 cursor-pointer",
        !agent.is_active && "opacity-60"
      )}
      onClick={() => navigate(`/agents/${agent.id}`)}
    >
      <div className="flex flex-col gap-3">
        {/* Top row: avatar + name + toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="gradient-icon-box h-10 w-10">
                <Bot className="h-5 w-5 text-white" />
              </div>
              <div className={cn(
                "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card",
                agent.is_active ? "bg-accent-foreground" : "bg-muted-foreground/40"
              )} />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-foreground truncate text-sm">{agent.name}</h3>
              <div className="flex items-center gap-1 mt-0.5">
                <Sparkles className="h-3 w-3 text-primary/70" />
                <span className="text-xs text-muted-foreground">Agente de IA</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
            <Switch
              checked={agent.is_active}
              onCheckedChange={(checked) => updateAgent.mutate({ id: agent.id, is_active: checked })}
            />
            {/* Move to folder / actions menu */}
            {folders.length > 0 && onMoveToFolder && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
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
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => deleteAgent.mutate(agent.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {(!folders.length || !onMoveToFolder) && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => deleteAgent.mutate(agent.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/* Footer: badge + arrow */}
        <div className="flex items-center justify-between">
          <Badge variant="secondary" className="text-xs font-medium px-2.5 py-0.5 rounded-full">
            {roleLabel}
          </Badge>
          <div className="flex items-center gap-1 text-xs text-muted-foreground group-hover:text-primary transition-colors">
            <span>Configurar</span>
            <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>
      </div>
    </div>
  );
}
