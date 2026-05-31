import { AppLayout } from "@/fluzz/components/layout/AppLayout";
import { Button } from "@/fluzz/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/fluzz/components/ui/card";
import { Plus, LayoutGrid, List, Edit, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";
import { Skeleton } from "@/fluzz/components/ui/skeleton";
import { toast } from "sonner";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/fluzz/components/ui/table";

export default function GettingStarted() {
  const { workspace, isAdmin, isGestor } = useWorkspace();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  
  const canEdit = isAdmin || isGestor;

  const { data: sections, isLoading } = useQuery({
    queryKey: ["getting-started-sections", workspace?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("getting_started_sections")
        .select("*")
        .eq("workspace_id", workspace?.id!)
        .order("section_order", { ascending: true });
      
      if (error) throw error;
      return data;
    },
    enabled: !!workspace?.id,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("getting_started_sections")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["getting-started-sections"] });
      toast.success("Página excluída!");
    },
    onError: () => {
      toast.error("Erro ao excluir");
    },
  });

  const stripHtml = (html: string) => {
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || "";
  };

  return (
    <AppLayout>
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Comece Aqui</h1>
            <p className="text-sm md:text-base text-muted-foreground">
              Tutoriais e guias para usar a plataforma
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center border rounded-md">
              <Button
                variant={viewMode === "list" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setViewMode("list")}
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "grid" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setViewMode("grid")}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>
            {canEdit && (
              <Button onClick={() => navigate("/tools/wizzy-flow/workspace/getting-started/new")} size="sm" className="w-full sm:w-auto">
                <Plus className="h-4 w-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">Nova Página</span>
                <span className="sm:hidden">Nova</span>
              </Button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : !sections || sections.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed rounded-lg">
            <p className="text-muted-foreground mb-4">
              Nenhuma página criada ainda
            </p>
            {canEdit && (
              <Button onClick={() => navigate("/tools/wizzy-flow/workspace/getting-started/new")}>
                <Plus className="h-4 w-4 mr-2" />
                Criar Primeira Página
              </Button>
            )}
          </div>
        ) : viewMode === "list" ? (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead className="hidden md:table-cell">Prévia</TableHead>
                  <TableHead className="hidden sm:table-cell">Ordem</TableHead>
                  {canEdit && <TableHead className="w-[100px]">Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sections.map((section) => (
                  <TableRow 
                    key={section.id} 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/tools/wizzy-flow/workspace/getting-started/${section.id}`)}
                  >
                    <TableCell className="font-medium">{section.title}</TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground truncate max-w-[300px]">
                      {stripHtml(section.content || "").substring(0, 100)}...
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">{section.section_order}</TableCell>
                    {canEdit && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => navigate(`/tools/wizzy-flow/workspace/getting-started/${section.id}/edit`)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Excluir página?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Esta ação não pode ser desfeita.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteMutation.mutate(section.id)}>
                                  Excluir
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sections.map((section) => (
              <Card 
                key={section.id} 
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => navigate(`/tools/wizzy-flow/workspace/getting-started/${section.id}`)}
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{section.title}</CardTitle>
                    {canEdit && (
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => navigate(`/tools/wizzy-flow/workspace/getting-started/${section.id}/edit`)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir página?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta ação não pode ser desfeita.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteMutation.mutate(section.id)}>
                                Excluir
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground text-sm line-clamp-3">
                    {stripHtml(section.content || "").substring(0, 150)}...
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
