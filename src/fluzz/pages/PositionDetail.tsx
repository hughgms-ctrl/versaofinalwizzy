import { AppLayout } from "@/fluzz/components/layout/AppLayout";
import { Button } from "@/fluzz/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/fluzz/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/fluzz/components/ui/tabs";
import { ArrowLeft, Plus, Repeat, Users, Pencil } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { Skeleton } from "@/fluzz/components/ui/skeleton";
import { useEffect, useState } from "react";
import { CreateRoutineDialog } from "@/fluzz/components/positions/CreateRoutineDialog";
import { RoutineCard } from "@/fluzz/components/positions/RoutineCard";
import { AssignUserDialog } from "@/fluzz/components/positions/AssignUserDialog";
import { AssignedUsersList } from "@/fluzz/components/positions/AssignedUsersList";
import { EditPositionDialog } from "@/fluzz/components/positions/EditPositionDialog";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";

export default function PositionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin, isGestor, workspace } = useWorkspace();
  const [createTaskDialogOpen, setCreateTaskDialogOpen] = useState(false);
  const [assignUserDialogOpen, setAssignUserDialogOpen] = useState(false);
  const [editPositionDialogOpen, setEditPositionDialogOpen] = useState(false);

  const { data: position, isLoading: positionLoading } = useQuery({
    queryKey: ["position", id, workspace?.id],
    queryFn: async () => {
      if (!workspace) return null;
      
      const { data, error } = await supabase
        .from("positions")
        .select("*")
        .eq("id", id)
        .eq("workspace_id", workspace.id)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!id && !!workspace,
  });

  const { data: routines, isLoading: routinesLoading } = useQuery({
    queryKey: ["routines", id, workspace?.id],
    queryFn: async () => {
      if (!workspace) return [];
      
      const { data, error } = await supabase
        .from("routines")
        .select("*")
        .eq("position_id", id)
        .eq("workspace_id", workspace.id)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!id && !!workspace,
  });

  useEffect(() => {
    if (!id || !workspace || !routines || routines.length === 0) return;

    const syncRoutineTasksForAssignedUsers = async () => {
      try {
        const { data: assignments, error } = await supabase
          .from("user_positions")
          .select("user_id")
          .eq("position_id", id);

        if (error) throw error;
        if (!assignments || assignments.length === 0) return;

        await Promise.all(
          assignments.map((assignment) =>
            supabase.functions.invoke("generate-recurring-tasks", {
              body: { userId: assignment.user_id, positionId: id },
            })
          )
        );
      } catch (error) {
        console.error("Erro ao sincronizar tarefas de rotina para o cargo:", error);
      }
    };

    syncRoutineTasksForAssignedUsers();
  }, [id, workspace?.id, routines?.length]);

  if (positionLoading) {
    return (
      <AppLayout>
        <div className="space-y-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AppLayout>
    );
  }

  if (!position) {
    return (
      <AppLayout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Cargo não encontrado</p>
          <Button onClick={() => navigate("/tools/wizzy-flow/positions")} className="mt-4">
            Voltar
          </Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
          <div className="flex items-start gap-2 sm:gap-4 flex-1 min-w-0">
            <Button variant="ghost" size="icon" onClick={() => navigate("/tools/wizzy-flow/positions")} className="flex-shrink-0 mt-1">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground break-words">{position.name}</h1>
                {(isAdmin || isGestor) && (
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => setEditPositionDialogOpen(true)}
                    className="h-8 w-8"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {position.description && (
                <p className="text-xs sm:text-sm text-muted-foreground mt-1 line-clamp-2">{position.description}</p>
              )}
            </div>
          </div>
        </div>

        <Tabs defaultValue="routines" className="space-y-4">
          <TabsList className="w-full sm:w-auto grid grid-cols-2 sm:inline-flex">
            <TabsTrigger value="routines" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
              <Repeat className="h-3 w-3 sm:h-4 sm:w-4" />
              Rotinas
            </TabsTrigger>
            <TabsTrigger value="users" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
              <Users className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Usuários Atribuídos</span>
              <span className="sm:hidden">Usuários</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="routines" className="space-y-4">
            {(isAdmin || isGestor) && (
              <div className="flex justify-end">
                <Button onClick={() => setCreateTaskDialogOpen(true)} size="sm">
                  <Plus className="h-4 w-4 mr-1 sm:mr-2" />
                  <span className="hidden sm:inline">Nova Rotina</span>
                  <span className="sm:hidden">Nova</span>
                </Button>
              </div>
            )}

            {routinesLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Card key={i}>
                    <CardHeader>
                      <Skeleton className="h-6 w-3/4" />
                      <Skeleton className="h-4 w-full mt-2" />
                    </CardHeader>
                  </Card>
                ))}
              </div>
            ) : routines && routines.length > 0 ? (
              <div className="space-y-4">
                {routines.map((routine) => (
                  <RoutineCard key={routine.id} routine={routine} positionId={id!} />
                ))}
              </div>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>Nenhuma rotina cadastrada</CardTitle>
                  <CardDescription>
                    Crie rotinas com tarefas recorrentes para este cargo
                  </CardDescription>
                </CardHeader>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="users" className="space-y-4">
            {(isAdmin || isGestor) && (
              <div className="flex justify-end">
                <Button onClick={() => setAssignUserDialogOpen(true)} size="sm">
                  <Plus className="h-4 w-4 mr-1 sm:mr-2" />
                  <span className="hidden sm:inline">Atribuir Usuário</span>
                  <span className="sm:hidden">Atribuir</span>
                </Button>
              </div>
            )}

            <AssignedUsersList positionId={id!} />
          </TabsContent>
        </Tabs>

        <CreateRoutineDialog
          positionId={id!}
          open={createTaskDialogOpen}
          onOpenChange={setCreateTaskDialogOpen}
        />

        <AssignUserDialog
          positionId={id!}
          open={assignUserDialogOpen}
          onOpenChange={setAssignUserDialogOpen}
        />

        <EditPositionDialog
          open={editPositionDialogOpen}
          onOpenChange={setEditPositionDialogOpen}
          position={position}
        />
      </div>
    </AppLayout>
  );
}
