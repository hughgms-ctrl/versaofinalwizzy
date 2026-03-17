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

import { FlowSidebar } from './FlowSidebar';
import { FlowToolbar } from './FlowToolbar';
import { NodePropertiesPanel } from './NodePropertiesPanel';
import { FlowTestPanel } from './FlowTestPanel';
import { MasterPromptDialog } from './MasterPromptDialog';
import { StartNode } from './nodes/StartNode';
import { ContentBlockNode } from './nodes/ContentBlockNode';
import { ButtonsMessageNode, ListMessageNode } from './nodes/MessageNodes';
import {
  TagActionNode,
  PipelineActionNode,
  TransferActionNode,
  DelayActionNode,
  WebhookActionNode,
  DepartmentActionNode,
  FlowActionNode,
  DocumentActionNode,
  WorkspaceActionNode,
} from './nodes/ActionNodes';
import { ConditionNode, UserInputNode, RandomizerNode, SmartDelayNode } from './nodes/LogicNodes';
import { AIHandoffNode, AIMasterNode, AIReturnNode } from './nodes/AINodes';
import { FlowNodeType } from '@/types/flow';
import { useFlow, useSaveFlow, useCreateFlow } from '@/hooks/useFlows';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const nodeTypes = {
  start: StartNode,
  'content-block': ContentBlockNode,
  'message-buttons': ButtonsMessageNode,
  'message-list': ListMessageNode,
  'action-tag': TagActionNode,
  'action-pipeline': PipelineActionNode,
  'action-transfer': TransferActionNode,
  'action-delay': DelayActionNode,
  'action-webhook': WebhookActionNode,
  'action-flow': FlowActionNode,
  'action-department': DepartmentActionNode,
  'action-document': DocumentActionNode,
  'action-workspace': WorkspaceActionNode,
  'condition': ConditionNode,
  'user-input': UserInputNode,
  'randomizer': RandomizerNode,
  'smart-delay': SmartDelayNode,
  'ai-handoff': AIHandoffNode,
  'ai-return': AIReturnNode,
};

const initialNodes: Node[] = [
  {
    id: 'start-1',
    type: 'start',
    position: { x: 250, y: 200 },
    data: { label: 'Início' },
  },
];

const initialEdges: Edge[] = [];

let nodeId = 1;
const getId = () => `node_${nodeId++}`;

function FlowCanvasInner() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const flowId = searchParams.get('id');

  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [isConnecting, setIsConnecting] = useState(false);
  const [flowName, setFlowName] = useState('Novo Fluxo');
  const [isActive, setIsActive] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [showTestPanel, setShowTestPanel] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [flowWorkspaceId, setFlowWorkspaceId] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSavedState, setLastSavedState] = useState<string>('');
  const [masterPrompt, setMasterPrompt] = useState('');
  const [isMasterActive, setIsMasterActive] = useState(false);
  const [showMinimap, setShowMinimap] = useState(false);
  const [showMasterPromptDialog, setShowMasterPromptDialog] = useState(false);

  const { zoomIn, zoomOut, setViewport, getViewport, screenToFlowPosition } = useReactFlow();
  const { data: flow, isLoading } = useFlow(flowId);
  const saveFlow = useSaveFlow();
  const createFlow = useCreateFlow();

  // Load flow data when available
  useEffect(() => {
    if (flow && !isInitialized) {
      setFlowName(flow.name);
      setIsActive(flow.is_active);
      setFlowWorkspaceId(flow.workspace_id || null);
      setMasterPrompt(flow.master_prompt || '');
      setIsMasterActive(flow.is_master_active || false);

      if (flow.nodes && flow.nodes.length > 0) {
        setNodes(flow.nodes as Node[]);
        // Update nodeId counter to avoid conflicts
        const maxId = flow.nodes.reduce((max: number, node: Node) => {
          const match = node.id.match(/node_(\d+)/);
          return match ? Math.max(max, parseInt(match[1])) : max;
        }, 0);
        nodeId = maxId + 1;
      }

      if (flow.edges) {
        setEdges(flow.edges as Edge[]);
      }

      // Store initial state for comparison
      const initialState = JSON.stringify({ nodes: flow.nodes, edges: flow.edges, name: flow.name });
      setLastSavedState(initialState);
      setHasUnsavedChanges(false);
      setIsInitialized(true);
    }
  }, [flow, isInitialized, setNodes, setEdges]);

  // Reset initialization when flowId changes
  useEffect(() => {
    setIsInitialized(false);
    setHasUnsavedChanges(false);
  }, [flowId]);

  // Listen for simulation events to highlight nodes
  useEffect(() => {
    const handleNodeHighlight = (event: any) => {
      const { nodeId } = event.detail;
      setNodes((nds) =>
        nds.map((node) => ({
          ...node,
          className: node.id === nodeId
            ? 'ring-4 ring-green-500 ring-offset-2 transition-all duration-300'
            : node.className?.replace(/ring-4 ring-green-500 ring-offset-2 transition-all duration-300/g, '')
        }))
      );
    };

    window.addEventListener('flow:node:executing', handleNodeHighlight);
    return () => window.removeEventListener('flow:node:executing', handleNodeHighlight);
  }, [setNodes]);

  // Track unsaved changes
  useEffect(() => {
    if (!isInitialized && !flowId) {
      // New flow - mark as needing save
      setHasUnsavedChanges(true);
      return;
    }

    if (isInitialized && lastSavedState) {
      const currentState = JSON.stringify({ nodes, edges, name: flowName, masterPrompt, isMasterActive });
      setHasUnsavedChanges(currentState !== lastSavedState);
    }
  }, [nodes, edges, flowName, isInitialized, lastSavedState, flowId]);

  // Handle keyboard delete
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't delete if typing in an input
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      if ((event.key === 'Delete' || event.key === 'Backspace')) {
        if (selectedNode) {
          // Don't delete start node
          if (selectedNode.type === 'start') {
            toast.error('Não é possível excluir o nó inicial');
            return;
          }
          handleDeleteNode(selectedNode.id);
        } else if (selectedEdge) {
          handleDeleteEdge(selectedEdge);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNode, selectedEdge]);

  const handleDeleteNode = useCallback((nodeId: string) => {
    setNodes((nds) => nds.filter((node) => node.id !== nodeId));
    setEdges((eds) => eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
    setSelectedNode(null);
    toast.success('Bloco excluído');
  }, [setNodes, setEdges]);

  const handleSave = useCallback(async () => {
    // If no flowId, create a new flow first
    if (!flowId) {
      createFlow.mutate(
        { name: flowName, description: '' },
        {
          onSuccess: (newFlow: any) => {
            // Update URL with new flow ID
            setSearchParams({ id: newFlow.id });
            // Now save the nodes and edges
            saveFlow.mutate({
              id: newFlow.id,
              name: flowName,
              nodes,
              edges,
              is_active: isActive,
              master_prompt: masterPrompt,
              is_master_active: isMasterActive,
            }, {
              onSuccess: () => {
                const currentState = JSON.stringify({ nodes, edges, name: flowName, masterPrompt, isMasterActive });
                setLastSavedState(currentState);
                setHasUnsavedChanges(false);
              }
            });
          }
        }
      );
      return;
    }

    saveFlow.mutate({
      id: flowId,
      name: flowName,
      nodes,
      edges,
      is_active: isActive,
      master_prompt: masterPrompt,
      is_master_active: isMasterActive,
    }, {
      onSuccess: () => {
        const currentState = JSON.stringify({ nodes, edges, name: flowName, masterPrompt, isMasterActive });
        setLastSavedState(currentState);
        setHasUnsavedChanges(false);
      }
    });
  }, [flowId, flowName, nodes, edges, isActive, flowWorkspaceId, masterPrompt, isMasterActive, saveFlow, createFlow, setSearchParams]);

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.type !== 'start') {
      setSelectedNode(node);
    }
  }, []);

  const handleNodeUpdate = useCallback((nodeId: string, data: Record<string, unknown>) => {
    setNodes((nds) =>
      nds.map((node) =>
        node.id === nodeId ? { ...node, data: { ...node.data, ...data } } : node
      )
    );
    // Also update selectedNode so panel reflects changes
    setSelectedNode((prev) =>
      prev?.id === nodeId ? { ...prev, data: { ...prev.data, ...data } } : prev
    );
  }, [setNodes]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({
      ...params,
      type: 'default',
      animated: true,
      style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: 'hsl(var(--primary))',
      },
    }, eds)),
    [setEdges]
  );

  const onConnectStart = useCallback(() => {
    setIsConnecting(true);
  }, []);

  const onConnectEnd = useCallback(() => {
    setIsConnecting(false);
  }, []);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow') as FlowNodeType;
      const label = event.dataTransfer.getData('application/reactflow-label');

      if (typeof type === 'undefined' || !type) {
        return;
      }

      if (!reactFlowWrapper.current) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode: Node = {
        id: getId(),
        type,
        position,
        data: {
          label,
          // Initialize content-block with empty items
          ...(type === 'content-block' ? { items: [] } : {}),
        },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [setNodes, screenToFlowPosition]
  );

  const onDragStart = (event: React.DragEvent, nodeType: FlowNodeType, label: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.setData('application/reactflow-label', label);
    event.dataTransfer.effectAllowed = 'move';
  };

  const handlePaneClick = useCallback(() => {
    setSelectedNode(null);
    setSelectedEdge(null);
  }, []);

  const handleEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    setSelectedEdge(edge.id);
    setSelectedNode(null);
  }, []);

  const handleDeleteEdge = useCallback((edgeId: string) => {
    setEdges((eds) => eds.filter((e) => e.id !== edgeId));
    setSelectedEdge(null);
    toast.success('Conexão excluída');
  }, [setEdges]);

  if (isLoading && flowId) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <FlowSidebar
        onDragStart={onDragStart}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      <div className="flex-1 h-full" ref={reactFlowWrapper}>
        <ReactFlow
          nodes={nodes}
          edges={edges.map(e => ({
            ...e,
            selected: e.id === selectedEdge,
            style: {
              ...e.style,
              stroke: e.id === selectedEdge ? 'hsl(var(--destructive))' : 'hsl(var(--primary))',
              strokeWidth: e.id === selectedEdge ? 3 : 2,
            },
          }))}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectStart={onConnectStart}
          onConnectEnd={onConnectEnd}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onNodeClick={handleNodeClick}
          onEdgeClick={handleEdgeClick}
          onPaneClick={handlePaneClick}
          nodeTypes={nodeTypes}
          connectionMode={ConnectionMode.Strict}
          connectionLineType={ConnectionLineType.Bezier}
          connectionLineStyle={{ stroke: 'hsl(var(--primary))', strokeWidth: 2 }}
          fitView
          snapToGrid
          snapGrid={[15, 15]}
          className={`bg-muted/30 ${isConnecting ? 'connecting' : ''}`}
          defaultEdgeOptions={{
            type: 'default',
            animated: true,
            style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: 'hsl(var(--primary))',
            },
          }}
          deleteKeyCode={null}
          proOptions={{ hideAttribution: true }}
        >
          <Panel position="top-right">
            <FlowToolbar
              flowName={flowName}
              onNameChange={setFlowName}
              isActive={isActive}
              onActiveChange={setIsActive}
              isSaving={saveFlow.isPending || createFlow.isPending}
              onSave={handleSave}
              onTest={() => setShowTestPanel(true)}
              canTest={!!flowId}
              hasUnsavedChanges={hasUnsavedChanges}
              onZoomIn={() => zoomIn()}
              onZoomOut={() => zoomOut()}
              showMinimap={showMinimap}
              onMinimapToggle={() => setShowMinimap(!showMinimap)}
              masterPrompt={masterPrompt}
              onMasterPromptChange={setMasterPrompt}
              isMasterActive={isMasterActive}
              onMasterActiveChange={setIsMasterActive}
              onOpenMasterPrompt={() => setShowMasterPromptDialog(true)}
            />
          </Panel>
          <Controls className="!bg-card !border-border !shadow-lg [&>button]:!bg-card [&>button]:!border-border [&>button]:!text-foreground hover:[&>button]:!bg-muted" />
          {showMinimap && (
            <MiniMap
              className="!bg-card !border-border"
              nodeColor={(node) => {
                switch (node.type) {
                  case 'start': return '#22c55e';
                  case 'content-block': return '#3b82f6';
                  case 'message-buttons': return '#6366f1';
                  case 'message-list': return '#06b6d4';
                  case 'action-tag': return '#f59e0b';
                  case 'action-pipeline': return '#22c55e';
                  case 'action-transfer': return '#f43f5e';
                  case 'action-delay': return '#64748b';
                  case 'action-webhook': return '#f97316';
                  case 'condition': return '#eab308';
                  case 'user-input': return '#14b8a6';
                  case 'ai-handoff': return '#8b5cf6';
                  case 'ai-return': return '#d946ef';
                  case 'randomizer': return '#a855f7';
                  case 'smart-delay': return '#f97316';
                  default: return '#6b7280';
                }
              }}
            />
          )}
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} className="!bg-background" />
        </ReactFlow>
      </div>

      {/* Node Properties Dialog */}
      <NodePropertiesPanel
        node={selectedNode}
        onClose={() => setSelectedNode(null)}
        onUpdate={handleNodeUpdate}
        onDelete={selectedNode ? () => handleDeleteNode(selectedNode.id) : undefined}
        onSave={handleSave}
        isSaving={saveFlow.isPending || createFlow.isPending}
        hasUnsavedChanges={hasUnsavedChanges}
        organizationId={flow?.organization_id}
        flowId={flowId || undefined}
        workspaceId={flowWorkspaceId}
      />

      {/* Test Panel */}
      {flowId && (
        <FlowTestPanel
          open={showTestPanel}
          onOpenChange={setShowTestPanel}
          flowId={flowId}
          flowName={flowName}
        />
      )}

      {/* Global styles for showing handles during connection */}
      <style>{`
        .react-flow.connecting .react-flow__node .react-flow__handle {
          opacity: 1 !important;
        }
      `}</style>
      <MasterPromptDialog
        open={showMasterPromptDialog}
        onOpenChange={setShowMasterPromptDialog}
        prompt={masterPrompt}
        onSave={(newPrompt) => {
          setMasterPrompt(newPrompt);
          setHasUnsavedChanges(true);
        }}
        organizationId={flow?.organization_id}
        flowId={flowId || undefined}
      />
    </div>
  );
}

export function FlowCanvas() {
  return <FlowCanvasInner />;
}
