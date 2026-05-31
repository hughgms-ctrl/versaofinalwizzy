import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/fluzz/components/ui/card";
import { Button } from "@/fluzz/components/ui/button";
import { Badge } from "@/fluzz/components/ui/badge";
import { Briefcase, Users, Repeat, Trash2 } from "lucide-react";
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

interface PositionCardProps {
  position: {
    id: string;
    name: string;
    description: string | null;
  };
}

export function PositionCard({ position }: PositionCardProps) {
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
    <Card className="hover:shadow-lg transition-all cursor-pointer" onClick={() => navigate(`/tools/wizzy-flow/positions/${position.id}`)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <Briefcase className="h-6 w-6 text-primary" />
          <div className="flex gap-2">
            <Badge variant="secondary" className="flex items-center gap-1">
              <Repeat className="h-3 w-3" />
              {recurringTasksCount || 0}
            </Badge>
            <Badge variant="outline" className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {assignedUsersCount || 0}
            </Badge>
          </div>
        </div>
        <CardTitle className="text-lg mt-2">{position.name}</CardTitle>
        {position.description && (
          <CardDescription className="line-clamp-2">
            {position.description}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={(e) => {
            e.stopPropagation();
            navigate(`/tools/wizzy-flow/positions/${position.id}`);
          }}>
            Gerenciar
          </Button>
          {(isAdmin || isGestor) && (
            <Button 
              variant="destructive" 
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setDeleteDialogOpen(true);
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>

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
    </Card>
  );
}
