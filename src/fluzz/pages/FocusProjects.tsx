import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { AppLayout } from "@/fluzz/components/layout/AppLayout";
import { useNavigate } from "react-router-dom";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";
import { useAuth } from "@/fluzz/contexts/AuthContext";
import { FolderKanban, ChevronRight } from "lucide-react";
import { cn } from "@/fluzz/lib/utils";
import { Badge } from "@/fluzz/components/ui/badge";

const projectColorMap: Record<string, string> = {
  primary: "hsl(var(--primary))",
  blue: "hsl(217, 91%, 60%)",
  emerald: "hsl(142, 71%, 45%)",
  amber: "hsl(43, 96%, 56%)",
  purple: "hsl(271, 81%, 56%)",
  pink: "hsl(330, 81%, 60%)",
  cyan: "hsl(188, 94%, 42%)",
  rose: "hsl(346, 77%, 49%)",
  orange: "hsl(25, 95%, 53%)",
  teal: "hsl(173, 80%, 40%)",
};

export default function FocusProjects() {
  const navigate = useNavigate();
  const { workspace, isAdmin, isGestor } = useWorkspace();
  const { user } = useAuth();

  const { data: projects, isLoading } = useQuery({
    queryKey: ["projects", workspace?.id],
    queryFn: async () => {
      if (!workspace?.id) return [];
      const { data, error } = await supabase
        .from("projects")
        .select("*, tasks(id, status)")
        .eq("workspace_id", workspace.id)
        .eq("archived", false)
        .eq("is_draft", false)
        .eq("is_standalone_folder", false)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!workspace?.id,
  });

  const activeProjects = useMemo(() => {
    return (projects || []).filter(p => !p.pending_notifications);
  }, [projects]);

  const handleProjectClick = (projectId: string) => {
    navigate(`/tools/wizzy-flow/my-tasks?projectId=${projectId}`);
  };

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
      <div className="space-y-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Projetos</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Selecione um projeto para ver suas tarefas
          </p>
        </div>

        {activeProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <FolderKanban className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-medium text-lg mb-1">Nenhum projeto</h3>
            <p className="text-sm text-muted-foreground">
              Você não tem projetos ativos no momento
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {activeProjects.map((project) => {
              const totalTasks = project.tasks?.length || 0;
              const completedTasks = project.tasks?.filter((t: any) => t.status === "completed").length || 0;
              const pendingTasks = totalTasks - completedTasks;
              const color = projectColorMap[project.color || "primary"] || projectColorMap.primary;

              return (
                <button
                  key={project.id}
                  onClick={() => handleProjectClick(project.id)}
                  className="w-full flex items-center gap-3 p-4 rounded-lg border bg-card hover:bg-accent/30 transition-colors text-left"
                >
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-foreground">
                      {project.name}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {pendingTasks} pendente{pendingTasks !== 1 ? "s" : ""} · {completedTasks} concluída{completedTasks !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-xs flex-shrink-0">
                    {totalTasks}
                  </Badge>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/40 flex-shrink-0" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
