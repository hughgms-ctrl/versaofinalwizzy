import { useState, useMemo } from 'react';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { useAIAgents } from '@/hooks/useAIAgents';
import { useMasterPrompts } from '@/hooks/useMasterPrompts';
import { useWorkspaceAgentConfigs, useUpsertWorkspaceAgentConfig } from '@/hooks/useWorkspaceAgentConfigs';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, Settings2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

function WorkspaceConfigCard({ workspace }: { workspace: { id: string; name: string; color: string } }) {
  const { data: agents = [] } = useAIAgents();
  const { data: prompts = [] } = useMasterPrompts();
  const { data: configs = [] } = useWorkspaceAgentConfigs();
  const upsertConfig = useUpsertWorkspaceAgentConfig();

  const existingConfig = configs.find(c => c.workspace_id === workspace.id);

  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>(existingConfig?.agent_ids || []);
  const [selectedPromptId, setSelectedPromptId] = useState<string>(existingConfig?.master_prompt_id || 'none');
  const [aiProvider, setAiProvider] = useState(existingConfig?.ai_provider || 'lovable');
  const [aiModel, setAiModel] = useState(existingConfig?.ai_model || 'google/gemini-3-flash-preview');

  // Sync when config loads
  useMemo(() => {
    if (existingConfig) {
      setSelectedAgentIds(existingConfig.agent_ids || []);
      setSelectedPromptId(existingConfig.master_prompt_id || 'none');
      setAiProvider(existingConfig.ai_provider || 'lovable');
      setAiModel(existingConfig.ai_model || 'google/gemini-3-flash-preview');
    }
  }, [existingConfig?.id]);

  const toggleAgent = (agentId: string) => {
    setSelectedAgentIds(prev => prev.includes(agentId) ? prev.filter(id => id !== agentId) : [...prev, agentId]);
  };

  const handleSave = () => {
    upsertConfig.mutate({
      workspace_id: workspace.id,
      agent_ids: selectedAgentIds,
      master_prompt_id: selectedPromptId === 'none' ? null : selectedPromptId,
      ai_provider: aiProvider,
      ai_model: aiModel,
    });
  };

  return (
    <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
      <div className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: workspace.color + '20' }}>
            <Settings2 className="h-5 w-5" style={{ color: workspace.color }} />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">{workspace.name}</h3>
            <p className="text-xs text-muted-foreground">Configuração de agentes</p>
          </div>
        </div>

        {/* AI Provider & Model */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Provedor IA</label>
            <Select value={aiProvider} onValueChange={setAiProvider}>
              <SelectTrigger className="text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lovable">Lovable AI</SelectItem>
                <SelectItem value="openai">OpenAI</SelectItem>
                <SelectItem value="gemini">Google Gemini</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Modelo</label>
            <Select value={aiModel} onValueChange={setAiModel}>
              <SelectTrigger className="text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {aiProvider === 'lovable' && (
                  <>
                    <SelectItem value="google/gemini-3-flash-preview">Gemini 3 Flash</SelectItem>
                    <SelectItem value="google/gemini-2.5-flash">Gemini 2.5 Flash</SelectItem>
                    <SelectItem value="google/gemini-2.5-pro">Gemini 2.5 Pro</SelectItem>
                    <SelectItem value="openai/gpt-5-mini">GPT-5 Mini</SelectItem>
                    <SelectItem value="openai/gpt-5">GPT-5</SelectItem>
                  </>
                )}
                {aiProvider === 'openai' && (
                  <>
                    <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                    <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                    <SelectItem value="gpt-4-turbo">GPT-4 Turbo</SelectItem>
                  </>
                )}
                {aiProvider === 'gemini' && (
                  <>
                    <SelectItem value="gemini-2.5-flash">Gemini 2.5 Flash</SelectItem>
                    <SelectItem value="gemini-2.5-pro">Gemini 2.5 Pro</SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Master Prompt */}
        <div className="mb-4">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Prompt Mestre</label>
          <Select value={selectedPromptId} onValueChange={setSelectedPromptId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione um prompt mestre" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Nenhum</SelectItem>
              {prompts.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name} ({p.niche})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Agents */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-2 block">Agentes Habilitados</label>
          <div className="space-y-2 p-3 rounded-lg bg-muted/50 max-h-[200px] overflow-y-auto">
            {agents.length === 0 && <span className="text-xs text-muted-foreground">Nenhum agente cadastrado</span>}
            {agents.map(agent => (
              <label key={agent.id} className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={selectedAgentIds.includes(agent.id)}
                  onCheckedChange={() => toggleAgent(agent.id)}
                />
                <span className="text-sm">{agent.name}</span>
                <Badge variant="secondary" className="text-[10px]">{agent.function_role}</Badge>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-border p-3 flex justify-end">
        <Button size="sm" onClick={handleSave} disabled={upsertConfig.isPending}>
          <Save className="h-4 w-4 mr-1" /> Salvar Configuração
        </Button>
      </div>
    </div>
  );
}

export function WorkspaceAgentsTab() {
  const { data: workspaces = [], isLoading } = useWorkspaces();

  if (isLoading) return <div className="text-muted-foreground text-sm">Carregando...</div>;

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-6">
        Configure quais agentes e qual Prompt Mestre estarão ativos em cada Workspace.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {workspaces.map(ws => (
          <WorkspaceConfigCard key={ws.id} workspace={ws} />
        ))}
        {workspaces.length === 0 && (
          <p className="text-sm text-muted-foreground col-span-full">Nenhum workspace cadastrado. Crie um workspace em Configurações primeiro.</p>
        )}
      </div>
    </div>
  );
}
