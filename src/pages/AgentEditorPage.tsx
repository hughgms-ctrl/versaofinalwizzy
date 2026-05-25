import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { useAIAgents, useUpdateAIAgent } from '@/hooks/useAIAgents';
import { useAgentFunctionRoles } from '@/hooks/useAgentFunctionRoles';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ArrowLeft, Save, Sparkles, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { TrainingRulesList } from '@/components/agents/TrainingRulesList';



const AgentEditorPage = () => {
  const { agentId } = useParams();
  const navigate = useNavigate();
  const { data: agents = [], isLoading: isAgentsLoading } = useAIAgents();
  const { data: roles = [], isLoading: isRolesLoading } = useAgentFunctionRoles();
  const updateAgent = useUpdateAIAgent();

  const agent = agents.find(a => a.id === agentId);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [functionRole, setFunctionRole] = useState('recepcao');
  const [promptBase, setPromptBase] = useState('');
  const [isActive, setIsActive] = useState(false);

  // AI assist state
  const [aiInput, setAiInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // Collapsible sections
  const [showBasicInfo, setShowBasicInfo] = useState(true);
  
  const [showAIAssist, setShowAIAssist] = useState(true);


  useEffect(() => {
    if (agent) {
      setName(agent.name);
      setDescription(agent.description || '');
      setFunctionRole(agent.function_role || 'recepcao');
      setPromptBase(agent.prompt_base || '');
      setIsActive(agent.is_active);
    }
  }, [agent]);

  const handleSave = () => {
    if (!agentId) return;
    updateAgent.mutate({
      id: agentId,
      name,
      description: description || null,
      function_role: functionRole,
      prompt_base: promptBase,
      is_active: isActive,
    });
  };

  const handleAIGenerate = async () => {
    if (!aiInput.trim()) return;
    setIsGenerating(true);
    try {
      const roleLabel = roles.find(r => r.value === functionRole)?.label || functionRole;
      const { data, error } = await supabase.functions.invoke('generate-agent-prompt', {
        body: { userDescription: aiInput, agentName: name, agentRole: roleLabel },
      });
      if (error) throw error;
      if (data?.prompt) {
        setPromptBase(data.prompt);
        toast({ title: 'Prompt gerado com sucesso!' });
      }
    } catch (err) {
      console.error(err);
      toast({ title: 'Erro ao gerar prompt', description: err instanceof Error ? err.message : 'Tente novamente', variant: 'destructive' });
    } finally {
      setIsGenerating(false);
    }
  };

  if (isAgentsLoading || isRolesLoading) {
    return <MainLayout title="Carregando..."><div /></MainLayout>;
  }

  if (!agent) {
    return (
      <MainLayout title="Agente não encontrado">
        <Button variant="ghost" onClick={() => navigate('/agents')}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
        </Button>
      </MainLayout>
    );
  }

  return (
    <MainLayout title={`Editar Agente: ${agent.name}`}>
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Back + Save header */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate('/agents')}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
          </Button>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Ativo</span>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
            <Button onClick={handleSave} disabled={updateAgent.isPending}>
              <Save className="h-4 w-4 mr-2" /> Salvar
            </Button>
          </div>
        </div>

        {/* Basic info - collapsible */}
        <div className="rounded-lg border bg-card overflow-hidden">
          <button
            onClick={() => setShowBasicInfo(!showBasicInfo)}
            className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
          >
            <h3 className="font-semibold text-foreground">Informações Básicas</h3>
            {showBasicInfo ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </button>
          {showBasicInfo && (
            <div className="px-6 pb-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">Nome</label>
                  <Input value={name} onChange={e => setName(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Função</label>
                  <Select value={functionRole} onValueChange={setFunctionRole}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {roles.map(r => (
                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Descrição</label>
                <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Descrição breve do agente..." />
              </div>
            </div>
          )}
        </div>


        {/* Prompt Editor */}
        <div className="rounded-lg border bg-card p-6 space-y-4">
          <h3 className="font-semibold text-foreground">Prompt-Base</h3>

          {/* AI Assist - collapsible */}
          <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 overflow-hidden">
            <button
              onClick={() => setShowAIAssist(!showAIAssist)}
              className="w-full flex items-center justify-between p-4 hover:bg-primary/10 transition-colors"
            >
              <div className="flex items-center gap-2 text-sm font-medium text-primary">
                <Sparkles className="h-4 w-4" />
                Assistente IA para criação de prompt
              </div>
              {showAIAssist ? <ChevronDown className="h-4 w-4 text-primary" /> : <ChevronRight className="h-4 w-4 text-primary" />}
            </button>
            {showAIAssist && (
              <div className="px-4 pb-4 space-y-3">
                <p className="text-xs text-muted-foreground">
                  Descreva com suas palavras o que esse agente deve fazer e a IA organizará o prompt ideal.
                </p>
                <Textarea
                  value={aiInput}
                  onChange={e => setAiInput(e.target.value)}
                  placeholder="Ex.: Quero que esse agente receba o cliente, pergunte o nome e o motivo do contato, seja simpático e encaminhe para o próximo agente..."
                  className="min-h-[80px]"
                />
                <Button
                  onClick={handleAIGenerate}
                  disabled={isGenerating || !aiInput.trim()}
                  size="sm"
                  className="gap-2"
                >
                  {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {isGenerating ? 'Gerando...' : 'Gerar Prompt com IA'}
                </Button>
              </div>
            )}
          </div>

          <Textarea
            value={promptBase}
            onChange={e => setPromptBase(e.target.value)}
            placeholder="Defina a personalidade e o papel deste agente..."
            className="min-h-[400px] font-mono text-sm"
          />

          <TrainingRulesList
            targetType="agent"
            agentId={agentId}
            organizationId={agent.organization_id}
          />
        </div>
      </div>
    </MainLayout>
  );
};

export default AgentEditorPage;
