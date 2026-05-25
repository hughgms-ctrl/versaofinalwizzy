import { useState } from 'react';
import { AIAgent, AGENT_FUNCTION_ROLES, useUpdateAIAgent, useDeleteAIAgent } from '@/hooks/useAIAgents';
import { useTags } from '@/hooks/useTags';
import { useFlows } from '@/hooks/useFlows';
import { usePipelines, usePipelineColumns } from '@/hooks/usePipelines';
import { Bot, Save, Trash2, ChevronDown, ChevronUp, Tag, GitBranch, Columns } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

interface AIAgentCardProps {
  agent: AIAgent;
}

export function AIAgentCard({ agent }: AIAgentCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState(agent.name);
  const [description, setDescription] = useState(agent.description || '');
  const [functionRole, setFunctionRole] = useState(agent.function_role || 'recepcao');
  const [promptBase, setPromptBase] = useState(agent.prompt_base || '');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(agent.tag_ids || []);
  const [selectedColumnIds, setSelectedColumnIds] = useState<string[]>(agent.pipeline_column_ids || []);
  const [selectedFlowIds, setSelectedFlowIds] = useState<string[]>(agent.flow_ids || []);
  const [isActive, setIsActive] = useState(agent.is_active);

  const updateAgent = useUpdateAIAgent();
  const deleteAgent = useDeleteAIAgent();
  const { data: tags = [] } = useTags();
  const { data: flows = [] } = useFlows();
  const { data: pipelines = [] } = usePipelines();

  // Get all columns from all pipelines
  const allPipelineIds = pipelines.map(p => p.id);
  // We'll fetch columns for the first pipeline as a starting point
  const firstPipelineId = allPipelineIds[0];
  const { data: columns = [] } = usePipelineColumns(firstPipelineId);

  const roleLabel = AGENT_FUNCTION_ROLES.find(r => r.value === functionRole)?.label || functionRole;
  const isDirty = name !== agent.name || description !== (agent.description || '') || 
    functionRole !== (agent.function_role || 'recepcao') || promptBase !== (agent.prompt_base || '') ||
    JSON.stringify(selectedTagIds) !== JSON.stringify(agent.tag_ids || []) ||
    JSON.stringify(selectedColumnIds) !== JSON.stringify(agent.pipeline_column_ids || []) ||
    JSON.stringify(selectedFlowIds) !== JSON.stringify(agent.flow_ids || []) ||
    isActive !== agent.is_active;

  const handleSave = () => {
    updateAgent.mutate({
      id: agent.id,
      name,
      description: description || null,
      function_role: functionRole,
      prompt_base: promptBase,
      tag_ids: selectedTagIds,
      pipeline_column_ids: selectedColumnIds,
      flow_ids: selectedFlowIds,
      is_active: isActive,
    });
  };

  const toggleTag = (tagId: string) => {
    setSelectedTagIds(prev => prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId]);
  };
  const toggleColumn = (colId: string) => {
    setSelectedColumnIds(prev => prev.includes(colId) ? prev.filter(id => id !== colId) : [...prev, colId]);
  };
  const toggleFlow = (flowId: string) => {
    setSelectedFlowIds(prev => prev.includes(flowId) ? prev.filter(id => id !== flowId) : [...prev, flowId]);
  };

  return (
    <div className={cn(
      "rounded-xl border bg-card text-card-foreground shadow-sm transition-all",
      isActive && "ring-2 ring-primary/30"
    )}>
      {/* Header */}
      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-md">
              <Bot className="h-6 w-6 text-white" />
            </div>
            <div>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                className="font-semibold text-foreground border-none p-0 h-auto text-base focus-visible:ring-0 bg-transparent"
              />
              <Badge variant="secondary" className="mt-1 text-[10px]">{roleLabel}</Badge>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={isActive} onCheckedChange={setIsActive} />
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setExpanded(!expanded)}>
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Function Role Select */}
        <Select value={functionRole} onValueChange={setFunctionRole}>
          <SelectTrigger className="w-full mb-3">
            <SelectValue placeholder="Função do agente" />
          </SelectTrigger>
          <SelectContent>
            {AGENT_FUNCTION_ROLES.map(role => (
              <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Description */}
        <Input
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Descrição breve do agente..."
          className="mb-3"
        />
      </div>

      {/* Expanded Section */}
      {expanded && (
        <div className="border-t border-border p-5 space-y-5">
          {/* Prompt Base */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">Prompt-Base</label>
            <Textarea
              value={promptBase}
              onChange={e => setPromptBase(e.target.value)}
              placeholder="Defina a personalidade e o papel deste agente..."
              className="min-h-[120px]"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
              <Tag className="h-4 w-4 text-primary" /> Tags que o agente aplica
            </label>
            <div className="flex flex-wrap gap-2 p-3 rounded-lg bg-muted/50 max-h-[120px] overflow-y-auto">
              {tags.length === 0 && <span className="text-xs text-muted-foreground">Nenhuma tag cadastrada</span>}
              {tags.map(tag => (
                <label key={tag.id} className="flex items-center gap-1.5 cursor-pointer">
                  <Checkbox
                    checked={selectedTagIds.includes(tag.id)}
                    onCheckedChange={() => toggleTag(tag.id)}
                  />
                  <span className="text-xs" style={{ color: tag.color }}>{tag.name}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Pipeline Columns */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
              <Columns className="h-4 w-4 text-primary" /> Colunas do pipeline que movimenta
            </label>
            <div className="flex flex-wrap gap-2 p-3 rounded-lg bg-muted/50 max-h-[120px] overflow-y-auto">
              {columns.length === 0 && <span className="text-xs text-muted-foreground">Nenhuma coluna disponível</span>}
              {columns.map(col => (
                <label key={col.id} className="flex items-center gap-1.5 cursor-pointer">
                  <Checkbox
                    checked={selectedColumnIds.includes(col.id)}
                    onCheckedChange={() => toggleColumn(col.id)}
                  />
                  <span className="text-xs">{col.name}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Flows */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-primary" /> Fluxos que o agente dispara
            </label>
            <div className="flex flex-wrap gap-2 p-3 rounded-lg bg-muted/50 max-h-[120px] overflow-y-auto">
              {flows.length === 0 && <span className="text-xs text-muted-foreground">Nenhum fluxo cadastrado</span>}
              {flows.map(flow => (
                <label key={flow.id} className="flex items-center gap-1.5 cursor-pointer">
                  <Checkbox
                    checked={selectedFlowIds.includes(flow.id)}
                    onCheckedChange={() => toggleFlow(flow.id)}
                  />
                  <span className="text-xs">{flow.name}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-border p-3 flex justify-between">
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={() => deleteAgent.mutate(agent.id)}
        >
          <Trash2 className="h-4 w-4 mr-1" /> Excluir
        </Button>
        {isDirty && (
          <Button size="sm" onClick={handleSave} disabled={updateAgent.isPending}>
            <Save className="h-4 w-4 mr-1" /> Salvar
          </Button>
        )}
      </div>
    </div>
  );
}
