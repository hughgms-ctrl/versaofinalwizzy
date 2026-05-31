import { useState, useEffect } from "react";
import { Button } from "@/fluzz/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/fluzz/components/ui/dialog";
import { Input } from "@/fluzz/components/ui/input";
import { Label } from "@/fluzz/components/ui/label";
import { Textarea } from "@/fluzz/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/fluzz/components/ui/select";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Checkbox } from "@/fluzz/components/ui/checkbox";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";
import { MemberDrawer } from "../tasks/MemberDrawer";
import { SectorDrawer } from "../tasks/SectorDrawer";
import { UserCircle, ChevronRight, Briefcase } from "lucide-react";

interface EditRoutineTaskDialogProps {
  task: {
    id: string;
    title: string;
    description: string | null;
    priority: string | null;
    status: string | null;
    setor: string | null;
    documentation: string | null;
    project_id: string | null;
    process_id: string | null;
  };
  routineId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditRoutineTaskDialog({
  task,
  routineId,
  open,
  onOpenChange,
}: EditRoutineTaskDialogProps) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || "");
  const [priority, setPriority] = useState(task.priority || "medium");
  const [status, setStatus] = useState(task.status || "todo");
  const [setor, setSetor] = useState(task.setor || "");
  const [documentation, setDocumentation] = useState(task.documentation || "");
  const [projectId, setProjectId] = useState<string>(task.project_id || "none");
  const [selectedProcesses, setSelectedProcesses] = useState<string[]>(
    task.process_id ? [task.process_id] : []
  );
  const [assignedTo, setAssignedTo] = useState(
    (task as any).assigned_to || ""
  );
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();

  const { data: projects } = useQuery({
    queryKey: ["projects", workspace?.id],
    queryFn: async () => {
      if (!workspace) return [];
      const { data, error } = await supabase
        .from("projects")
        .select("id, name")
        .eq("workspace_id", workspace.id)
        .eq("archived", false)
        .order("name");
      
      if (error) throw error;
      return data;
    },
    enabled: open && !!workspace,
  });

  const { data: processes } = useQuery({
    queryKey: ["processes", workspace?.id],
    queryFn: async () => {
      if (!workspace) return [];
      const { data, error } = await supabase
        .from("process_documentation")
        .select("id, title, area")
        .eq("workspace_id", workspace.id)
        .order("title");
      
      if (error) throw error;
      return data;
    },
    enabled: open && !!workspace,
  });

  const { data: positions } = useQuery({
    queryKey: ["positions", workspace?.id],
    queryFn: async () => {
      if (!workspace) return [];
      const { data, error } = await supabase
        .from("positions")
        .select("*")
        .eq("workspace_id", workspace.id)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: open && !!workspace,
  });

  const { data: workspaceMembers } = useQuery({
    queryKey: ["workspace-members", workspace?.id],
    queryFn: async () => {
      if (!workspace) return [];
      
      const { data: members, error: membersError } = await supabase
        .from("workspace_members")
        .select("user_id, role")
        .eq("workspace_id", workspace.id);
      
      if (membersError) throw membersError;
      if (!members || members.length === 0) return [];

      const userIds = members.map(m => m.user_id);
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      
      if (profilesError) throw profilesError;

      return members.map(member => ({
        user_id: member.user_id,
        role: member.role,
        profiles: profiles?.find(p => p.id === member.user_id)
      }));
    },
    enabled: !!workspace && open,
  });

  useEffect(() => {
    if (open) {
      setTitle(task.title);
      setDescription(task.description || "");
      setPriority(task.priority || "medium");
      setStatus(task.status || "todo");
      setSetor(task.setor || "");
      setDocumentation(task.documentation || "");
      setProjectId(task.project_id || "none");
      setSelectedProcesses(task.process_id ? [task.process_id] : []);
      setAssignedTo((task as any).assigned_to || "");
    }
  }, [open, task]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase
        .from("routine_tasks")
        .update({
          title,
          description,
          priority,
          status,
          setor: setor || null,
          documentation: documentation || null,
          project_id: projectId === "none" ? null : projectId,
          process_id: selectedProcesses.length > 0 ? selectedProcesses[0] : null,
          assigned_to: assignedTo || null,
        })
        .eq("id", task.id);

      if (error) throw error;

      toast.success("Tarefa atualizada com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["routine-tasks", routineId] });
      onOpenChange(false);
    } catch (error) {
      console.error("Error updating routine task:", error);
      toast.error("Erro ao atualizar tarefa");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Editar Tarefa da Rotina</DialogTitle>
          <DialogDescription>
            Atualize as informações da tarefa
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="title">Nome da Tarefa *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Conferir relatório financeiro"
              required
            />
          </div>

          <div>
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descreva os detalhes da tarefa"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="priority">Prioridade</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Baixa</SelectItem>
                  <SelectItem value="medium">Média</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="status">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todo">A fazer</SelectItem>
                  <SelectItem value="in_progress">Fazendo</SelectItem>
                  <SelectItem value="completed">Feito</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Setor</Label>
            <SectorDrawer value={setor} onValueChange={(value) => {
              setSetor(value);
              setAssignedTo("");
            }}>
              <Button variant="outline" className="w-full justify-between" type="button">
                <span className="flex items-center gap-2">
                  <Briefcase size={16} />
                  {setor && positions?.find(s => s.id === setor)?.name || "Selecione um setor"}
                </span>
                <ChevronRight size={16} />
              </Button>
            </SectorDrawer>
          </div>

          <div>
            <Label>Responsável (Opcional)</Label>
            <MemberDrawer 
              value={assignedTo} 
              onValueChange={setAssignedTo}
              positionId={setor || undefined}
            >
              <Button variant="outline" className="w-full justify-between" type="button">
                <span className="flex items-center gap-2">
                  <UserCircle size={16} />
                  {assignedTo && workspaceMembers?.find(m => m.user_id === assignedTo)?.profiles?.full_name || "Selecione um responsável"}
                </span>
                <ChevronRight size={16} />
              </Button>
            </MemberDrawer>
          </div>

          <div>
            <Label htmlFor="project">Vincular a Projeto (Opcional)</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um projeto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum</SelectItem>
                {projects?.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>POPs Vinculados (Opcional)</Label>
            <div className="space-y-2 max-h-48 overflow-y-auto border rounded-md p-3">
              {processes && processes.length > 0 ? (
                processes.map((process) => (
                  <div key={process.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`process-${process.id}`}
                      checked={selectedProcesses.includes(process.id)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedProcesses([...selectedProcesses, process.id]);
                        } else {
                          setSelectedProcesses(selectedProcesses.filter((id) => id !== process.id));
                        }
                      }}
                    />
                    <Label htmlFor={`process-${process.id}`} className="text-sm font-normal cursor-pointer flex-1">
                      {process.title} <span className="text-muted-foreground">({process.area})</span>
                    </Label>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">Nenhum processo disponível</p>
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="documentation">Documentação</Label>
            <Textarea
              id="documentation"
              value={documentation}
              onChange={(e) => setDocumentation(e.target.value)}
              placeholder="Adicione documentação, links ou anotações importantes..."
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
