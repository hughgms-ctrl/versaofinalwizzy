import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { AppLayout } from "@/fluzz/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/fluzz/components/ui/card";
import { Button } from "@/fluzz/components/ui/button";
import { Input } from "@/fluzz/components/ui/input";
import { toast } from "sonner";
import { Plus, Trash2, GitBranch, Search, ChevronRight } from "lucide-react";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";
import { useAuth } from "@/fluzz/contexts/AuthContext";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/fluzz/components/ui/dialog";
import { Textarea } from "@/fluzz/components/ui/textarea";
import { Label } from "@/fluzz/components/ui/label";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function Flows() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { workspace, isAdmin, isGestor, permissions } = useWorkspace();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [newFlowName, setNewFlowName] = useState("");
  const [newFlowDescription, setNewFlowDescription] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const canEdit = isAdmin || isGestor || (permissions as any)?.can_edit_flows;

  const { data: flows, isLoading } = useQuery({
    queryKey: ["flows", workspace?.id],
    queryFn: async () => {
      if (!workspace) return [];
      const { data, error } = await supabase
        .from("flows")
        .select("*")
        .eq("workspace_id", workspace.id)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!workspace,
  });

  const createFlowMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("flows")
        .insert({
          name: newFlowName,
          description: newFlowDescription,
          workspace_id: workspace!.id,
          created_by: user?.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["flows"] });
      toast.success("Fluxo criado com sucesso!");
      setNewFlowName("");
      setNewFlowDescription("");
      setDialogOpen(false);
      navigate(`/tools/wizzy-flow/workspace/flows/${data.id}`);
    },
    onError: () => {
      toast.error("Erro ao criar fluxo");
    },
  });

  const deleteFlowMutation = useMutation({
    mutationFn: async (flowId: string) => {
      const { error } = await supabase
        .from("flows")
        .delete()
        .eq("id", flowId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["flows"] });
      toast.success("Fluxo excluído com sucesso!");
    },
    onError: () => {
      toast.error("Erro ao excluir fluxo");
    },
  });

  const filteredFlows = flows?.filter(flow => 
    flow.name.toLowerCase().includes(search.toLowerCase()) ||
    (flow.description && flow.description.toLowerCase().includes(search.toLowerCase()))
  );

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Fluxos</h1>
            <p className="text-sm md:text-base text-muted-foreground mt-1">
              Desenhe processos e workflows visuais
            </p>
          </div>
          {canEdit && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2" size="sm">
                  <Plus size={14} />
                  Novo Fluxo
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Criar Novo Fluxo</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome</Label>
                    <Input
                      id="name"
                      placeholder="Nome do fluxo"
                      value={newFlowName}
                      onChange={(e) => setNewFlowName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Descrição (opcional)</Label>
                    <Textarea
                      id="description"
                      placeholder="Descreva o propósito deste fluxo"
                      value={newFlowDescription}
                      onChange={(e) => setNewFlowDescription(e.target.value)}
                    />
                  </div>
                  <Button 
                    onClick={() => createFlowMutation.mutate()}
                    disabled={!newFlowName.trim() || createFlowMutation.isPending}
                    className="w-full"
                  >
                    {createFlowMutation.isPending ? "Criando..." : "Criar Fluxo"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Buscar fluxos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {filteredFlows && filteredFlows.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredFlows.map((flow) => (
              <Card 
                key={flow.id} 
                className="hover:shadow-md transition-shadow cursor-pointer group"
                onClick={() => navigate(`/tools/wizzy-flow/workspace/flows/${flow.id}`)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <GitBranch className="h-5 w-5 text-primary" />
                      <CardTitle className="text-lg">{flow.name}</CardTitle>
                    </div>
                    {canEdit && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir Fluxo?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Esta ação não pode ser desfeita. O fluxo e todos os seus elementos serão excluídos permanentemente.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteFlowMutation.mutate(flow.id)}>
                              Excluir
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {flow.description && (
                    <CardDescription className="line-clamp-2 mb-2">
                      {flow.description}
                    </CardDescription>
                  )}
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      Atualizado em {format(new Date(flow.updated_at), "dd MMM yyyy", { locale: ptBR })}
                    </span>
                    <ChevronRight className="h-4 w-4" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 border-2 border-dashed rounded-lg">
            <GitBranch className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground mb-4">
              {search ? "Nenhum fluxo encontrado para esta busca." : "Nenhum fluxo cadastrado ainda."}
            </p>
            {canEdit && !search && (
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Criar Primeiro Fluxo
              </Button>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
