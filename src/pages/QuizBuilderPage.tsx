import { useCallback, useRef, useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  BackgroundVariant,
  MiniMap,
  Panel,
  ConnectionMode,
  useReactFlow,
  ConnectionLineType,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { MainLayout } from '@/components/layout/MainLayout';
import { QuizSidebar, type QuizNodeType } from '@/components/quiz/QuizSidebar';
import { quizNodeTypes } from '@/components/quiz/QuizNodes';
import { QuizNodeProperties } from '@/components/quiz/QuizNodeProperties';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useQuizzes, Quiz } from '@/hooks/useQuizzes';
import { toast } from 'sonner';
import { ArrowLeft, Save, Play, Copy, Eye, Loader2, ZoomIn, ZoomOut, Minus, Plus, Settings } from 'lucide-react';
import { ReactFlowProvider } from '@xyflow/react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import PublicQuizPage from './PublicQuizPage';

let groupCounter = 1;
const getGroupId = () => `group_${groupCounter++}`;

function QuizBuilderInner() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const quizId = searchParams.get('id');
  const { data: quizzes, updateQuiz } = useQuizzes();
  const quiz = quizzes?.find(q => q.id === quizId);

  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([
    { id: 'start-1', type: 'quiz-start', position: { x: 100, y: 200 }, data: { label: 'Início' } } as Node,
  ]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedBlockIdx, setSelectedBlockIdx] = useState<number | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const { zoomIn, zoomOut, screenToFlowPosition } = useReactFlow();
  const selectedNode = selectedNodeId ? nodes.find((node) => node.id === selectedNodeId) ?? null : null;

  // Load quiz canvas data
  useEffect(() => {
    if (quiz && !isInitialized) {
      const theme = quiz.theme as any;
      if (theme?.nodes?.length > 0) {
        setNodes(theme.nodes);
        const maxId = theme.nodes.reduce((max: number, n: any) => {
          const match = n.id.match(/group_(\d+)/);
          return match ? Math.max(max, parseInt(match[1])) : max;
        }, 0);
        groupCounter = maxId + 1;
      }
      if (theme?.edges?.length > 0) {
        setEdges(theme.edges);
      }
      setIsInitialized(true);
    }
  }, [quiz, isInitialized, setNodes, setEdges]);

  useEffect(() => {
    if (!quizId) navigate('/tools/quiz');
  }, [quizId, navigate]);

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => addEdge({
      ...params,
      type: 'default',
      animated: true,
      style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: 'hsl(var(--primary))' },
    }, eds));
  }, [setEdges]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const blockType = event.dataTransfer.getData('application/quizflow') as QuizNodeType;
    const blockLabel = event.dataTransfer.getData('application/quizflow-label');
    if (!blockType || !reactFlowWrapper.current) return;

    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });

    // Check if dropped on existing group node
    const targetNode = nodes.find(n => {
      if (n.type !== 'quiz-group') return false;
      const nodeWidth = 280;
      const nodeHeight = 150;
      return (
        position.x >= n.position.x && position.x <= n.position.x + nodeWidth &&
        position.y >= n.position.y && position.y <= n.position.y + nodeHeight
      );
    });

    if (targetNode) {
      // Add block to existing group
      const blocks = (targetNode.data.blocks as any[]) || [];
      const newBlock = { id: `block_${Date.now()}`, type: blockType, data: getDefaultBlockData(blockType) };
      setNodes((nds) => nds.map(n =>
        n.id === targetNode.id
          ? { ...n, data: { ...n.data, blocks: [...blocks, newBlock] } }
          : n
      ));
    } else {
      // Create new group with this block
      const newGroupId = getGroupId();
      const newBlock = { id: `block_${Date.now()}`, type: blockType, data: getDefaultBlockData(blockType) };
      const newNode: Node = {
        id: newGroupId,
        type: 'quiz-group',
        position,
        data: {
          label: `Grupo #${groupCounter - 1}`,
          blocks: [newBlock],
        },
      };
      setNodes((nds) => [...nds, newNode]);
    }
  }, [nodes, setNodes, screenToFlowPosition]);

  const handleSave = useCallback(async () => {
    if (!quizId) return;
    setIsSaving(true);
    try {
      await updateQuiz.mutateAsync({
        id: quizId,
        theme: { nodes, edges } as any,
      });
      toast.success('Quizz salvo!');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsSaving(false);
    }
  }, [quizId, nodes, edges, updateQuiz]);

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.type === 'quiz-start') return;
    setSelectedNodeId(node.id);
    setSelectedBlockIdx(null);
  }, []);

  // Keep a ref to latest nodes for event handler
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  // Listen for block clicks from inside group nodes
  useEffect(() => {
    const handler = (e: Event) => {
      const { nodeId, blockIdx } = (e as CustomEvent).detail;
      const node = nodesRef.current.find(n => n.id === nodeId);
      if (node) {
        setSelectedNodeId(node.id);
        setSelectedBlockIdx(blockIdx);
      }
    };
    window.addEventListener('quiz-block-click', handler);
    return () => window.removeEventListener('quiz-block-click', handler);
  }, []);

  const handleNodeDoubleClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.type !== 'quiz-group') return;
    const blocks = (node.data.blocks as any[]) || [];
    if (blocks.length > 0) {
      setSelectedNodeId(node.id);
      setSelectedBlockIdx(0);
    }
  }, []);

  const handlePaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setSelectedBlockIdx(null);
  }, []);

  const handleNodeUpdate = useCallback((nodeId: string, data: Record<string, unknown>) => {
    setNodes((nds) => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n));
  }, [setNodes]);

  const handleDeleteNode = useCallback((nodeId: string) => {
    setNodes((nds) => nds.filter(n => n.id !== nodeId));
    setEdges((eds) => eds.filter(e => e.source !== nodeId && e.target !== nodeId));
    setSelectedNodeId(null);
    setSelectedBlockIdx(null);
    toast.success('Grupo excluído');
  }, [setNodes, setEdges]);

  const handleDuplicateNode = useCallback((nodeId: string) => {
    const original = nodes.find(n => n.id === nodeId);
    if (!original) return;
    const newGroupId = getGroupId();
    const clonedBlocks = ((original.data.blocks as any[]) || []).map((b: any) => ({
      ...b,
      id: `block_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      data: { ...b.data },
    }));
    const newNode: Node = {
      id: newGroupId,
      type: original.type,
      position: { x: original.position.x + 50, y: original.position.y + 80 },
      data: { ...original.data, label: `${original.data.label} (cópia)`, blocks: clonedBlocks },
    };
    setNodes((nds) => [...nds, newNode]);
    setSelectedNodeId(newGroupId);
    setSelectedBlockIdx(null);
    toast.success('Grupo duplicado');
  }, [nodes, setNodes]);

  const handleToggleActive = async () => {
    if (!quiz) return;
    await updateQuiz.mutateAsync({ id: quizId!, is_active: !quiz.is_active });
    toast.success(quiz.is_active ? 'Quiz desativado' : 'Quiz ativado');
  };

  const publicUrl = quiz?.public_token ? `${window.location.origin}/q/${quiz.public_token}` : '';

  // Keyboard delete
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedNode && selectedNode.type !== 'quiz-start') {
        handleDeleteNode(selectedNode.id);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNode, handleDeleteNode]);

  if (!quizId) return null;
  if (!quiz) return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b bg-background px-4 py-2 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/tools/quiz')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Input
            value={quiz.name}
            onChange={(e) => updateQuiz.mutate({ id: quizId, name: e.target.value })}
            className="text-lg font-semibold border-none shadow-none h-auto p-0 focus-visible:ring-0 max-w-xs bg-transparent"
          />
          <Badge variant={quiz.is_active ? 'default' : 'secondary'}>
            {quiz.is_active ? 'Ativo' : 'Rascunho'}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
            <Settings className="h-3.5 w-3.5 mr-1.5" /> Configurações
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
            <Eye className="h-3.5 w-3.5 mr-1.5" /> Visualizar
          </Button>
          {publicUrl && (
            <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(publicUrl); toast.success('Link copiado!'); }}>
              <Copy className="h-3.5 w-3.5 mr-1.5" /> Link
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleToggleActive}>
            <Play className="h-3.5 w-3.5 mr-1.5" />
            {quiz.is_active ? 'Desativar' : 'Ativar'}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={isSaving}>
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {isSaving ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </div>

      {/* Main canvas */}
      <div className="flex flex-1 overflow-hidden">
        <QuizSidebar
          onDragStart={() => {}}
          isCollapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />

        <div className="flex-1 h-full" ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeClick={handleNodeClick}
            onNodeDoubleClick={handleNodeDoubleClick}
            onPaneClick={handlePaneClick}
            onEdgeClick={(_: React.MouseEvent, edge: Edge) => {
              setEdges((eds) => eds.filter(e => e.id !== edge.id));
            }}
            nodeTypes={quizNodeTypes}
            connectionMode={ConnectionMode.Strict}
            connectionLineType={ConnectionLineType.Bezier}
            connectionLineStyle={{ stroke: 'hsl(var(--primary))', strokeWidth: 2 }}
            fitView
            snapToGrid
            snapGrid={[15, 15]}
            className="bg-muted/30"
            defaultEdgeOptions={{
              type: 'default',
              animated: true,
              style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 },
              markerEnd: { type: MarkerType.ArrowClosed, color: 'hsl(var(--primary))' },
            }}
            deleteKeyCode={null}
            proOptions={{ hideAttribution: true }}
          >
            <Panel position="top-right">
              <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-1 shadow-lg">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => zoomOut()}>
                  <Minus className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => zoomIn()}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </Panel>
            <Controls className="!bg-card !border-border !shadow-lg [&>button]:!bg-card [&>button]:!border-border [&>button]:!text-foreground hover:[&>button]:!bg-muted" />
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} className="!bg-background" />
          </ReactFlow>
        </div>
      </div>

      {/* Properties panel */}
      <QuizNodeProperties
        key={`${selectedNodeId ?? 'none'}-${selectedBlockIdx ?? 'group'}`}
        node={selectedNode}
        selectedBlockIdx={selectedBlockIdx}
        onClose={() => { setSelectedNodeId(null); setSelectedBlockIdx(null); }}
        onUpdateNode={handleNodeUpdate}
        onDeleteNode={handleDeleteNode}
        onDuplicateNode={handleDuplicateNode}
        onSave={handleSave}
        isSaving={isSaving}
        allNodes={nodes}
      />

      {/* Preview — render inline quiz engine */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-sm p-0 overflow-hidden flex flex-col" style={{ height: '600px' }}>
          <DialogHeader className="p-4 pb-0 shrink-0">
            <DialogTitle className="text-sm">Visualização do Quizz</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-auto">
            {previewOpen && (
              <PublicQuizPage
                inlineQuiz={{
                  id: quiz.id,
                  name: quiz.name,
                  organization_id: quiz.organization_id,
                  theme: quiz.theme,
                  settings: quiz.settings,
                  welcome_screen: quiz.welcome_screen,
                  end_screen: quiz.end_screen,
                }}
                inlineNodes={nodes as any}
                inlineEdges={edges as any}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Settings Sheet */}
      <QuizSettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        quiz={quiz}
        onUpdate={async (updates) => {
          await updateQuiz.mutateAsync({ id: quizId!, ...updates });
        }}
      />

      <style>{`
        .react-flow__handle { transition: opacity 0.2s; }
        .react-flow__node:hover .react-flow__handle { opacity: 1 !important; }
        .react-flow__node.selected { outline: none !important; box-shadow: none !important; }
      `}</style>
    </div>
  );
}

function getDefaultBlockData(type: QuizNodeType): Record<string, any> {
  switch (type) {
    case 'quiz-bubble-text': return { content: '' };
    case 'quiz-bubble-image': return { url: '', alt: '' };
    case 'quiz-bubble-video': return { url: '', autoplay: true };
    case 'quiz-bubble-embed': return { url: '' };
    case 'quiz-bubble-audio': return { url: '' };
    case 'quiz-input-text': return { placeholder: 'Digite sua resposta...', variable: '', required: true };
    case 'quiz-input-number': return { placeholder: 'Digite um número...', variable: '', required: true };
    case 'quiz-input-email': return { placeholder: 'Digite seu email...', variable: 'email', required: true };
    case 'quiz-input-website': return { placeholder: 'Digite uma URL...', variable: '', required: true };
    case 'quiz-input-date': return { variable: '', required: true };
    case 'quiz-input-time': return { variable: '', required: true };
    case 'quiz-input-phone': return { placeholder: 'Digite seu telefone...', variable: 'phone', required: true };
    case 'quiz-input-buttons':
      return { options: [{ label: 'Opção 1', value: 'opt_1' }, { label: 'Opção 2', value: 'opt_2' }], variable: '' };
    case 'quiz-input-pic-choice':
      return { options: [{ label: 'Escolha 1', imageUrl: '' }, { label: 'Escolha 2', imageUrl: '' }], variable: '' };
    case 'quiz-input-rating': return { maxRating: 5, variable: '' };
    case 'quiz-input-file': return { accept: '', variable: '' };
    case 'quiz-logic-condition': return { variable: '', operator: 'equals', value: '' };
    case 'quiz-logic-redirect': return { url: '', newTab: true };
    case 'quiz-logic-wait': return { seconds: 3 };
    case 'quiz-logic-ab-test': return { percentA: 50 };
    case 'quiz-logic-jump': return { targetGroup: '' };
    case 'quiz-event-pixel': return { platform: 'facebook', pixelId: '', eventName: 'PageView' };
    default: return {};
  }
}

function QuizSettingsSheet({ open, onClose, quiz, onUpdate }: {
  open: boolean;
  onClose: () => void;
  quiz: Quiz;
  onUpdate: (updates: Partial<Quiz>) => Promise<void>;
}) {
  const ws = (quiz.welcome_screen || {}) as Record<string, any>;
  const es = (quiz.end_screen || {}) as Record<string, any>;

  const updateWelcome = (patch: Record<string, any>) => {
    onUpdate({ welcome_screen: { ...ws, ...patch } } as any);
  };

  const updateEnd = (patch: Record<string, any>) => {
    onUpdate({ end_screen: { ...es, ...patch } } as any);
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent className="w-80 sm:w-96 p-0 flex flex-col">
        <SheetHeader className="p-4 border-b">
          <SheetTitle className="text-sm">Configurações do Quizz</SheetTitle>
        </SheetHeader>
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-6">
            {/* Welcome screen */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Tela de Boas-vindas</h3>
              <div className="flex items-center justify-between">
                <Label className="text-xs">Mostrar tela de boas-vindas</Label>
                <Switch checked={ws.showWelcome !== false} onCheckedChange={(v) => updateWelcome({ showWelcome: v })} />
              </div>
              <div>
                <Label className="text-xs">Título</Label>
                <Input value={ws.title || ''} onChange={(e) => updateWelcome({ title: e.target.value })} placeholder={quiz.name} />
              </div>
              <div>
                <Label className="text-xs">Descrição</Label>
                <Textarea value={ws.description || ''} onChange={(e) => updateWelcome({ description: e.target.value })} rows={3} placeholder="Descrição opcional..." />
              </div>
              <div>
                <Label className="text-xs">Texto do botão</Label>
                <Input value={ws.buttonText || ''} onChange={(e) => updateWelcome({ buttonText: e.target.value })} placeholder="Começar" />
              </div>
              <div>
                <Label className="text-xs">URL de mídia (imagem ou vídeo)</Label>
                <Input value={ws.mediaUrl || ''} onChange={(e) => updateWelcome({ mediaUrl: e.target.value })} placeholder="https://..." />
              </div>
            </div>

            <Separator />

            {/* End screen */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Tela Final</h3>
              <div>
                <Label className="text-xs">Título</Label>
                <Input value={es.title || ''} onChange={(e) => updateEnd({ title: e.target.value })} placeholder="Obrigado!" />
              </div>
              <div>
                <Label className="text-xs">Descrição</Label>
                <Textarea value={es.description || ''} onChange={(e) => updateEnd({ description: e.target.value })} rows={3} placeholder="Suas respostas foram enviadas." />
              </div>
              <div>
                <Label className="text-xs">URL de redirecionamento</Label>
                <Input value={es.redirectUrl || ''} onChange={(e) => updateEnd({ redirectUrl: e.target.value })} placeholder="https://..." />
              </div>
              {es.redirectUrl && (
                <div>
                  <Label className="text-xs">Texto do botão</Label>
                  <Input value={es.buttonText || ''} onChange={(e) => updateEnd({ buttonText: e.target.value })} placeholder="Continuar" />
                </div>
              )}
            </div>

            <Separator />

            {/* Progress bar */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Geral</h3>
              <div className="flex items-center justify-between">
                <Label className="text-xs">Barra de progresso</Label>
                <Switch
                  checked={quiz.settings?.showProgressBar !== false}
                  onCheckedChange={(v) => onUpdate({ settings: { ...quiz.settings, showProgressBar: v } } as any)}
                />
              </div>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

export default function QuizBuilderPage() {
  return (
    <MainLayout fullWidth showSearch={false}>
      <ReactFlowProvider>
        <QuizBuilderInner />
      </ReactFlowProvider>
    </MainLayout>
  );
}
