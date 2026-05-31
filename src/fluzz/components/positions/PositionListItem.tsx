import { Button } from "@/fluzz/components/ui/button";
import { Badge } from "@/fluzz/components/ui/badge";
import { Briefcase, Users, Repeat, Trash2, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { toast } from "sonner";
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
import { useState } from "react";

interface PositionListItemProps {
  position: {
    id: string;
    name: string;
    description: string | null;
  };
}

export function PositionListItem({ position }: PositionListItemProps) {
  const navigate = useNavigate();
  const { isAdmin, isGestor } = useWorkspace();
  const queryClient = useQueryClient();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const { data: recurringTasksCount } = useQuery({
    queryKey: ["recurring-tasks-count", position.id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("recurring_tasks")
        .select("*", { count: "exact", head: true })
        .eq("position_id", position.id);
      
      if (error) throw error;
      return count || 0;
    },
  });

  const { data: assignedUsersCount } = useQuery({
    queryKey: ["assigned-users-count", position.id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("user_positions")
        .select("*", { count: "exact", head: true })
        .eq("position_id", position.id);
      
      if (error) throw error;
      return count || 0;
    },
  });

  const handleDelete = async () => {
    try {
      const { error } = await supabase
        .from("positions")
        .delete()
        .eq("id", position.id);

      if (error) throw error;

      toast.success("Cargo excluído com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["positions"] });
    } catch (error) {
      console.error("Erro ao excluir cargo:", error);
      toast.error("Erro ao excluir cargo");
    } finally {
      setDeleteDialogOpen(false);
    }
  };

  return (
    <>
      <div 
        className="flex items-center justify-between p-4 bg-card border rounded-lg hover:shadow-md transition-all cursor-pointer"
        onClick={() => navigate(`/tools/wizzy-flow/positions/${position.id}`)}
      >
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <Briefcase className="h-5 w-5 text-primary flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-foreground truncate">{position.name}</h3>
            {position.description && (
              <p className="text-sm text-muted-foreground truncate">{position.description}</p>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-3 flex-shrink-0">
          <Badge variant="secondary" className="flex items-center gap-1">
            <Repeat className="h-3 w-3" />
            {recurringTasksCount || 0}
          </Badge>
          <Badge variant="outline" className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            {assignedUsersCount || 0}
          </Badge>
          
          {(isAdmin || isGestor) && (
            <Button 
              variant="ghost" 
              size="icon"
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={(e) => {
                e.stopPropagation();
                setDeleteDialogOpen(true);
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Cargo</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o cargo "{position.name}"? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
