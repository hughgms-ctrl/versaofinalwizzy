import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { AppLayout } from "@/fluzz/components/layout/AppLayout";
import { Button } from "@/fluzz/components/ui/button";
import { Input } from "@/fluzz/components/ui/input";
import { toast } from "sonner";
import { ArrowLeft, Save, Trash2, Plus, Square, Circle, Diamond, Type, Minus } from "lucide-react";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  BackgroundVariant,
  Panel,
  NodeTypes,
  Handle,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/fluzz/components/ui/alert-dialog";
import { Textarea } from "@/fluzz/components/ui/textarea";

// Custom node components
const RectangleNode = ({ data, selected }: { data: any; selected: boolean }) => (
  <div 
    className={`px-4 py-2 rounded-lg border-2 bg-card min-w-[120px] text-center ${selected ? 'border-primary shadow-lg' : 'border-border'}`}
  >
    <Handle type="target" position={Position.Top} className="w-3 h-3 !bg-primary" />
    <Handle type="target" position={Position.Left} className="w-3 h-3 !bg-primary" />
    <div className="text-sm font-medium text-foreground">{data.label || "Retângulo"}</div>
    <Handle type="source" position={Position.Bottom} className="w-3 h-3 !bg-primary" />
    <Handle type="source" position={Position.Right} className="w-3 h-3 !bg-primary" />
  </div>
);

const CircleNode = ({ data, selected }: { data: any; selected: boolean }) => (
  <div 
    className={`w-24 h-24 rounded-full border-2 bg-card flex items-center justify-center text-center ${selected ? 'border-primary shadow-lg' : 'border-border'}`}
  >
    <Handle type="target" position={Position.Top} className="w-3 h-3 !bg-primary" />
    <Handle type="target" position={Position.Left} className="w-3 h-3 !bg-primary" />
    <div className="text-sm font-medium text-foreground p-2">{data.label || "Círculo"}</div>
    <Handle type="source" position={Position.Bottom} className="w-3 h-3 !bg-primary" />
    <Handle type="source" position={Position.Right} className="w-3 h-3 !bg-primary" />
  </div>
);

const DiamondNode = ({ data, selected }: { data: any; selected: boolean }) => (
  <div className="relative w-28 h-28">
    <Handle type="target" position={Position.Top} className="w-3 h-3 !bg-primary !top-0" />
    <Handle type="target" position={Position.Left} className="w-3 h-3 !bg-primary !left-0" />
    <div 
      className={`absolute inset-2 border-2 bg-card flex items-center justify-center text-center ${selected ? 'border-primary shadow-lg' : 'border-border'}`}
      style={{ transform: "rotate(45deg)" }}
    >
      <div className="text-xs font-medium text-foreground p-1" style={{ transform: "rotate(-45deg)" }}>
        {data.label || "Decisão"}
      </div>
    </div>
    <Handle type="source" position={Position.Bottom} className="w-3 h-3 !bg-primary !bottom-0" />
    <Handle type="source" position={Position.Right} className="w-3 h-3 !bg-primary !right-0" />
  </div>
);

const TextNode = ({ data, selected }: { data: any; selected: boolean }) => (
  <div 
    className={`px-3 py-1 min-w-[80px] ${selected ? 'ring-2 ring-primary ring-offset-2' : ''}`}
  >
    <div className="text-sm text-foreground">{data.label || "Texto"}</div>
  </div>
);

const nodeTypes: NodeTypes = {
  rectangle: RectangleNode,
  circle: CircleNode,
  diamond: DiamondNode,
  text: TextNode,
};

export default function FlowEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAdmin, isGestor, permissions } = useWorkspace();
  
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [flowName, setFlowName] = useState("");
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [nodeLabel, setNodeLabel] = useState("");
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  const canEdit = isAdmin || isGestor || (permissions as any)?.can_edit_flows;

  const { data: flow, isLoading } = useQuery({
    queryKey: ["flow", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("flows")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  useEffect(() => {
    if (flow) {
      setFlowName(flow.name);
      setNodes((flow.nodes as unknown as Node[]) || []);
      setEdges((flow.edges as unknown as Edge[]) || []);
    }
  }, [flow, setNodes, setEdges]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true, style: { stroke: 'hsl(var(--primary))' } }, eds)),
    [setEdges]
  );

  const addNode = (type: string) => {
    const newNode: Node = {
      id: `${type}-${Date.now()}`,
      type,
      position: { x: 250, y: 150 },
      data: { label: type === 'rectangle' ? 'Processo' : type === 'circle' ? 'Início/Fim' : type === 'diamond' ? 'Decisão' : 'Texto' },
    };
    setNodes((nds) => [...nds, newNode]);
  };

  const onNodeClick = useCallback((_: any, node: Node) => {
    setSelectedNode(node);
    setNodeLabel((node.data?.label as string) || "");
  }, []);

  const updateNodeLabel = () => {
    if (!selectedNode) return;
    setNodes((nds) =>
      nds.map((node) =>
        node.id === selectedNode.id
          ? { ...node, data: { ...node.data, label: nodeLabel } }
          : node
      )
    );
    toast.success("Label atualizado");
  };

  const deleteSelectedNode = () => {
    if (!selectedNode) return;
    setNodes((nds) => nds.filter((node) => node.id !== selectedNode.id));
    setEdges((eds) => eds.filter((edge) => edge.source !== selectedNode.id && edge.target !== selectedNode.id));
    setSelectedNode(null);
    toast.success("Elemento excluído");
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("flows")
        .update({
          name: flowName,
          nodes: nodes as any,
          edges: edges as any,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["flows"] });
      queryClient.invalidateQueries({ queryKey: ["flow", id] });
      toast.success("Fluxo salvo!");
    },
    onError: () => {
      toast.error("Erro ao salvar fluxo");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("flows")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["flows"] });
      toast.success("Fluxo excluído!");
      navigate("/tools/wizzy-flow/workspace/flows");
    },
    onError: () => {
      toast.error("Erro ao excluir fluxo");
    },
  });

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </AppLayout>
    );
  }

  if (!flow) {
    return (
      <AppLayout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Fluxo não encontrado.</p>
          <Button variant="link" onClick={() => navigate("/tools/wizzy-flow/workspace/flows")}>
            Voltar para Fluxos
          </Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-4 h-[calc(100vh-10rem)]">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/tools/wizzy-flow/workspace/flows")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Input
            value={flowName}
            onChange={(e) => setFlowName(e.target.value)}
            className="max-w-xs font-semibold"
            disabled={!canEdit}
          />
          <div className="flex-1" />
          {canEdit && (
            <>
              <Button onClick={() => saveMutation.mutate()} className="gap-2" size="sm" disabled={saveMutation.isPending}>
                <Save size={14} />
                {saveMutation.isPending ? "Salvando..." : "Salvar"}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" className="gap-2">
                    <Trash2 size={14} />
                    Excluir
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir Fluxo?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta ação não pode ser desfeita.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => deleteMutation.mutate()}>
                      Excluir
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </div>

        <div ref={reactFlowWrapper} className="h-full border rounded-lg overflow-hidden bg-muted/30">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={canEdit ? onNodesChange : undefined}
            onEdgesChange={canEdit ? onEdgesChange : undefined}
            onConnect={canEdit ? onConnect : undefined}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            fitView
            snapToGrid
            snapGrid={[15, 15]}
            deleteKeyCode={canEdit ? "Delete" : null}
          >
            <Controls />
            <MiniMap 
              nodeStrokeColor="hsl(var(--primary))"
              nodeColor="hsl(var(--card))"
              nodeBorderRadius={8}
            />
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
            
            {canEdit && (
              <Panel position="top-left" className="bg-card border rounded-lg p-2 shadow-lg">
                <div className="flex gap-2">
                  <Button variant="outline" size="icon" onClick={() => addNode('rectangle')} title="Retângulo">
                    <Square className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => addNode('circle')} title="Círculo">
                    <Circle className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => addNode('diamond')} title="Losango">
                    <Diamond className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => addNode('text')} title="Texto">
                    <Type className="h-4 w-4" />
                  </Button>
                </div>
              </Panel>
            )}

            {selectedNode && canEdit && (
              <Panel position="top-right" className="bg-card border rounded-lg p-4 shadow-lg w-64">
                <div className="space-y-3">
                  <h3 className="font-medium text-sm">Editar Elemento</h3>
                  <div className="space-y-2">
                    <Textarea
                      value={nodeLabel}
                      onChange={(e) => setNodeLabel(e.target.value)}
                      placeholder="Label do elemento"
                      className="text-sm"
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={updateNodeLabel} className="flex-1">
                        Atualizar
                      </Button>
                      <Button size="sm" variant="destructive" onClick={deleteSelectedNode}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </Panel>
            )}
          </ReactFlow>
        </div>
      </div>
    </AppLayout>
  );
}
