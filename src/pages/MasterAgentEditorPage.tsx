import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { useMasterPrompts, useUpdateMasterPrompt, TriggerKeyword } from '@/hooks/useMasterPrompts';
import { useTags } from '@/hooks/useTags';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Save, Loader2, Plus, X, Zap, Tag, MessageSquare, ZoomIn, ZoomOut, Undo2, History } from 'lucide-react';
import { OrchestratorCanvas, OrchestratorCanvasHandle, VersionSnapshot } from '@/components/orchestrator/OrchestratorCanvas';
import { OrchestratorHistoryDialog } from '@/components/orchestrator/OrchestratorHistoryDialog';
import { ReactFlowProvider } from '@xyflow/react';
import { Node, Edge } from '@xyflow/react';
import { toast } from '@/hooks/use-toast';
import { Sparkles } from 'lucide-react';

const MasterAgentEditorPage = () => {
  const { promptId } = useParams();
  const navigate = useNavigate();
  const { data: prompts = [], isLoading } = useMasterPrompts();
  const { data: tags = [] } = useTags();
  const updatePrompt = useUpdateMasterPrompt();

  const prompt = prompts.find(p => p.id === promptId);

  const [name, setName] = useState('');
  const [niche, setNiche] = useState('');
  const [content, setContent] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [provider, setProvider] = useState('lovable');
  const [model, setModel] = useState('default');

  // Trigger state
  const [triggerType, setTriggerType] = useState<'disabled' | 'tag' | 'keyword'>('disabled');
  const [triggerTags, setTriggerTags] = useState<string[]>([]);
  const [triggerKeywords, setTriggerKeywords] = useState<TriggerKeyword[]>([]);

  // Orchestration visual state
  const [orchNodes, setOrchNodes] = useState<Node[] | null>(null);
  const [orchEdges, setOrchEdges] = useState<Edge[] | null>(null);
  const [orchHistory, setOrchHistory] = useState<VersionSnapshot[]>([]);

  // View mode
  const [viewMode, setViewMode] = useState<'orchestrator' | 'triggers'>('orchestrator');
  const [hasUnsavedCanvasChanges, setHasUnsavedCanvasChanges] = useState(false);
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const canvasRef = useRef<OrchestratorCanvasHandle | null>(null);

  useEffect(() => {
    if (prompt) {
      setName(prompt.name);
      setNiche(prompt.niche);
      setContent(prompt.content);
      setIsActive(prompt.is_active);
      setTriggerType(prompt.trigger_type || 'disabled');
      setTriggerTags(prompt.trigger_tags || []);
      setTriggerKeywords(prompt.trigger_keywords || []);
      setProvider(prompt.provider || 'lovable');
      setModel(prompt.model || 'default');

      // Load orchestration nodes/edges from agent_rules
      const rules = prompt.agent_rules || {};
      setOrchNodes((rules as any).orchestration_nodes || null);
      setOrchEdges((rules as any).orchestration_edges || null);
      setOrchHistory((rules as any).orchestration_history || []);
    }
  }, [prompt]);

  const handleSaveOrchestration = (nodes: Node[], edges: Edge[], history: VersionSnapshot[]) => {
    if (!promptId) return;
    setOrchNodes(nodes);
    setOrchEdges(edges);
    setOrchHistory(history);

    // Extract trigger data from trigger node
    const triggerNode = nodes.find(n => n.type === 'orch-trigger');
    const triggerData = triggerNode?.data as Record<string, unknown> | undefined;
    const saveTriggerType = (triggerData?.triggerType as string) || triggerType;
    const saveTriggerTags = (triggerData?.triggerTags as string[]) || triggerTags;
    const saveTriggerKeywords = (triggerData?.triggerKeywords as TriggerKeyword[]) || triggerKeywords;

    setTriggerType(saveTriggerType as any);
    setTriggerTags(saveTriggerTags);
    setTriggerKeywords(saveTriggerKeywords);

    updatePrompt.mutate({
      id: promptId,
      name,
      niche,
      content,
      is_active: isActive,
      trigger_type: saveTriggerType,
      trigger_tags: saveTriggerTags,
      trigger_keywords: saveTriggerKeywords,
      provider: null,
      model: null,
      agent_rules: {
        orchestration_nodes: nodes,
        orchestration_edges: edges,
        orchestration_history: history,
      },
    } as any);
  };

  // Tag helpers
  const addTriggerTag = (tagId: string) => {
    if (!triggerTags.includes(tagId)) setTriggerTags([...triggerTags, tagId]);
  };
  const removeTriggerTag = (tagId: string) => {
    setTriggerTags(triggerTags.filter(t => t !== tagId));
  };

  // Keyword helpers
  const addKeyword = () => {
    setTriggerKeywords([...triggerKeywords, { value: '', match_type: 'contains' }]);
  };
  const updateKeyword = (index: number, field: keyof TriggerKeyword, value: string) => {
    const updated = [...triggerKeywords];
    updated[index] = { ...updated[index], [field]: value };
    setTriggerKeywords(updated);
  };
  const removeKeyword = (index: number) => {
    setTriggerKeywords(triggerKeywords.filter((_, i) => i !== index));
  };

  const handleSaveTriggers = () => {
    if (!promptId) return;
    updatePrompt.mutate({
      id: promptId,
      name,
      niche,
      trigger_type: triggerType,
      trigger_tags: triggerTags,
      trigger_keywords: triggerKeywords,
    } as any);
  };

  if (isLoading) {
    return <MainLayout title="Carregando..."><div /></MainLayout>;
  }

  if (!prompt) {
    return (
      <MainLayout title="Agente Master não encontrado">
        <Button variant="ghost" onClick={() => navigate('/agents')}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
        </Button>
      </MainLayout>
    );
  }

  const availableTags = tags.filter(t => !triggerTags.includes(t.id));

  if (viewMode === 'orchestrator') {
    return (
      <MainLayout title="" showSearch={false}>
        <div className="h-[calc(100vh-80px)] -mx-6 -mb-6 -mt-6 flex flex-col">
          {/* Mini header */}
          <div className="flex items-center justify-between px-4 py-2 bg-card border-b border-border">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => navigate('/agents')} className="gap-1.5">
                <ArrowLeft className="h-4 w-4" /> Voltar
              </Button>
              <div className="h-5 w-px bg-border" />
              <Button variant="default" size="sm" className="h-7 text-xs">
                Orquestração
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => setViewMode('triggers')}
              >
                <Zap className="h-3 w-3" /> Gatilhos
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-8 w-40 text-sm font-medium"
                placeholder="Nome..."
              />
              <div className="h-5 w-px bg-border" />
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Ativo</span>
                <Switch checked={isActive} onCheckedChange={setIsActive} />
              </div>
              <div className="h-5 w-px bg-border" />

              <Badge variant="outline" className="h-8 px-3 text-xs">
                Modelo definido pelo admin
              </Badge>
              <div className="h-5 w-px bg-border" />
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => canvasRef.current?.undo()} title="Desfazer (última versão)">
                <Undo2 className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowHistoryDialog(true)} title="Histórico de versões">
                <History className="h-3.5 w-3.5" />
              </Button>
              <div className="h-5 w-px bg-border" />
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => canvasRef.current?.zoomIn()}>
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => canvasRef.current?.zoomOut()}>
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
              <div className="h-5 w-px bg-border" />
              <Button size="sm" onClick={() => canvasRef.current?.save()} disabled={updatePrompt.isPending} className="h-8 gap-1.5">
                {updatePrompt.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Salvar
              </Button>
              {hasUnsavedCanvasChanges && (
                <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/30">
                  Não salvo
                </Badge>
              )}
            </div>
          </div>

          {/* Canvas */}
          <div className="flex-1">
            <ReactFlowProvider>
              <OrchestratorCanvas
                promptId={promptId!}
                name={name}
                onNameChange={setName}
                isActive={isActive}
                onActiveChange={setIsActive}
                promptContent={content}
                onPromptContentChange={setContent}
                orchestrationNodes={orchNodes}
                orchestrationEdges={orchEdges}
                orchestrationHistory={orchHistory}
                onSave={handleSaveOrchestration}
                isSaving={updatePrompt.isPending}
                initialTriggerData={{ triggerType, triggerTags, triggerKeywords }}
                onUnsavedChangesChange={setHasUnsavedCanvasChanges}
                canvasRef={canvasRef}
                syncEnabled={syncEnabled}
                onSyncEnabledChange={setSyncEnabled}
                organizationId={prompt?.organization_id}
              />
            </ReactFlowProvider>
          </div>

          {/* History Dialog */}
          <OrchestratorHistoryDialog
            open={showHistoryDialog}
            onOpenChange={setShowHistoryDialog}
            history={orchHistory}
            onRestore={(version) => canvasRef.current?.restoreVersion(version)}
          />
        </div>
      </MainLayout>
    );
  }

  // Triggers view
  return (
    <MainLayout title={`Gatilhos: ${prompt.name}`}>
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate('/agents')} className="gap-1.5">
              <ArrowLeft className="h-4 w-4" /> Voltar
            </Button>
            <div className="h-5 w-px bg-border" />
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setViewMode('orchestrator')}
            >
              Orquestração
            </Button>
            <Button
              variant="default"
              size="sm"
              className="h-7 text-xs gap-1"
            >
              <Zap className="h-3 w-3" /> Gatilhos
            </Button>
          </div>
          <Button onClick={handleSaveTriggers} disabled={updatePrompt.isPending} size="sm">
            <Save className="h-4 w-4 mr-2" /> Salvar Gatilhos
          </Button>
        </div>

        {/* Basic info */}
        <div className="rounded-lg border bg-card p-6 space-y-4">
          <h3 className="font-semibold text-foreground">Informações Básicas</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Nome</label>
              <Input value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Nicho</label>
              <Input value={niche} onChange={e => setNiche(e.target.value)} placeholder="Ex.: direito_saude" />
            </div>
          </div>
        </div>

        {/* Trigger Config */}
        <div className="rounded-lg border bg-card p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-foreground">Gatilho de Ativação</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Defina quando este agente master deve ser ativado automaticamente para novas conversas.
          </p>

          <div className="flex gap-2">
            <Button variant={triggerType === 'disabled' ? 'default' : 'outline'} size="sm" onClick={() => setTriggerType('disabled')}>
              Desativado
            </Button>
            <Button variant={triggerType === 'tag' ? 'default' : 'outline'} size="sm" onClick={() => setTriggerType('tag')} className="gap-1.5">
              <Tag className="h-3.5 w-3.5" /> Por Tag
            </Button>
            <Button variant={triggerType === 'keyword' ? 'default' : 'outline'} size="sm" onClick={() => setTriggerType('keyword')} className="gap-1.5">
              <MessageSquare className="h-3.5 w-3.5" /> Por Palavra-chave
            </Button>
          </div>

          {/* Tag trigger config */}
          {triggerType === 'tag' && (
            <div className="space-y-3 pt-2">
              <label className="text-sm font-medium">
                Tags que ativam este agente <span className="text-muted-foreground font-normal">(qualquer uma)</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {triggerTags.map(tagId => {
                  const tag = tags.find(t => t.id === tagId);
                  return tag ? (
                    <Badge key={tagId} variant="secondary" className="gap-1 pr-1" style={{ borderLeft: `3px solid ${tag.color}` }}>
                      {tag.name}
                      <button onClick={() => removeTriggerTag(tagId)} className="ml-1 rounded-full p-0.5 hover:bg-muted">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ) : null;
                })}
              </div>
              {availableTags.length > 0 && (
                <Select onValueChange={addTriggerTag}>
                  <SelectTrigger className="w-full max-w-xs"><SelectValue placeholder="Adicionar tag..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ignore" disabled className="hidden">Selecione uma tag</SelectItem>
                    {availableTags.map(tag => (
                      <SelectItem key={tag.id} value={tag.id}>
                        <span className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: tag.color }} />
                          {tag.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* Keyword trigger config */}
          {triggerType === 'keyword' && (
            <div className="space-y-3 pt-2">
              <label className="text-sm font-medium">Palavras-chave que ativam este agente</label>
              <div className="space-y-2">
                {triggerKeywords.map((kw, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Select value={kw.match_type} onValueChange={(v) => updateKeyword(index, 'match_type', v)}>
                      <SelectTrigger className="w-36 shrink-0"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="exact">Exata</SelectItem>
                        <SelectItem value="contains">Contém</SelectItem>
                        <SelectItem value="starts_with">Começa com</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input value={kw.value} onChange={e => updateKeyword(index, 'value', e.target.value)} placeholder="palavra..." className="flex-1" />
                    <Button variant="ghost" size="icon" onClick={() => removeKeyword(index)} className="shrink-0">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={addKeyword} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Adicionar palavra-chave
              </Button>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
};

export default MasterAgentEditorPage;
