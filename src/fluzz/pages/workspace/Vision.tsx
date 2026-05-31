import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { AppLayout } from "@/fluzz/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/fluzz/components/ui/card";
import { Button } from "@/fluzz/components/ui/button";
import { toast } from "sonner";
import { Edit, Trash2 } from "lucide-react";
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
  AlertDialogTrigger,
} from "@/fluzz/components/ui/alert-dialog";

export default function Vision() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { workspace, isAdmin, isGestor } = useWorkspace();

  const { data: visionData, isLoading } = useQuery({
    queryKey: ["company-info", "vision", workspace?.id],
    queryFn: async () => {
      if (!workspace) return null;
      const { data, error } = await supabase
        .from("company_info")
        .select("*")
        .eq("section", "vision")
        .eq("workspace_id", workspace.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!workspace,
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!visionData) return;
      const { error } = await supabase
        .from("company_info")
        .delete()
        .eq("id", visionData.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-info", "vision"] });
      toast.success("Conteúdo excluído com sucesso!");
    },
    onError: () => {
      toast.error("Erro ao excluir");
    },
  });

  const canEdit = isAdmin || isGestor;

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
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground">Visão, Missão e Valores</h1>
            <p className="text-sm md:text-base text-muted-foreground mt-1">
              Os princípios fundamentais que guiam nossa empresa
            </p>
          </div>
          {canEdit && (
            <Button onClick={() => navigate("/tools/wizzy-flow/workspace/vision/edit")} className="gap-2 w-full sm:w-auto" size="sm">
              <Edit size={14} />
              {visionData ? "Editar" : "Criar"}
            </Button>
          )}
        </div>

        {visionData ? (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{visionData.title || "Visão, Missão e Valores"}</CardTitle>
                {canEdit && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                        <Trash2 size={16} />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir Visão, Missão e Valores?</AlertDialogTitle>
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
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div 
                className="prose prose-sm max-w-none dark:prose-invert"
                dangerouslySetInnerHTML={{ __html: visionData.content || "" }}
              />
            </CardContent>
          </Card>
        ) : (
          <div className="text-center py-12 border-2 border-dashed rounded-lg">
            <p className="text-muted-foreground mb-4">
              Nenhuma informação cadastrada ainda.
            </p>
            {canEdit && (
              <Button onClick={() => navigate("/tools/wizzy-flow/workspace/vision/edit")}>
                <Edit className="h-4 w-4 mr-2" />
                Criar Visão, Missão e Valores
              </Button>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
