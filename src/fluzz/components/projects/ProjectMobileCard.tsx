import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";
import { Card, CardContent } from "@/fluzz/components/ui/card";
import { Input } from "@/fluzz/components/ui/input";
import { Button } from "@/fluzz/components/ui/button";
import { Badge } from "@/fluzz/components/ui/badge";
import { Progress } from "@/fluzz/components/ui/progress";
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
import { 
  ChevronRight, 
  MoreVertical, 
  Copy, 
  Archive, 
  ArchiveRestore, 
  Trash2, 
  Bookmark,
  FileEdit,
  Folder,
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
} from "lucide-react";
import { formatDateBR, formatDateShort } from "@/fluzz/lib/utils";
import { toast } from "sonner";
import { useProjectActions } from "@/fluzz/hooks/useProjectActions";

interface ProjectMobileCardProps {
  project: any;
  onDelete: (id: string) => void;
  onArchive: (id: string) => void;
  isArchived?: boolean;
  isStandaloneFolder?: boolean;
}

const projectColors = [
  "hsl(217 91% 60%)",
  "hsl(142 71% 45%)",
  "hsl(280 65% 60%)",
  "hsl(25 95% 53%)",
  "hsl(340 82% 52%)",
  "hsl(47 95% 50%)",
  "hsl(173 80% 40%)",
  "hsl(315 70% 50%)",
];

const projectColorByValue: Record<string, string> = {
  primary: "hsl(var(--primary))",
  blue: "hsl(217 91% 60%)",
  emerald: "hsl(142 71% 45%)",
  amber: "hsl(43 96% 56%)",
  purple: "hsl(271 81% 56%)",
  pink: "hsl(330 81% 60%)",
  cyan: "hsl(188 94% 42%)",
  rose: "hsl(346 77% 49%)",
  orange: "hsl(25 95% 53%)",
  teal: "hsl(173 80% 40%)",
};

function getProjectColor(projectId: string, colorValue?: string | null): string {
  const mapped = colorValue ? projectColorByValue[colorValue] : undefined;
  if (mapped) return mapped;

  let hash = 0;
  for (let i = 0; i < projectId.length; i++) {
    hash = projectId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return projectColors[Math.abs(hash) % projectColors.length];
}

export function ProjectMobileCard({ 
  project, 
  onDelete, 
  onArchive, 
  isArchived,
  isStandaloneFolder,
}: ProjectMobileCardProps) {
  const projectColor = getProjectColor(project.id, project.color);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(project.name);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAdmin, isGestor } = useWorkspace();
  const { duplicateProject, saveAsTemplate } = useProjectActions();

  const tasks = project.tasks || [];
  const taskCount = tasks.length;
  const completedTasks = tasks.filter((t: any) => t.status === "completed").length;
  const inProgressTasks = tasks.filter((t: any) => t.status === "in_progress").length;
  const todoTasks = tasks.filter((t: any) => t.status === "todo" || !t.status).length;
  const progress = taskCount > 0 ? Math.round((completedTasks / taskCount) * 100) : 0;

  const formatEventDates = () => {
    if (!project.start_date && !project.end_date) return null;
    const start = project.start_date;
    const end = project.end_date;
    
    if (start && end && start !== end) {
      return `${formatDateShort(start)} - ${formatDateShort(end)}`;
    }
    return formatDateBR(end || start);
  };

  const eventDates = formatEventDates();

  const handleNameSave = async () => {
    if (editedName.trim() && editedName !== project.name) {
      try {
        const { error } = await supabase
          .from("projects")
          .update({ name: editedName.trim() })
          .eq("id", project.id);
        
        if (error) throw error;
        toast.success("Nome atualizado!");
        queryClient.invalidateQueries({ queryKey: ["projects"] });
      } catch (err) {
        toast.error("Erro ao atualizar nome");
        setEditedName(project.name);
      }
    }
    setIsEditingName(false);
  };

  const handleCardClick = () => {
    navigate(`/tools/wizzy-flow/projects/${project.id}`);
  };

  const handleNameDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isAdmin || isGestor) {
      setIsEditingName(true);
    }
  };

  return (
    <>
      <Card 
        className="relative overflow-hidden active:scale-[0.98] transition-transform"
        style={{ borderLeftWidth: 4, borderLeftColor: projectColor }}
      >
        <CardContent className="p-4">
          {/* Header com nome e menu */}
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="flex-1 min-w-0">
              {isEditingName ? (
                <Input
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  onBlur={handleNameSave}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleNameSave();
                    if (e.key === "Escape") {
                      setEditedName(project.name);
                      setIsEditingName(false);
                    }
                  }}
                  autoFocus
                  className="h-8 text-base font-semibold"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <div 
                  className="flex items-center gap-2"
                  onClick={handleCardClick}
                  onDoubleClick={handleNameDoubleClick}
                >
                  {isStandaloneFolder && <Folder className="h-4 w-4 shrink-0" style={{ color: projectColor }} />}
                  <h3 className="font-semibold text-base line-clamp-2" style={{ color: projectColor }}>
                    {project.name}
                  </h3>
                </div>
              )}
              
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {project.is_draft && (
                  <Badge
                    variant="outline"
                    className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/30"
                  >
                    <FileEdit className="h-3 w-3 mr-1" />
                    Rascunho
                  </Badge>
                )}
                {eventDates && (
                  <Badge variant="secondary" className="text-xs gap-1">
                    <Calendar className="h-3 w-3" />
                    {eventDates}
                  </Badge>
                )}
              </div>
            </div>
            
            {(isAdmin || isGestor) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="z-50 bg-popover">
                  <DropdownMenuItem 
                    onClick={() => duplicateProject.mutate(project)}
                    disabled={duplicateProject.isPending}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    {duplicateProject.isPending ? "Duplicando..." : "Duplicar"}
                  </DropdownMenuItem>
                  {!isStandaloneFolder && (
                    <DropdownMenuItem 
                      onClick={() => saveAsTemplate.mutate(project)}
                      disabled={saveAsTemplate.isPending}
                    >
                      <Bookmark className="mr-2 h-4 w-4" />
                      {saveAsTemplate.isPending ? "Salvando..." : "Salvar como Modelo"}
                    </DropdownMenuItem>
                  )}
                  {!isStandaloneFolder && (
                    <DropdownMenuItem onClick={() => onArchive(project.id)}>
                      {isArchived ? (
                        <>
                          <ArchiveRestore className="mr-2 h-4 w-4" />
                          Restaurar
                        </>
                      ) : (
                        <>
                          <Archive className="mr-2 h-4 w-4" />
                          Arquivar
                        </>
                      )}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onClick={() => setShowDeleteDialog(true)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Excluir
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {/* Status das tarefas */}
          <div className="flex items-center gap-3 mb-3">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Circle className="h-3 w-3" style={{ color: 'hsl(0 68% 72%)' }} />
              <span>{todoTasks}</span>
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" style={{ color: 'hsl(30 100% 65%)' }} />
              <span>{inProgressTasks}</span>
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3 w-3" style={{ color: 'hsl(152 69% 53%)' }} />
              <span>{completedTasks}</span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="flex items-center gap-3" onClick={handleCardClick}>
            <Progress value={progress} className="flex-1 h-2" />
            <span 
              className="text-sm font-medium min-w-[40px] text-right"
              style={{ color: progress === 100 ? 'hsl(152 69% 53%)' : undefined }}
            >
              {progress}%
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Projeto</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza de que deseja excluir permanentemente este projeto? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onDelete(project.id);
                setShowDeleteDialog(false);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
