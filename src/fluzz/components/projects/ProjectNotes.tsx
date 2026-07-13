import { Card, CardContent, CardHeader, CardTitle } from "@/fluzz/components/ui/card";
import { Badge } from "@/fluzz/components/ui/badge";
import { ScrollArea } from "@/fluzz/components/ui/scroll-area";
import { Button } from "@/fluzz/components/ui/button";
import { FileText, Calendar, User, Download, ExternalLink, Paperclip, Link as LinkIcon, FileIcon, FileImage, FileVideo, FileAudio, Archive } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { renderDocumentation } from "@/fluzz/lib/linkify";
import { resolveAttachmentUrl } from "@/fluzz/lib/taskFiles";
import { formatDateBR } from "@/fluzz/lib/utils";
import { useMemo } from "react";

interface ProjectNotesProps {
  projectId: string;
  tasks: any[];
}

// Natural sort function - recognizes numbers in strings (1, 2, 10, 11 not 1, 10, 11, 2)
const naturalSort = (a: string, b: string) => {
  return a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' });
};

const getFileIcon = (fileType: string | null) => {
  if (!fileType) return <FileIcon size={14} />;
  
  if (fileType.startsWith("image/")) return <FileImage size={14} />;
  if (fileType.startsWith("video/")) return <FileVideo size={14} />;
  if (fileType.startsWith("audio/")) return <FileAudio size={14} />;
  if (fileType.includes("pdf") || fileType.includes("document") || fileType.includes("text")) 
    return <FileText size={14} />;
  if (fileType.includes("zip") || fileType.includes("rar") || fileType.includes("archive"))
    return <Archive size={14} />;
  
  return <FileIcon size={14} />;
};

export function ProjectNotes({ projectId, tasks }: ProjectNotesProps) {
  const navigate = useNavigate();

  // Fetch profiles for assigned users
  const { data: profiles } = useQuery({
    queryKey: ["task-profiles", projectId],
    queryFn: async () => {
      const userIds = [...new Set(tasks?.filter(t => t.assigned_to).map(t => t.assigned_to))];
      if (userIds.length === 0) return {};
      
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      
      if (error) throw error;
      
      return data?.reduce((acc, profile) => {
        acc[profile.id] = profile.full_name;
        return acc;
      }, {} as Record<string, string>) || {};
    },
    enabled: !!tasks && tasks.length > 0,
  });

  // Fetch positions/sectors to get names
  const { data: positions } = useQuery({
    queryKey: ["positions-for-notes", projectId],
    queryFn: async () => {
      const sectorIds = [...new Set(tasks?.filter(t => t.setor).map(t => t.setor))];
      if (sectorIds.length === 0) return {};
      
      const { data, error } = await supabase
        .from("positions")
        .select("id, name")
        .in("id", sectorIds);
      
      if (error) throw error;
      
      return data?.reduce((acc, position) => {
        acc[position.id] = position.name;
        return acc;
      }, {} as Record<string, string>) || {};
    },
    enabled: !!tasks && tasks.length > 0,
  });

  // Fetch attachments for all tasks
  const taskIds = tasks?.map(t => t.id) || [];
  const { data: attachments } = useQuery({
    queryKey: ["project-task-attachments", projectId],
    queryFn: async () => {
      if (taskIds.length === 0) return {};
      
      const { data, error } = await supabase
        .from("task_attachments")
        .select("*")
        .in("task_id", taskIds);
      
      if (error) throw error;
      
      // Group by task_id
      return data?.reduce((acc, attachment) => {
        if (!acc[attachment.task_id]) {
          acc[attachment.task_id] = [];
        }
        acc[attachment.task_id].push(attachment);
        return acc;
      }, {} as Record<string, any[]>) || {};
    },
    enabled: taskIds.length > 0,
  });

  // Filter tasks that have documentation OR attachments and sort alphabetically
  const tasksWithNotes = useMemo(() => {
    const filtered = tasks?.filter(task => {
      const hasDocumentation = task.documentation && task.documentation.trim() !== "";
      const hasAttachments = attachments?.[task.id]?.length > 0;
      return hasDocumentation || hasAttachments;
    }) || [];
    
    // Sort by title using natural sort
    return filtered.sort((a, b) => naturalSort(a.title, b.title));
  }, [tasks, attachments]);

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "todo": return "A fazer";
      case "in_progress": return "Fazendo";
      case "review": return "Em Revisão";
      case "completed": return "Feito";
      default: return status;
    }
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "todo": return "secondary";
      case "in_progress": return "default";
      case "review": return "outline";
      case "completed": return "default";
      default: return "secondary";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high": return "text-red-500";
      case "medium": return "text-yellow-500";
      case "low": return "text-green-500";
      default: return "text-muted-foreground";
    }
  };

  // Get sector name from ID
  const getSectorName = (sectorId: string) => {
    return positions?.[sectorId] || sectorId;
  };

  if (tasksWithNotes.length === 0) {
    return (
      <div className="text-center py-16">
        <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-2">Nenhuma nota encontrada</h3>
        <p className="text-muted-foreground max-w-md mx-auto">
          As notas aparecerão aqui quando os membros adicionarem informações no campo 
          "Documentação" das tarefas ou anexarem arquivos.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Notas do Projeto</h2>
          <p className="text-sm text-muted-foreground">
            {tasksWithNotes.length} {tasksWithNotes.length === 1 ? "tarefa com notas" : "tarefas com notas"}
          </p>
        </div>
      </div>

      <ScrollArea className="h-[600px] pr-4">
        <div className="space-y-4">
          {tasksWithNotes.map((task) => {
            const taskAttachments = attachments?.[task.id] || [];
            
            return (
              <Card 
                key={task.id} 
                className="hover:border-primary/50 transition-colors cursor-pointer"
                onClick={() => navigate(`/tools/wizzy-flow/tasks/${task.id}`)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base font-medium text-foreground line-clamp-2">
                      {task.title}
                    </CardTitle>
                    <Badge variant={getStatusVariant(task.status) as any} className="flex-shrink-0">
                      {getStatusLabel(task.status)}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mt-2">
                    {task.assigned_to && profiles?.[task.assigned_to] && (
                      <div className="flex items-center gap-1">
                        <User size={12} />
                        <span>{profiles[task.assigned_to]}</span>
                      </div>
                    )}
                    {task.due_date && (
                      <div className="flex items-center gap-1">
                        <Calendar size={12} />
                        <span>{formatDateBR(task.due_date)}</span>
                      </div>
                    )}
                    {task.setor && (
                      <Badge variant="outline" className="text-xs">
                        {getSectorName(task.setor)}
                      </Badge>
                    )}
                    {task.priority && (
                      <span className={`${getPriorityColor(task.priority)} capitalize`}>
                        {task.priority === "high" ? "Alta" : task.priority === "medium" ? "Média" : "Baixa"}
                      </span>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {task.documentation && (
                    <div className="bg-muted/50 rounded-lg p-4 text-sm text-foreground whitespace-pre-wrap">
                      {renderDocumentation(task.documentation)}
                    </div>
                  )}
                  
                  {taskAttachments.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <Paperclip size={14} />
                        <span>Arquivos ({taskAttachments.length})</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {taskAttachments.map((attachment: any) => (
                          <Button
                            key={attachment.id}
                            variant="outline"
                            size="sm"
                            className="gap-2 text-xs"
                            onClick={async (e) => {
                              e.stopPropagation();
                              // Bucket privado: abre a janela já (evita bloqueio de
                              // popup) e resolve a signed URL antes de navegar.
                              const win = window.open("", "_blank");
                              const url = await resolveAttachmentUrl(attachment);
                              if (win) win.location.href = url;
                            }}
                          >
                            {attachment.file_type === "link" ? (
                              <LinkIcon size={12} />
                            ) : (
                              getFileIcon(attachment.file_type)
                            )}
                            <span className="max-w-[150px] truncate">{attachment.name}</span>
                            {attachment.file_type === "link" ? (
                              <ExternalLink size={12} />
                            ) : (
                              <Download size={12} />
                            )}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}