import { Card, CardContent } from "@/fluzz/components/ui/card";
import { Badge } from "@/fluzz/components/ui/badge";
import { Input } from "@/fluzz/components/ui/input";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/fluzz/lib/utils";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/fluzz/components/ui/dropdown-menu";
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
import { MoreVertical, Copy, Trash2, Archive, ArchiveRestore, Bookmark, FileEdit } from "lucide-react";
import { Button } from "@/fluzz/components/ui/button";
import { useProjectActions } from "@/fluzz/hooks/useProjectActions";

interface ProjectCardProps {
  project: any;
  onDelete: () => void;
  onArchive: () => void;
  isArchived?: boolean;
  canEdit?: boolean;
}

export const ProjectCard = ({ project, onDelete, onArchive, isArchived = false, canEdit = false }: ProjectCardProps) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isEditingName, setIsEditingName] = useState(false);
  const [projectName, setProjectName] = useState(project.name);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const { duplicateProject, saveAsTemplate } = useProjectActions();

  const updateNameMutation = useMutation({
    mutationFn: async (newName: string) => {
      const { error } = await supabase
        .from("projects")
        .update({ name: newName })
        .eq("id", project.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Nome atualizado!");
      setIsEditingName(false);
    },
    onError: () => {
      toast.error("Erro ao atualizar nome");
      setProjectName(project.name);
    },
  });
  const totalTasks = project.tasks?.length || 0;
  const completedTasks = project.tasks?.filter((t: any) => t.status === "completed").length || 0;
  const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const handleNameBlur = () => {
    if (projectName.trim() && projectName !== project.name) {
      updateNameMutation.mutate(projectName.trim());
    } else {
      setIsEditingName(false);
      setProjectName(project.name);
    }
  };

  return (
    <Card 
      className="hover:shadow-lg transition-all hover:scale-[1.01] cursor-pointer relative"
    >
      <CardContent className="p-4" onClick={() => navigate(`/tools/wizzy-flow/projects/${project.id}`)}>
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            {isEditingName && canEdit ? (
              <Input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                onBlur={handleNameBlur}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleNameBlur();
                  if (e.key === "Escape") {
                    setProjectName(project.name);
                    setIsEditingName(false);
                  }
                  e.stopPropagation();
                }}
                onClick={(e) => e.stopPropagation()}
                className="font-semibold text-lg h-8"
                autoFocus
              />
            ) : (
              <div className="flex items-center gap-2 flex-1 min-w-0">
              <h3 
                  className={cn(
                    "font-semibold text-lg line-clamp-1",
                    project.color === "blue" && "text-blue-500",
                    project.color === "emerald" && "text-emerald-500",
                    project.color === "amber" && "text-amber-500",
                    project.color === "purple" && "text-purple-500",
                    project.color === "pink" && "text-pink-500",
                    project.color === "cyan" && "text-cyan-500",
                    project.color === "rose" && "text-rose-500",
                    project.color === "orange" && "text-orange-500",
                    project.color === "teal" && "text-teal-500",
                    (project.color === "primary" || !project.color) && "text-primary",
                    canEdit && "cursor-text"
                  )}
                  onClick={(e) => {
                    if (canEdit) {
                      e.stopPropagation();
                      setIsEditingName(true);
                    }
                  }}
                >
                  {project.name}
                </h3>
                {project.is_draft && (
                  <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/30 shrink-0">
                    <FileEdit className="h-3 w-3 mr-1" />
                    Rascunho
                  </Badge>
                )}
              </div>
            )}
            {canEdit && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="z-50 bg-popover">
                  <DropdownMenuItem 
                    onClick={(e) => {
                      e.stopPropagation();
                      duplicateProject.mutate(project);
                    }}
                    disabled={duplicateProject.isPending}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    {duplicateProject.isPending ? "Duplicando..." : "Duplicar"}
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={(e) => {
                      e.stopPropagation();
                      saveAsTemplate.mutate(project);
                    }}
                    disabled={saveAsTemplate.isPending}
                  >
                    <Bookmark className="mr-2 h-4 w-4" />
                    {saveAsTemplate.isPending ? "Salvando..." : "Salvar como Modelo"}
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={(e) => {
                      e.stopPropagation();
                      onArchive();
                    }}
                  >
                    {isArchived ? (
                      <>
                        <ArchiveRestore className="mr-2 h-4 w-4" />
                        Restaurar Projeto
                      </>
                    ) : (
                      <>
                        <Archive className="mr-2 h-4 w-4" />
                        Arquivar Projeto
                      </>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowDeleteDialog(true);
                    }}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Excluir Projeto
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          
          <div className="flex items-center justify-between gap-2">
            <div className="h-1.5 flex-1 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {completedTasks}/{totalTasks}
            </span>
          </div>
        </div>
      </CardContent>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Projeto</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza de que deseja excluir permanentemente o projeto <strong>{project.name}</strong>? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
                setShowDeleteDialog(false);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir Permanentemente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};