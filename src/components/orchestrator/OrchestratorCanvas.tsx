import { useCallback, useRef, useState, useEffect } from 'react';
import {
  ReactFlow, Controls, Background, useNodesState, useEdgesState,
  addEdge, Connection, Edge, Node, BackgroundVariant, MiniMap,
  ConnectionMode, useReactFlow, ConnectionLineType, MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { OrchestratorSidebar } from './OrchestratorSidebar';
import { OrchestratorPromptPanel } from './OrchestratorPromptPanel';
import { OrchestratorNodeProperties } from './OrchestratorNodeProperties';
import {
  OrchestratorTriggerNode, OrchestratorAgentNode, OrchestratorPipelineNode,
  OrchestratorTagNode, OrchestratorDepartmentNode, OrchestratorFlowNode,
  OrchestratorDelayNode, OrchestratorConditionNode, OrchestratorHumanNode,
  OrchestratorDocumentNode,
} from './OrchestratorNodes';
import { OrchestratorNodeType } from '@/types/orchestrator';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAIAgents } from '@/hooks/useAIAgents';
import { useTags } from '@/hooks/useTags';
import { useFlows } from '@/hooks/useFlows';
import { usePipelines, usePipelineColumns } from '@/hooks/usePipelines';

const nodeTypes = {
  'orch-trigger': OrchestratorTriggerNode,
  'orch-agent': OrchestratorAgentNode,
  'orch-pipeline': OrchestratorPipelineNode,
  'orch-tag': OrchestratorTagNode,
  'orch-department': OrchestratorDepartmentNode,
  'orch-flow': OrchestratorFlowNode,
  'orch-delay': OrchestratorDelayNode,
  'orch-condition': OrchestratorConditionNode,
  'orch-human': OrchestratorHumanNode,
  'orch-document': OrchestratorDocumentNode,
};

let nodeId = 1;
const getId = () => `orch_${nodeId++}`;

export interface OrchestratorCanvasHandle {
  save: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  undo: () => void;
  getHistory: () => VersionSnapshot[];
  restoreVersion: (version: VersionSnapshot) => void;
}

export interface VersionSnapshot {
  timestamp: string;
  nodes: any[];
  edges: any[];
  promptContent: string;
}

interface OrchestratorCanvasProps {
  promptId: string;
  name: string;
  onNameChange: (name: string) => void;
  isActive: boolean;
  onActiveChange: (active: boolean) => void;
  promptContent: string;
  onPromptContentChange: (content: string) => void;
  orchestrationNodes: Node[] | null;
  orchestrationEdges: Edge[] | null;
  orchestrationHistory?: VersionSnapshot[];
  onSave: (nodes: Node[], edges: Edge[], history: VersionSnapshot[]) => void;
  isSaving: boolean;
  initialTriggerData?: { triggerType: string; triggerTags: string[]; triggerKeywords: any[] };
  onUnsavedChangesChange?: (hasChanges: boolean) => void;
  canvasRef?: React.MutableRefObject<OrchestratorCanvasHandle | null>;
  syncEnabled: boolean;
  onSyncEnabledChange: (enabled: boolean) => void;
  organizationId?: string;
}

function OrchestratorCanvasInner({
  promptId, name, onNameChange, isActive, onActiveChange,
  promptContent, onPromptContentChange,
  orchestrationNodes, orchestrationEdges, orchestrationHistory: initialHistory,
  onSave, isSaving, initialTriggerData,
  onUnsavedChangesChange, canvasRef,
  syncEnabled, onSyncEnabledChange,
  organizationId,
}: OrchestratorCanvasProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const defaultNodes: Node[] = [{
    id: 'trigger-1',
    type: 'orch-trigger',
    position: { x: 50, y: 200 },
    data: {
      label: 'Entrada',
      triggerType: initialTriggerData?.triggerType || 'disabled',
      triggerTags: initialTriggerData?.triggerTags || [],
      triggerKeywords: initialTriggerData?.triggerKeywords || [],
    },
  }];
  const [nodes, setNodes, onNodesChange] = useNodesState(defaultNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [promptPanelCollapsed, setPromptPanelCollapsed] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSavedState, setLastSavedState] = useState('');
  const [isApplyingToFlow, setIsApplyingToFlow] = useState(false);
  const [versionHistory, setVersionHistory] = useState<VersionSnapshot[]>(initialHistory || []);

  const { zoomIn, zoomOut, screenToFlowPosition } = useReactFlow();

  // Data for prompt-to-flow context
  const { data: agents = [] } = useAIAgents();
  const { data: tags = [] } = useTags();
  const { data: flows = [] } = useFlows();
  const { data: pipelines = [] } = usePipelines();

  // Load orchestration data
  useEffect(() => {
    if (!isInitialized && orchestrationNodes) {
      if (orchestrationNodes.length > 0) {
        setNodes(orchestrationNodes);
        const maxId = orchestrationNodes.reduce((max: number, node: Node) => {
          const match = node.id.match(/orch_(\d+)/);
          return match ? Math.max(max, parseInt(match[1])) : max;
        }, 0);
        nodeId = maxId + 1;
      }
      if (orchestrationEdges) {
        setEdges(orchestrationEdges);
      }
      const state = JSON.stringify({ nodes: orchestrationNodes, edges: orchestrationEdges });
      setLastSavedState(state);
      setIsInitialized(true);
    }
  }, [orchestrationNodes, orchestrationEdges, isInitialized, setNodes, setEdges]);

  // Track changes
  useEffect(() => {
    if (isInitialized && lastSavedState) {
      const current = JSON.stringify({ nodes, edges });
      const changed = current !== lastSavedState;
      setHasUnsavedChanges(changed);
      onUnsavedChangesChange?.(changed);
    }
  }, [nodes, edges, isInitialized, lastSavedState, onUnsavedChangesChange]);

  // Expose imperative handle
  useEffect(() => {
    if (canvasRef) {
      canvasRef.current = {
        save: () => handleSave(),
        zoomIn: () => zoomIn(),
        zoomOut: () => zoomOut(),
        undo: () => {
          if (versionHistory.length === 0) {
            toast.error('Nenhuma versão anterior disponível');
            return;
          }
          const lastVersion = versionHistory[versionHistory.length - 1];
          restoreVersion(lastVersion);
        },
        getHistory: () => versionHistory,
        restoreVersion,
      };
    }
  });

  const restoreVersion = useCallback((version: VersionSnapshot) => {
    setNodes(version.nodes);
    setEdges(version.edges);
    if (version.promptContent) {
      onPromptContentChange(version.promptContent);
    }
    // Update nodeId counter
    const maxId = version.nodes.reduce((max: number, node: any) => {
      const match = node.id.match(/orch_(\d+)/);
      return match ? Math.max(max, parseInt(match[1])) : max;
    }, 0);
    nodeId = maxId + 1;
    toast.success('Versão restaurada! Salve para confirmar.');
  }, [setNodes, setEdges, onPromptContentChange]);

  const handleDeleteNode = useCallback((id: string) => {
    setNodes(nds => nds.filter(n => n.id !== id));
    setEdges(eds => eds.filter(e => e.source !== id && e.target !== id));
    setSelectedNode(null);
    toast.success('Bloco excluído');
  }, [setNodes, setEdges]);

  const handleDeleteEdge = useCallback((edgeId: string) => {
    setEdges((eds) => eds.filter((e) => e.id !== edgeId));
    setSelectedEdge(null);
    toast.success('Conexão excluída');
  }, [setEdges]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selectedNode) {
          if (selectedNode.type === 'orch-trigger') {
            toast.error('Não é possível excluir o gatilho');
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
  }, [selectedNode, selectedEdge, handleDeleteNode, handleDeleteEdge]);

  const handleSave = useCallback(async () => {
    // Save current state to history before overwriting
    const snapshot: VersionSnapshot = {
      timestamp: new Date().toISOString(),
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
      promptContent: promptContent,
    };
    const newHistory = [...versionHistory, snapshot].slice(-20); // keep last 20
    setVersionHistory(newHistory);

    onSave(nodes, edges, newHistory);
    const state = JSON.stringify({ nodes, edges });
    setLastSavedState(state);
    setHasUnsavedChanges(false);

    // If sync enabled, update prompt from flow
    if (syncEnabled) {
      try {
        const { data, error } = await supabase.functions.invoke('flow-to-prompt', {
          body: { nodes, edges },
        });
        if (!error && data?.prompt) {
          onPromptContentChange(data.prompt);
        }
      } catch (err) {
        console.error('flow-to-prompt error:', err);
      }
    }
  }, [nodes, edges, onSave, syncEnabled, onPromptContentChange, promptContent, versionHistory]);

  // Apply prompt to flow (prompt -> flow)
  const handleApplyToFlow = useCallback(async (prompt: string) => {
    if (!prompt.trim()) return;
    setIsApplyingToFlow(true);
    try {
      const availableAgents = agents.map(a => ({ id: a.id, name: a.name }));
      const availableTags = tags.map(t => ({ id: t.id, name: t.name }));
      const availablePipelines = pipelines.map(p => ({ id: p.id, name: p.name }));
      const availableFlows = flows.map(f => ({ id: f.id, name: f.name }));

      const { data, error } = await supabase.functions.invoke('prompt-to-flow', {
        body: { prompt, availableAgents, availableTags, availablePipelines, availableFlows },
      });
      if (error) throw error;
      if (data?.nodes && data?.edges) {
        setNodes(data.nodes);
        setEdges(data.edges);
        // Update nodeId counter
        const maxId = data.nodes.reduce((max: number, node: any) => {
          const match = node.id.match(/orch_(\d+)/);
          return match ? Math.max(max, parseInt(match[1])) : max;
        }, 0);
        nodeId = maxId + 1;
        toast.success('Fluxo atualizado a partir do prompt!');
      }
    } catch (err) {
      console.error('prompt-to-flow error:', err);
      toast.error('Erro ao aplicar prompt ao fluxo');
    } finally {
      setIsApplyingToFlow(false);
    }
  }, [agents, tags, pipelines, flows, setNodes, setEdges]);

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
    setSelectedEdge(null);
  }, []);

  const handleEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    setSelectedEdge(edge.id);
    setSelectedNode(null);
  }, []);

  const handleNodeUpdate = useCallback((nodeId: string, data: Record<string, unknown>) => {
    setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n));
    setSelectedNode(prev => prev?.id === nodeId ? { ...prev, data: { ...prev.data, ...data } } : prev);
  }, [setNodes]);

  const onConnect = useCallback(
    (params: Connection) => setEdges(eds => addEdge({
      ...params,
      type: 'default',
      animated: true,
      style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: 'hsl(var(--primary))' },
    }, eds)),
    [setEdges]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const type = event.dataTransfer.getData('application/reactflow') as OrchestratorNodeType;
    const label = event.dataTransfer.getData('application/reactflow-label');
    if (!type) return;

    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const newNode: Node = { id: getId(), type, position, data: { label } };
    setNodes(nds => nds.concat(newNode));
  }, [setNodes, screenToFlowPosition]);

  const onDragStart = (event: React.DragEvent, nodeType: OrchestratorNodeType, label: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.setData('application/reactflow-label', label);
    event.dataTransfer.effectAllowed = 'move';
  };

  const handlePaneClick = useCallback(() => {
    setSelectedNode(null);
    setSelectedEdge(null);
  }, []);

  return (
    <div className="flex h-full">
      <OrchestratorSidebar
        onDragStart={onDragStart}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      <div className="flex-1 h-full relative" ref={reactFlowWrapper}>
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
          <Controls className="!bg-card !border-border !shadow-lg [&>button]:!bg-card [&>button]:!border-border [&>button]:!text-foreground hover:[&>button]:!bg-muted" />
          <MiniMap
            className="!bg-card !border-border"
            nodeColor={(node) => {
              switch (node.type) {
                case 'orch-trigger': return '#8b5cf6';
                case 'orch-agent': return '#7c3aed';
                case 'orch-pipeline': return '#3b82f6';
                case 'orch-tag': return '#f59e0b';
                case 'orch-department': return '#06b6d4';
                case 'orch-flow': return '#6366f1';
                case 'orch-delay': return '#64748b';
                case 'orch-condition': return '#eab308';
                case 'orch-human': return '#22c55e';
                case 'orch-document': return '#f43f5e';
                default: return '#6b7280';
              }
            }}
          />
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} className="!bg-background" />
        </ReactFlow>

        {/* Node Properties Panel (overlays canvas) */}
        {selectedNode && (
          <OrchestratorNodeProperties
            node={selectedNode}
            onClose={() => setSelectedNode(null)}
            onUpdate={handleNodeUpdate}
            onDelete={() => handleDeleteNode(selectedNode.id)}
            organizationId={organizationId}
          />
        )}
      </div>

      <OrchestratorPromptPanel
        content={promptContent}
        onChange={onPromptContentChange}
        agentName={name}
        isCollapsed={promptPanelCollapsed}
        onToggleCollapse={() => setPromptPanelCollapsed(!promptPanelCollapsed)}
        syncEnabled={syncEnabled}
        onSyncEnabledChange={onSyncEnabledChange}
        onApplyToFlow={handleApplyToFlow}
        isApplyingToFlow={isApplyingToFlow}
        organizationId={organizationId}
        masterPromptId={promptId}
      />
    </div>
  );
}

export function OrchestratorCanvas(props: OrchestratorCanvasProps) {
  return <OrchestratorCanvasInner {...props} />;
}
