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
import { ArrowLeft, Save, Play, Copy, Eye, Loader2, ZoomIn, ZoomOut, Minus, Plus, Settings, Undo2, Redo2 } from 'lucide-react';
import { ReactFlowProvider } from '@xyflow/react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import PublicQuizPage from './PublicQuizPage';
import { getPublicAppOrigin } from '@/lib/publicOrigin';

let groupCounter = 1;
const getGroupId = () => `group_${groupCounter++}`;

const GROUP_NODE_FALLBACK_WIDTH = 320;
const GROUP_NODE_HEADER_HEIGHT = 36;
const GROUP_NODE_BLOCK_HEIGHT = 34;
const GROUP_NODE_PADDING = 16;

function getEstimatedGroupHeight(node: Node) {
  const blocks = Array.isArray(node.data?.blocks) ? node.data.blocks : [];
  const visibleRows = Math.max(blocks.length, 1);

  return GROUP_NODE_HEADER_HEIGHT + GROUP_NODE_PADDING + visibleRows * GROUP_NODE_BLOCK_HEIGHT;
}

function isPointInsideGroupNode(node: Node, position: { x: number; y: number }) {
  const width = node.measured?.width ?? node.width ?? GROUP_NODE_FALLBACK_WIDTH;
  const height = node.measured?.height ?? node.height ?? getEstimatedGroupHeight(node);

  return (
    position.x >= node.position.x &&
    position.x <= node.position.x + width &&
    position.y >= node.position.y &&
    position.y <= node.position.y + height
  );
}

function QuizBuilderInner() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const quizId = searchParams.get('id');
  const { data: quizzes, updateQuiz } = useQuizzes();
  const quiz = quizzes?.find(q => q.id === quizId);

  const [localQuizName, setLocalQuizName] = useState('');
  const [isNameFocused, setIsNameFocused] = useState(false);

  useEffect(() => {
    if (quiz && !isNameFocused) {
      setLocalQuizName(quiz.name);
    }
  }, [quiz?.name, quiz?.id, isNameFocused]);

  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChangeRaw] = useNodesState<Node>([
    { id: 'start-1', type: 'quiz-start', position: { x: 100, y: 200 }, data: { label: 'Início' } } as Node,
  ]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Prevent React Flow from removing nodes on overlap/drop — only allow explicit deletes
  const isDroppingRef = useRef(false);
  const onNodesChange = useCallback((changes: any[]) => {
    const filtered = changes.filter((c: any) => {
      if (c.type === 'remove' && isDroppingRef.current) return false;
      return true;
    });
    if (filtered.length > 0) onNodesChangeRaw(filtered);
  }, [onNodesChangeRaw]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedBlockIdx, setSelectedBlockIdx] = useState<number | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Undo/Redo history
  type Snapshot = { nodes: Node[]; edges: Edge[] };
  const historyRef = useRef<Snapshot[]>([]);
  const historyIndexRef = useRef(-1);
  const isUndoRedoRef = useRef(false);

  const pushHistory = useCallback((n: Node[], e: Edge[]) => {
    if (isUndoRedoRef.current) return;
    const snap: Snapshot = { nodes: JSON.parse(JSON.stringify(n)), edges: JSON.parse(JSON.stringify(e)) };
    const next = historyIndexRef.current + 1;
    historyRef.current = historyRef.current.slice(0, next);
    historyRef.current.push(snap);
    historyIndexRef.current = next;
  }, []);

  const canUndo = historyIndexRef.current > 0;
  const canRedo = historyIndexRef.current < historyRef.current.length - 1;

  const handleUndo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    isUndoRedoRef.current = true;
    historyIndexRef.current -= 1;
    const snap = historyRef.current[historyIndexRef.current];
    setNodes(JSON.parse(JSON.stringify(snap.nodes)));
    setEdges(JSON.parse(JSON.stringify(snap.edges)));
    setTimeout(() => { isUndoRedoRef.current = false; }, 50);
  }, [setNodes, setEdges]);

  const handleRedo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    isUndoRedoRef.current = true;
    historyIndexRef.current += 1;
    const snap = historyRef.current[historyIndexRef.current];
    setNodes(JSON.parse(JSON.stringify(snap.nodes)));
    setEdges(JSON.parse(JSON.stringify(snap.edges)));
    setTimeout(() => { isUndoRedoRef.current = false; }, 50);
  }, [setNodes, setEdges]);

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

  // Push initial history snapshot after load
  useEffect(() => {
    if (isInitialized && historyRef.current.length === 0) {
      pushHistory(nodes, edges);
    }
  }, [isInitialized]);

  // Track changes for undo history (debounced)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!isInitialized || isUndoRedoRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      pushHistory(nodes, edges);
    }, 300);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [nodes, edges, isInitialized, pushHistory]);

  // Keyboard shortcuts Ctrl+Z / Ctrl+Shift+Z
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'Z' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleUndo, handleRedo]);

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
    isDroppingRef.current = true;
    setTimeout(() => { isDroppingRef.current = false; }, 200);
    const blockType = event.dataTransfer.getData('application/quizflow') as QuizNodeType;
    const blockLabel = event.dataTransfer.getData('application/quizflow-label');
    if (!blockType || !reactFlowWrapper.current) return;

    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });

    // Check if dropped on existing group node
    const targetNode = [...nodes]
      .reverse()
      .find((node) => node.type === 'quiz-group' && isPointInsideGroupNode(node, position));

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
      toast.success('Wizzy Quiz salvo!');
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

  const publicUrl = quiz?.public_token ? `${getPublicAppOrigin()}/q/${quiz.public_token}` : '';

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
            value={localQuizName}
            onChange={(e) => setLocalQuizName(e.target.value)}
            onFocus={() => setIsNameFocused(true)}
            onBlur={() => {
              setIsNameFocused(false);
              if (localQuizName !== quiz.name) {
                updateQuiz.mutate({ id: quizId, name: localQuizName });
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.currentTarget.blur();
              }
            }}
            className="text-lg font-semibold border-none shadow-none h-auto p-0 focus-visible:ring-0 max-w-xs bg-transparent"
          />
          <Badge variant={quiz.is_active ? 'default' : 'secondary'}>
            {quiz.is_active ? 'Ativo' : 'Rascunho'}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleUndo} disabled={!canUndo} title="Desfazer (Ctrl+Z)">
            <Undo2 className="h-3.5 w-3.5" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleRedo} disabled={!canRedo} title="Refazer (Ctrl+Shift+Z)">
            <Redo2 className="h-3.5 w-3.5" />
          </Button>
          <Separator orientation="vertical" className="h-6" />
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
            <DialogTitle className="text-sm">Visualização do Wizzy Quiz</DialogTitle>
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
  const [localWelcome, setLocalWelcome] = useState<Record<string, any>>(() => (quiz.welcome_screen || {}) as Record<string, any>);
  const [localEnd, setLocalEnd] = useState<Record<string, any>>(() => (quiz.end_screen || {}) as Record<string, any>);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ws = localWelcome;
  const es = localEnd;

  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  const localWelcomeRef = useRef(localWelcome);
  localWelcomeRef.current = localWelcome;
  const localEndRef = useRef(localEnd);
  localEndRef.current = localEnd;

  // Sync state when drawer is opened or quiz ID changes
  useEffect(() => {
    if (open) {
      setLocalWelcome((quiz.welcome_screen || {}) as Record<string, any>);
      setLocalEnd((quiz.end_screen || {}) as Record<string, any>);
    }
  }, [open, quiz.id]);

  const debouncedUpdate = useCallback((welcomePatch?: Record<string, any>, endPatch?: Record<string, any>) => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    const nextWelcome = welcomePatch ? { ...localWelcomeRef.current, ...welcomePatch } : localWelcomeRef.current;
    const nextEnd = endPatch ? { ...localEndRef.current, ...endPatch } : localEndRef.current;

    debounceTimerRef.current = setTimeout(() => {
      const updates: Partial<Quiz> = {};
      if (welcomePatch) updates.welcome_screen = nextWelcome;
      if (endPatch) updates.end_screen = nextEnd;
      onUpdateRef.current(updates);
    }, 400);
  }, []);

  // Flush pending changes on close/unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        const updates: Partial<Quiz> = {};
        updates.welcome_screen = localWelcomeRef.current;
        updates.end_screen = localEndRef.current;
        onUpdateRef.current(updates);
      }
    };
  }, [open]);

  const updateWelcome = (patch: Record<string, any>) => {
    setLocalWelcome(prev => {
      const merged = { ...prev, ...patch };
      localWelcomeRef.current = merged;
      debouncedUpdate(patch, undefined);
      return merged;
    });
  };

  const updateEnd = (patch: Record<string, any>) => {
    setLocalEnd(prev => {
      const merged = { ...prev, ...patch };
      localEndRef.current = merged;
      debouncedUpdate(undefined, patch);
      return merged;
    });
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent className="w-80 sm:w-96 p-0 flex flex-col">
        <SheetHeader className="p-4 border-b">
          <SheetTitle className="text-sm">Configurações do Wizzy Quiz</SheetTitle>
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
