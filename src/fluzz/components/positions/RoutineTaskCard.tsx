import { Card, CardContent } from "@/fluzz/components/ui/card";
import { Badge } from "@/fluzz/components/ui/badge";
import { Button } from "@/fluzz/components/ui/button";
import { FolderKanban, FileText, Trash2, Pencil } from "lucide-react";
import { useState } from "react";
import { EditRoutineTaskDialog } from "./EditRoutineTaskDialog";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";
import { useNavigate } from "react-router-dom";
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

interface RoutineTaskCardProps {
  task: {
    id: string;
    title: string;
    description: string | null;
    priority: string | null;
    status: string | null;
    setor: string | null;
    documentation: string | null;
    project_id: string | null;
    process_id: string | null;
    routine_id: string;
    projects?: { id: string; name: string } | null;
    process_documentation?: { id: string; title: string } | null;
  };
}

const priorityColors: Record<string, string> = {
  low: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  medium: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  high: "bg-red-500/10 text-red-500 border-red-500/20",
};

const priorityLabels: Record<string, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
};

const statusLabels: Record<string, string> = {
  todo: "A fazer",
  in_progress: "Fazendo",
  completed: "Feito",
};

const statusColors: Record<string, string> = {
  todo: "bg-gray-500/10 text-gray-500 border-gray-500/20",
  in_progress: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  completed: "bg-green-500/10 text-green-500 border-green-500/20",
};

export function RoutineTaskCard({ task }: RoutineTaskCardProps) {
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { isAdmin, isGestor, workspace } = useWorkspace();
  const canEdit = isAdmin || isGestor;

  // Fetch sector name
  const { data: sectorData } = useQuery({
    queryKey: ["position-name", task.setor],
    queryFn: async () => {
      if (!task.setor) return null;
      const { data, error } = await supabase
        .from("positions")
        .select("name")
        .eq("id", task.setor)
        .single();
      if (error) return null;
      return data;
    },
    enabled: !!task.setor,
  });

  const handleDelete = async () => {
    try {
      const { error } = await supabase
        .from("routine_tasks")
        .delete()
        .eq("id", task.id);

      if (error) throw error;

      toast.success("Tarefa removida da rotina!");
      queryClient.invalidateQueries({ queryKey: ["routine-tasks", task.routine_id] });
      queryClient.invalidateQueries({ queryKey: ["my-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    } catch (error) {
      console.error("Error deleting routine task:", error);
      toast.error("Erro ao remover tarefa");
    }
  };

  const handleCardClick = () => {
    navigate(`/tools/wizzy-flow/routine-tasks/${task.id}`);
  };

  return (
    <Card className="bg-muted/50 cursor-pointer hover:bg-muted/70 transition-colors" onClick={handleCardClick}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <h4 className="font-medium">{task.title}</h4>
              {task.priority && (
                <Badge
                  variant="outline"
                  className={priorityColors[task.priority]}
                >
                  {priorityLabels[task.priority]}
                </Badge>
              )}
              {task.status && (
                <Badge
                  variant="outline"
                  className={statusColors[task.status]}
                >
                  {statusLabels[task.status]}
                </Badge>
              )}
            </div>

            {task.description && (
              <p className="text-sm text-muted-foreground">
                {task.description}
              </p>
            )}

            {task.documentation && (
              <div className="text-sm text-muted-foreground">
                <span className="font-medium">Documentação:</span>{" "}
                {task.documentation}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {task.projects && (
                <Badge variant="secondary" className="gap-1">
                  <FolderKanban className="h-3 w-3" />
                  {task.projects.name}
                </Badge>
              )}
              {task.process_documentation && (
                <Badge variant="secondary" className="gap-1">
                  <FileText className="h-3 w-3" />
                  {task.process_documentation.title}
                </Badge>
              )}
            </div>
          </div>

          {canEdit && (
            <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setEditDialogOpen(true)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                  <AlertDialogDescription>
                    Tem certeza que deseja remover esta tarefa da rotina?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete}>
                    Remover
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            </div>
          )}
        </div>

        <EditRoutineTaskDialog
          task={task}
          routineId={task.routine_id}
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
        />
      </CardContent>
    </Card>
  );
}
