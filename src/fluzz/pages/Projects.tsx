import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { AppLayout } from "@/fluzz/components/layout/AppLayout";
import { Button } from "@/fluzz/components/ui/button";
import { Plus, LayoutGrid, List, Folder, CalendarDays, Archive } from "lucide-react";
import { ProjectCard } from "@/fluzz/components/projects/ProjectCard";
import { ProjectsTableView } from "@/fluzz/components/projects/ProjectsTableView";
import { ProjectsCalendarView } from "@/fluzz/components/projects/ProjectsCalendarView";
import { CreateProjectDialog } from "@/fluzz/components/projects/CreateProjectDialog";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/fluzz/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/fluzz/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/fluzz/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/fluzz/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/fluzz/components/ui/drawer";
import { Badge } from "@/fluzz/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";
import { formatDateBR, cn } from "@/fluzz/lib/utils";
import { format } from "date-fns";
import { useIsMobile } from "@/fluzz/hooks/use-mobile";
import { useAuth } from "@/fluzz/contexts/AuthContext";

export default function Projects() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"active" | "drafts" | "standalone">("active");
  const [viewMode, setViewMode] = useState<"grid" | "list" | "calendar">("list");
  const [defaultProjectDate, setDefaultProjectDate] = useState<Date | null>(null);
  const [showArchivedDialog, setShowArchivedDialog] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { workspace, isAdmin, isGestor } = useWorkspace();
  const isMobile = useIsMobile();
  const { user } = useAuth();

  // Fetch user permissions to check projects_only_assigned
  const { data: userPermissions } = useQuery({
    queryKey: ["user-permissions-projects", workspace?.id, user?.id],
    queryFn: async () => {
      if (!workspace?.id || !user?.id) return null;
      const { data, error } = await supabase
        .from("user_permissions")
        .select("projects_only_assigned")
        .eq("workspace_id", workspace.id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!workspace?.id && !!user?.id,
  });

  // If user has projects_only_assigned permission, fetch their project memberships
  const { data: userProjectMemberships } = useQuery({
    queryKey: ["user-project-memberships", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("project_members")
        .select("project_id")
        .eq("user_id", user.id);
      if (error) throw error;
      return data?.map(m => m.project_id) || [];
    },
    enabled: !!user?.id && !isAdmin && !isGestor && !!userPermissions?.projects_only_assigned,
  });

  const { data: projects, isLoading } = useQuery({
    queryKey: ["projects", workspace?.id],
    queryFn: async () => {
      if (!workspace?.id) return [];
      
      const { data, error } = await supabase
        .from("projects")
        .select("*, tasks(id, title, status, priority, assigned_to, due_date, start_date), start_date, end_date")
        .eq("workspace_id", workspace.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!workspace?.id,
  });

  // Separate projects vs standalone folders
  // Sort projects by event date (end_date or start_date), undated projects at the end
  const sortByEventDate = (projects: any[]) => {
    return [...projects].sort((a, b) => {
      const dateA = a.end_date || a.start_date;
      const dateB = b.end_date || b.start_date;
      
      // Undated projects go to the end
      if (!dateA && !dateB) return 0;
      if (!dateA) return 1;
      if (!dateB) return -1;
      
      // Sort by date ascending (closest dates first)
      return new Date(dateA).getTime() - new Date(dateB).getTime();
    });
  };

  const { activeProjects, draftProjects, archivedProjects, standaloneFolders, calendarProjects } = useMemo(() => {
    // Members (non-admin/gestor) should not see draft projects in list/table views,
    // but they MUST see them in the calendar (without being able to open them).
    const canSeeDrafts = isAdmin || isGestor;

    // All projects for different categories
    let allProjects = projects || [];

    // If user has projects_only_assigned permission, filter to only their projects
    const shouldFilterByMembership = !isAdmin && !isGestor && userPermissions?.projects_only_assigned && userProjectMemberships;
    if (shouldFilterByMembership) {
      allProjects = allProjects.filter(p => userProjectMemberships.includes(p.id));
    }

    // Active projects: not archived, not draft, not standalone folder
    const active = sortByEventDate(allProjects.filter(p => 
      !p.archived && !p.is_standalone_folder && !p.is_draft
    ));

    // Draft projects: is_draft = true, not archived (only visible to admin/gestor)
    const drafts = canSeeDrafts 
      ? sortByEventDate(allProjects.filter(p => p.is_draft && !p.archived && !p.is_standalone_folder))
      : [];

    // Archived projects
    const archived = sortByEventDate(allProjects.filter(p => p.archived && !p.is_standalone_folder));

    // Standalone folders (only visible to admin/gestor)
    const standalone = canSeeDrafts 
      ? allProjects.filter(p => p.is_standalone_folder && !p.archived)
      : [];

    // Calendar view: always include drafts for everyone (draft click/open is handled inside ProjectsCalendarView)
    const calendarProjectsList = sortByEventDate(
      allProjects.filter(p => !p.archived && !p.is_standalone_folder)
    );
    
    return { 
      activeProjects: active, 
      draftProjects: drafts, 
      archivedProjects: archived, 
      standaloneFolders: standalone, 
      calendarProjects: calendarProjectsList 
    };
  }, [projects, isAdmin, isGestor, userPermissions, userProjectMemberships]);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("projects")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Projeto excluído com sucesso!");
    },
    onError: () => {
      toast.error("Erro ao excluir projeto");
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const { error } = await supabase
        .from("projects")
        .update({ archived })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success(variables.archived ? "Projeto arquivado com sucesso!" : "Projeto restaurado com sucesso!");
    },
    onError: () => {
      toast.error("Erro ao atualizar projeto");
    },
  });

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </AppLayout>
    );
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "todo": return "A fazer";
      case "in_progress": return "Fazendo";
      case "completed": return "Feito";
      default: return status;
    }
  };

  const getPriorityVariant = (priority: string): "default" | "secondary" | "destructive" => {
    switch (priority) {
      case "high": return "destructive";
      case "medium": return "secondary";
      default: return "default";
    }
  };

  const renderProjectsList = (projectsList: any[], isStandalone = false) => {
    if (projectsList.length === 0) return null;

    // Always use table view with horizontal scroll (same pattern for mobile and desktop)
    if (viewMode === "grid" && !isMobile) {
      return (
        <div className="grid gap-3 sm:gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {projectsList.map((project: any) => (
            <ProjectCard
              key={project.id}
              project={project}
              onDelete={() => deleteMutation.mutate(project.id)}
              onArchive={() => archiveMutation.mutate({ id: project.id, archived: true })}
              canEdit={isAdmin || isGestor}
            />
          ))}
        </div>
      );
    }

    return (
      <ProjectsTableView
        projects={projectsList}
        onDelete={(id) => deleteMutation.mutate(id)}
        onArchive={(id) => archiveMutation.mutate({ id, archived: true })}
        isStandaloneFolder={isStandalone}
      />
    );
  };

  const ArchivedContent = () => (
    <div className="space-y-3 max-h-[60vh] overflow-y-auto">
      {archivedProjects.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">
          Nenhum projeto arquivado.
        </p>
      ) : (
        <ProjectsTableView
          projects={archivedProjects}
          onDelete={(id) => deleteMutation.mutate(id)}
          onArchive={(id) => archiveMutation.mutate({ id, archived: false })}
          isArchived
        />
      )}
    </div>
  );

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div>
                <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground">Projetos</h1>
                <p className="text-xs sm:text-sm text-muted-foreground">Gerencie seus projetos</p>
              </div>
              {archivedProjects.length > 0 && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setShowArchivedDialog(true)}
                        className="h-8 w-8 relative"
                      >
                        <Archive className="h-4 w-4 text-muted-foreground" />
                        <span className="absolute -top-1 -right-1 h-4 w-4 bg-primary text-primary-foreground text-[10px] rounded-full flex items-center justify-center">
                          {archivedProjects.length}
                        </span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Projetos arquivados</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              {/* View mode toggle */}
              <div className="flex border rounded-md">
                {!isMobile && (
                  <Button
                    variant={viewMode === "grid" ? "default" : "ghost"}
                    size="icon"
                    onClick={() => setViewMode("grid")}
                    className="rounded-r-none h-8 w-8"
                    title="Grade"
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant={viewMode === "list" ? "default" : "ghost"}
                  size="icon"
                  onClick={() => setViewMode("list")}
                  className={cn("h-8 w-8", !isMobile && "rounded-none")}
                  title="Lista"
                >
                  <List className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === "calendar" ? "default" : "ghost"}
                  size="icon"
                  onClick={() => setViewMode("calendar")}
                  className="rounded-l-none h-8 w-8"
                  title="Calendário"
                >
                  <CalendarDays className="h-4 w-4" />
                </Button>
              </div>
              
              {(isAdmin || isGestor) && (
                <Button 
                  onClick={() => setIsCreateOpen(true)} 
                  className="gap-1.5 h-9 px-3"
                  size={isMobile ? "sm" : "default"}
                >
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Novo Projeto</span>
                  <span className="sm:hidden">Novo</span>
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "active" | "drafts" | "standalone")}>
          <TabsList className={`w-full h-auto p-1 grid ${(isAdmin || isGestor) ? 'grid-cols-3' : 'grid-cols-1'}`}>
            <TabsTrigger value="active" className="text-xs sm:text-sm py-2 px-2 sm:px-4">
              Ativos
              <Badge variant="secondary" className="ml-1.5 h-5 min-w-5 px-1.5 text-xs">
                {activeProjects.length}
              </Badge>
            </TabsTrigger>
            {(isAdmin || isGestor) && (
              <TabsTrigger value="drafts" className="text-xs sm:text-sm py-2 px-2 sm:px-4">
                Rascunhos
                <Badge variant="secondary" className="ml-1.5 h-5 min-w-5 px-1.5 text-xs">
                  {draftProjects.length}
                </Badge>
              </TabsTrigger>
            )}
            {(isAdmin || isGestor) && (
              <TabsTrigger value="standalone" className="text-xs sm:text-sm py-2 px-2 sm:px-4">
                Sem Projetos
                <Badge variant="secondary" className="ml-1.5 h-5 min-w-5 px-1.5 text-xs">
                  {standaloneFolders.length}
                </Badge>
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="active" className="mt-4">
            {viewMode === "calendar" ? (
              <ProjectsCalendarView
                key={`calendar-${viewMode}`}
                projects={calendarProjects}
                onCreateProject={(date) => {
                  setDefaultProjectDate(date);
                  setIsCreateOpen(true);
                }}
                canEdit={isAdmin || isGestor}
                canSeeDrafts={isAdmin || isGestor}
              />
            ) : activeProjects.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-4 text-sm">
                  Você ainda não tem projetos ativos.
                </p>
                {(isAdmin || isGestor) && (
                  <Button onClick={() => setIsCreateOpen(true)} className="gap-2">
                    <Plus size={18} />
                    Criar Primeiro Projeto
                  </Button>
                )}
              </div>
            ) : (
              renderProjectsList(activeProjects)
            )}
          </TabsContent>

          <TabsContent value="drafts" className="mt-4">
            {draftProjects.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground text-sm">
                  Você não tem projetos em rascunho.
                </p>
              </div>
            ) : (
              renderProjectsList(draftProjects)
            )}
          </TabsContent>

          <TabsContent value="standalone" className="mt-4">
            {standaloneFolders.length === 0 ? (
              <div className="text-center py-12">
                <Folder className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground mb-4 text-sm">
                  Você não tem pastas sem projeto.
                </p>
                {(isAdmin || isGestor) && (
                  <Button onClick={() => setIsCreateOpen(true)} className="gap-2">
                    <Plus size={18} />
                    Criar Pasta Sem Projeto
                  </Button>
                )}
              </div>
            ) : (
              renderProjectsList(standaloneFolders, true)
            )}
          </TabsContent>
        </Tabs>
      </div>

      <CreateProjectDialog 
        open={isCreateOpen} 
        onOpenChange={(open) => {
          setIsCreateOpen(open);
          if (!open) setDefaultProjectDate(null);
        }}
        defaultDate={defaultProjectDate}
      />

      {/* Archived Projects - Drawer for mobile, Dialog for desktop */}
      {isMobile ? (
        <Drawer open={showArchivedDialog} onOpenChange={setShowArchivedDialog}>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle className="flex items-center gap-2">
                <Archive className="h-5 w-5" />
                Arquivados ({archivedProjects.length})
              </DrawerTitle>
            </DrawerHeader>
            <div className="px-4 pb-6">
              <ArchivedContent />
            </div>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={showArchivedDialog} onOpenChange={setShowArchivedDialog}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Archive className="h-5 w-5" />
                Projetos Arquivados ({archivedProjects.length})
              </DialogTitle>
            </DialogHeader>
            <div className="mt-4">
              <ArchivedContent />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </AppLayout>
  );
}
