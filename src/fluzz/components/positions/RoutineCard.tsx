import { Card, CardContent, CardHeader, CardTitle } from "@/fluzz/components/ui/card";
import { Button } from "@/fluzz/components/ui/button";
import { Badge } from "@/fluzz/components/ui/badge";
import { Plus, Repeat, Trash2, Pencil } from "lucide-react";
import { useState } from "react";
import { CreateRoutineTaskDialog } from "./CreateRoutineTaskDialog";
import { EditRoutineDialog } from "./EditRoutineDialog";
import { RoutineTasksList } from "./RoutineTasksList";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/fluzz/components/ui/alert-dialog";

interface RoutineCardProps {
  routine: {
    id: string;
    name: string;
    description: string | null;
    recurrence_type: string;
    start_date: string;
  };
  positionId: string;
}

const recurrenceLabels: Record<string, string> = {
  daily: "Diária",
  weekly: "Semanal",
  monthly: "Mensal",
  yearly: "Anual",
};

export function RoutineCard({ routine, positionId }: RoutineCardProps) {
  const [createTaskDialogOpen, setCreateTaskDialogOpen] = useState(false);
  const [editRoutineDialogOpen, setEditRoutineDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const queryClient = useQueryClient();
  const { isAdmin, isGestor } = useWorkspace();
  const canEdit = isAdmin || isGestor;

  const handleDelete = async () => {
    try {
      const { error } = await supabase
        .from("routines")
        .delete()
        .eq("id", routine.id);

      if (error) throw error;

      toast.success("Rotina excluída com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["routines", positionId] });
    } catch (error) {
      console.error("Error deleting routine:", error);
      toast.error("Erro ao excluir rotina");
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg flex items-center gap-2">
              <Repeat className="h-4 w-4" />
              {routine.name}
            </CardTitle>
            {routine.description && (
              <p className="text-sm text-muted-foreground mt-1">
                {routine.description}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Badge variant="secondary">
              {recurrenceLabels[routine.recurrence_type]}
            </Badge>
            {canEdit && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setEditRoutineDialogOpen(true)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setDeleteDialogOpen(true)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {canEdit && (
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCreateTaskDialogOpen(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Adicionar Tarefa
            </Button>
          </div>
        )}

        <RoutineTasksList routineId={routine.id} />

        <CreateRoutineTaskDialog
          routineId={routine.id}
          positionId={positionId}
          open={createTaskDialogOpen}
          onOpenChange={setCreateTaskDialogOpen}
        />

        <EditRoutineDialog
          routine={routine}
          positionId={positionId}
          open={editRoutineDialogOpen}
          onOpenChange={setEditRoutineDialogOpen}
        />

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir esta rotina? Todas as tarefas associadas também serão excluídas.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete}>
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
