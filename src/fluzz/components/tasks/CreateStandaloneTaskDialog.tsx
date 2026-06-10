import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { useAuth } from "@/fluzz/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/fluzz/components/ui/dialog";
import { Button } from "@/fluzz/components/ui/button";
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
import { toast } from "sonner";
import { Checkbox } from "@/fluzz/components/ui/checkbox";
import { useQuery } from "@tanstack/react-query";
import { SectorDrawer } from "./SectorDrawer";
import { MemberDrawer } from "./MemberDrawer";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";
import { Briefcase, UserCircle, ChevronRight } from "lucide-react";

interface CreateStandaloneTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const CreateStandaloneTaskDialog = ({ open, onOpenChange }: CreateStandaloneTaskDialogProps) => {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [dueDate, setDueDate] = useState("");
  const [sectorId, setSectorId] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [selectedProcesses, setSelectedProcesses] = useState<string[]>([]);

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
    enabled: !!workspace,
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
    enabled: !!workspace,
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
    enabled: !!workspace,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      console.log("Creating standalone task...");
      console.log("User ID:", user?.id);
      console.log("Assigned to:", assignedTo || user?.id);
      
      if (!user?.id) {
        throw new Error("Usuário não autenticado");
      }
      
      const taskData = {
        title,
        description: description || null,
        priority,
        status: "todo" as const,
        due_date: dueDate || null,
        assigned_to: assignedTo || user.id,
        setor: sectorId || null,
        project_id: null,
        workspace_id: workspace?.id || null,
      };
      
      console.log("Task data:", taskData);
      
      const { data: newTask, error: taskError } = await supabase
        .from("tasks")
        .insert([taskData])
        .select()
        .single();
      
      console.log("Insert result:", { newTask, taskError });
      
      if (taskError) {
        console.error("Task insert error:", taskError);
        throw taskError;
      }

      // Link selected processes
      if (selectedProcesses.length > 0 && newTask) {
        const { error: processError } = await supabase
          .from("task_processes")
          .insert(
            selectedProcesses.map((processId) => ({
              task_id: newTask.id,
              process_id: processId,
            }))
          );
        if (processError) {
          console.error("Process link error:", processError);
          throw processError;
        }
      }
      
      return newTask;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-tasks"] });
      toast.success("Tarefa pessoal criada com sucesso!");
      resetForm();
      onOpenChange(false);
    },
    onError: (error: any) => {
      console.error("Error creating task:", error);
      toast.error(`Erro ao criar tarefa: ${error.message || 'Erro desconhecido'}`);
    },
  });

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setPriority("medium");
    setDueDate("");
    setSectorId("");
    setAssignedTo("");
    setSelectedProcesses([]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("O título da tarefa é obrigatório");
      return;
    }
    createMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova Tarefa Pessoal</DialogTitle>
          <DialogDescription>
            Crie uma tarefa pessoal que não está vinculada a nenhum projeto
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Título *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Organizar documentos"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descreva os detalhes da tarefa..."
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
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
            <div className="space-y-2">
              <Label htmlFor="due_date">Data de Vencimento</Label>
              <Input
                id="due_date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Setor</Label>
            <SectorDrawer value={sectorId} onValueChange={(value) => {
              setSectorId(value);
              setAssignedTo("");
            }}>
              <Button variant="outline" className="w-full justify-between" type="button">
                <span className="flex items-center gap-2">
                  <Briefcase size={16} />
                  {sectorId && positions?.find(s => s.id === sectorId)?.name || "Selecione um setor"}
                </span>
                <ChevronRight size={16} />
              </Button>
            </SectorDrawer>
          </div>
          <div className="space-y-2">
            <Label>Responsável</Label>
            <MemberDrawer 
              value={assignedTo} 
              onValueChange={setAssignedTo}
              positionId={sectorId || undefined}
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
          <div className="space-y-2">
            <Label>POP's Vinculados</Label>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {processes?.map((process) => (
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
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                resetForm();
                onOpenChange(false);
              }}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Criando..." : "Criar Tarefa"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
