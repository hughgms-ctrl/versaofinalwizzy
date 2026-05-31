import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/fluzz/components/ui/table";
import { Progress } from "@/fluzz/components/ui/progress";
import { MoreVertical, Folder, Copy, Trash2, Archive, ArchiveRestore, Bookmark, FileEdit, CalendarDays } from "lucide-react";
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
import { Button } from "@/fluzz/components/ui/button";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";
import { Badge } from "@/fluzz/components/ui/badge";
import { useState } from "react";
import { useIsMobile } from "@/fluzz/hooks/use-mobile";
import { Card, CardContent } from "@/fluzz/components/ui/card";
import { formatDateBR, formatDateShort } from "@/fluzz/lib/utils";
import { useProjectActions } from "@/fluzz/hooks/useProjectActions";

interface ProjectListViewProps {
  projects: any[];
  onDelete: (id: string) => void;
  onArchive: (id: string) => void;
  navigate: (path: string) => void;
  isArchived?: boolean;
  isStandaloneFolder?: boolean;
}

export function ProjectListView({ projects, onDelete, onArchive, navigate, isArchived, isStandaloneFolder }: ProjectListViewProps) {
  const { isAdmin, isGestor } = useWorkspace();
  const isMobile = useIsMobile();
  const [showDeleteDialog, setShowDeleteDialog] = useState<string | null>(null);
  const { duplicateProject, saveAsTemplate } = useProjectActions();

  const getProgress = (project: any) => {
    const tasks = project.tasks || [];
    if (tasks.length === 0) return { completed: 0, total: 0, percentage: 0 };
    const completed = tasks.filter((t: any) => t.status === "completed").length;
    return {
      completed,
      total: tasks.length,
      percentage: Math.round((completed / tasks.length) * 100),
    };
  };

  const formatEventDates = (project: any) => {
    if (!project.start_date && !project.end_date) return null;
    
    const start = project.start_date;
    const end = project.end_date;
    
    if (start && end && start !== end) {
      return `${formatDateShort(start)} - ${formatDateShort(end)}`;
    }
    
    return formatDateBR(end || start);
  };

  const renderActionsDropdown = (project: any) => (
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
        {!isStandaloneFolder && (
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
        )}
        {!isStandaloneFolder && (
          <DropdownMenuItem 
            onClick={(e) => {
              e.stopPropagation();
              onArchive(project.id);
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
        )}
        <DropdownMenuItem 
          onClick={(e) => {
            e.stopPropagation();
            setShowDeleteDialog(project.id);
          }}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Excluir Projeto
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  // Mobile Card View
  if (isMobile) {
    return (
      <div className="space-y-3">
        {projects.map((project) => {
          const progress = getProgress(project);
          const eventDates = formatEventDates(project);
          
          return (
            <Card 
              key={project.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => navigate(`/tools/wizzy-flow/projects/${project.id}`)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {isStandaloneFolder && <Folder className="h-4 w-4 text-primary flex-shrink-0" />}
                      <h3 className="font-medium text-foreground truncate">{project.name}</h3>
                    </div>
                    
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {isStandaloneFolder && (
                        <Badge variant="outline" className="text-xs">Sem Projeto</Badge>
                      )}
                      {project.is_draft && (
                        <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/30">
                          <FileEdit className="h-3 w-3 mr-1" />
                          Rascunho
                        </Badge>
                      )}
                      {eventDates && (
                        <Badge variant="secondary" className="text-xs gap-1">
                          <CalendarDays className="h-3 w-3" />
                          {eventDates}
                        </Badge>
                      )}
                    </div>
                    
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Progresso</span>
                        <span>{progress.completed}/{progress.total} tarefas</span>
                      </div>
                      <Progress value={progress.percentage} className="h-2" />
                    </div>
                  </div>
                  
                  {(isAdmin || isGestor) && (
                    <div onClick={(e) => e.stopPropagation()}>
                      {renderActionsDropdown(project)}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}

        <AlertDialog open={!!showDeleteDialog} onOpenChange={() => setShowDeleteDialog(null)}>
          <AlertDialogContent onClick={(e) => e.stopPropagation()}>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir Projeto</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza de que deseja excluir permanentemente este projeto? Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.stopPropagation();
                  if (showDeleteDialog) {
                    onDelete(showDeleteDialog);
                  }
                  setShowDeleteDialog(null);
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Excluir Permanentemente
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // Desktop Table View
  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[35%]">{isStandaloneFolder ? "Pasta" : "Projeto"}</TableHead>
            <TableHead className="w-[20%]">Data</TableHead>
            <TableHead className="w-[30%]">Progresso</TableHead>
            <TableHead className="w-[15%] text-right">Tarefas</TableHead>
            {(isAdmin || isGestor) && <TableHead className="w-[50px]"></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {projects.map((project) => {
            const progress = getProgress(project);
            const eventDates = formatEventDates(project);
            
            return (
              <TableRow
                key={project.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => navigate(`/tools/wizzy-flow/projects/${project.id}`)}
              >
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    {isStandaloneFolder && <Folder className="h-4 w-4 text-primary" />}
                    <span className="truncate">{project.name}</span>
                    {isStandaloneFolder && <Badge variant="outline" className="text-xs">Sem Projeto</Badge>}
                    {project.is_draft && (
                      <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/30">
                        <FileEdit className="h-3 w-3 mr-1" />
                        Rascunho
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {eventDates ? (
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {eventDates}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <Progress value={progress.percentage} className="h-2" />
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {progress.completed}/{progress.total}
                </TableCell>
                {(isAdmin || isGestor) && (
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {renderActionsDropdown(project)}
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <AlertDialog open={!!showDeleteDialog} onOpenChange={() => setShowDeleteDialog(null)}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Projeto</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza de que deseja excluir permanentemente este projeto? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.stopPropagation();
                if (showDeleteDialog) {
                  onDelete(showDeleteDialog);
                }
                setShowDeleteDialog(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir Permanentemente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
