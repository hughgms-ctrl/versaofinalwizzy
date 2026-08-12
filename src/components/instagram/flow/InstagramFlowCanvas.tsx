import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Controls,
  Background,
  BackgroundVariant,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  MarkerType,
  ConnectionLineType,
  type Connection,
  type Edge,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Clock,
  GitBranch,
  MessageSquare,
  MousePointerClick,
  Tag,
  UserCheck,
  Webhook,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { instagramNodeTypes } from './InstagramFlowNodes';
import { InstagramNodeProperties } from './InstagramNodeProperties';
import type { InstagramFlowEdge, InstagramFlowNode, InstagramFlowNodeType } from '@/hooks/useInstagramFlows';

/** Paleta de blocos. Só o que o motor do Instagram sabe executar. */
const PALETTE: Array<{
  type: InstagramFlowNodeType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
  defaults: Record<string, any>;
}> = [
  {
    type: 'ig-message',
    label: 'Enviar mensagem',
    icon: MessageSquare,
    tone: 'text-primary',
    defaults: { text: '', quickReplies: [] },
  },
  {
    type: 'ig-user-input',
    label: 'Esperar resposta',
    icon: MousePointerClick,
    tone: 'text-blue-500',
    defaults: { timeoutMinutes: 60 },
  },
  {
    type: 'ig-delay',
    label: 'Esperar tempo',
    icon: Clock,
    tone: 'text-amber-500',
    defaults: { waitValue: 1, waitUnit: 'hours' },
  },
  {
    type: 'ig-condition',
    label: 'Se / então',
    icon: GitBranch,
    tone: 'text-violet-500',
    defaults: { conditionType: 'variable', variable: 'ultima_resposta', operator: 'contains', value: '' },
  },
  {
    type: 'ig-action-tag',
    label: 'Adicionar etiqueta',
    icon: Tag,
    tone: 'text-emerald-500',
    defaults: { tag: '' },
  },
  {
    type: 'ig-action-transfer',
    label: 'Passar para atendente',
    icon: UserCheck,
    tone: 'text-orange-500',
    defaults: {},
  },
  {
    type: 'ig-action-webhook',
    label: 'Chamar sistema externo',
    icon: Webhook,
    tone: 'text-slate-500',
    defaults: { url: '', method: 'POST' },
  },
];

const INITIAL_NODES: Node[] = [
  { id: 'start', type: 'start', position: { x: 80, y: 200 }, data: {} },
];

interface InstagramFlowCanvasProps {
  initialNodes?: InstagramFlowNode[];
  initialEdges?: InstagramFlowEdge[];
  accountUsername?: string | null;
  accountAvatarUrl?: string | null;
  onChange: (nodes: InstagramFlowNode[], edges: InstagramFlowEdge[]) => void;
}

function CanvasInner({
  initialNodes,
  initialEdges,
  accountUsername,
  accountAvatarUrl,
  onChange,
}: InstagramFlowCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(
    (initialNodes?.length ? initialNodes : INITIAL_NODES) as Node[],
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>((initialEdges || []) as Edge[]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Avisa o formulário a cada mudança, para o botão de salvar enviar o desenho
  // atual sem precisar de um "aplicar" separado.
  useEffect(() => {
    onChange(nodes as unknown as InstagramFlowNode[], edges as unknown as InstagramFlowEdge[]);
  }, [nodes, edges, onChange]);

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((current) => {
        // Uma saída leva a um caminho só. Sem isto, ligar a mesma saída a dois
        // blocos criaria uma bifurcação que o motor não sabe percorrer — ele
        // segue a primeira aresta e a segunda ficaria morta, sem aviso.
        const cleaned = current.filter(
          (e) => !(e.source === connection.source && (e.sourceHandle ?? null) === (connection.sourceHandle ?? null)),
        );
        return addEdge(
          {
            ...connection,
            type: 'smoothstep',
            markerEnd: { type: MarkerType.ArrowClosed },
          },
          cleaned,
        );
      });
    },
    [setEdges],
  );

  const addNode = (item: typeof PALETTE[number]) => {
    const id = `${item.type}_${Date.now()}`;
    setNodes((current) => [
      ...current,
      {
        id,
        type: item.type,
        // Posiciona abaixo do último bloco, para não empilhar tudo no mesmo
        // ponto quando se adiciona vários seguidos.
        position: { x: 380, y: 80 + current.length * 130 },
        data: { ...item.defaults },
      } as Node,
    ]);
    setSelectedNodeId(id);
  };

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) as unknown as InstagramFlowNode | undefined,
    [nodes, selectedNodeId],
  );

  const updateNodeData = (data: Record<string, any>) => {
    setNodes((current) =>
      current.map((n) => (n.id === selectedNodeId ? { ...n, data } : n)),
    );
  };

  const deleteSelectedNode = () => {
    setNodes((current) => current.filter((n) => n.id !== selectedNodeId));
    setEdges((current) =>
      current.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId),
    );
    setSelectedNodeId(null);
  };

  return (
    <div className="flex h-full min-h-[520px] overflow-hidden rounded-lg border">
      <div className="w-52 shrink-0 space-y-1 overflow-y-auto border-r bg-muted/30 p-2">
        <p className="px-1 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Blocos
        </p>
        {PALETTE.map((item) => (
          <Button
            key={item.type}
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 font-normal"
            onClick={() => addNode(item)}
          >
            <item.icon className={cn('h-4 w-4 shrink-0', item.tone)} />
            <span className="truncate text-xs">{item.label}</span>
          </Button>
        ))}
      </div>

      <div className="relative flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, node) => setSelectedNodeId(node.id)}
          onPaneClick={() => setSelectedNodeId(null)}
          nodeTypes={instagramNodeTypes}
          connectionLineType={ConnectionLineType.SmoothStep}
          defaultEdgeOptions={{ type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } }}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
          <Controls />
          <MiniMap pannable zoomable className="!bg-muted" />
        </ReactFlow>
      </div>

      {selectedNode && (
        <InstagramNodeProperties
          node={selectedNode}
          accountUsername={accountUsername}
          accountAvatarUrl={accountAvatarUrl}
          onChange={updateNodeData}
          onClose={() => setSelectedNodeId(null)}
          onDelete={deleteSelectedNode}
        />
      )}
    </div>
  );
}

export function InstagramFlowCanvas(props: InstagramFlowCanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
