import { useState, useEffect, useMemo } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { useAuth } from "@/fluzz/contexts/AuthContext";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";
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
import { Tabs, TabsList, TabsTrigger } from "@/fluzz/components/ui/tabs";
import { ScrollArea } from "@/fluzz/components/ui/scroll-area";

interface CreateUnifiedTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const CreateUnifiedTaskDialog = ({ 
  open, 
  onOpenChange 
}: CreateUnifiedTaskDialogProps) => {
  const { user } = useAuth();
  const { workspace, isAdmin, isGestor } = useWorkspace();
  const queryClient = useQueryClient();
  
  const canAssignToOthers = isAdmin || isGestor;
  
  // Task type: "standalone", "project", "routine"
  const [taskType, setTaskType] = useState<"standalone" | "project" | "routine">("standalone");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [status, setStatus] = useState("todo");
  const [dueDate, setDueDate] = useState("");
  const [setor, setSetor] = useState("");
  const [assignedTo, setAssignedTo] = useState<string>(user?.id || "");
  const [documentation, setDocumentation] = useState("");
  const [selectedProcesses, setSelectedProcesses] = useState<string[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedRoutineId, setSelectedRoutineId] = useState("");

  // Fetch positions (setores)
  const { data: positions } = useQuery({
    queryKey: ["positions", workspace?.id],
    queryFn: async () => {
      if (!workspace) return [];
      const { data, error } = await supabase
        .from("positions")
        .select("id, name")
        .eq("workspace_id", workspace.id)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!workspace && canAssignToOthers,
  });

  // Fetch user_positions (to get users linked to a sector)
  const { data: userPositions } = useQuery({
    queryKey: ["user-positions", workspace?.id],
    queryFn: async () => {
      if (!workspace) return [];
      
      // Get all position IDs in this workspace first
      const { data: workspacePositions, error: positionsError } = await supabase
        .from("positions")
        .select("id")
        .eq("workspace_id", workspace.id);
      
      if (positionsError) throw positionsError;
      if (!workspacePositions || workspacePositions.length === 0) return [];
      
      const positionIds = workspacePositions.map(p => p.id);
      
      const { data, error } = await supabase
        .from("user_positions")
        .select("user_id, position_id")
        .in("position_id", positionIds);
      
      if (error) throw error;
      return data;
    },
    enabled: !!workspace && canAssignToOthers,
  });

  // Fetch all workspace members
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
        full_name: profiles?.find(p => p.id === member.user_id)?.full_name || "Sem nome"
      }));
    },
    enabled: !!workspace,
  });

  // Filter members by selected sector
  const filteredMembers = useMemo(() => {
    if (!canAssignToOthers) {
      // Regular members can only see themselves
      const currentUser = workspaceMembers?.find(m => m.user_id === user?.id);
      return currentUser ? [currentUser] : [];
    }
    
    if (!setor) {
      // No sector selected, show all workspace members
      return workspaceMembers || [];
    }
    
    // Filter by users linked to the selected sector
    const userIdsInSector = userPositions
      ?.filter(up => up.position_id === setor)
      .map(up => up.user_id) || [];
    
    if (userIdsInSector.length === 0) {
      // No users linked to this sector, show all as fallback
      return workspaceMembers || [];
    }
    
    return workspaceMembers?.filter(m => userIdsInSector.includes(m.user_id)) || [];
  }, [canAssignToOthers, setor, userPositions, workspaceMembers, user?.id]);

  // Reset assignedTo when sector changes
  useEffect(() => {
    if (setor && canAssignToOthers) {
      // Check if current assignee is in the filtered list
      const isCurrentAssigneeValid = filteredMembers.some(m => m.user_id === assignedTo);
      if (!isCurrentAssigneeValid && filteredMembers.length > 0) {
        // Reset to first available or user's own ID
        const selfInList = filteredMembers.find(m => m.user_id === user?.id);
        setAssignedTo(selfInList?.user_id || filteredMembers[0]?.user_id || user?.id || "");
      }
    }
  }, [setor, filteredMembers, assignedTo, canAssignToOthers, user?.id]);

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
    enabled: !!workspace && taskType === "project",
  });

  const { data: routines } = useQuery({
    queryKey: ["routines", workspace?.id],
    queryFn: async () => {
      if (!workspace) return [];
      const { data, error } = await supabase
        .from("routines")
        .select("id, name")
        .eq("workspace_id", workspace.id)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!workspace && taskType === "routine",
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
    enabled: !!workspace,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const finalAssignedTo = assignedTo || user?.id;
      
      const taskData: any = {
        title,
        description,
        priority,
        status,
        due_date: dueDate || null,
        assigned_to: finalAssignedTo,
        documentation: documentation || null,
        setor: setor || null,
        project_id: null,
        routine_id: null,
        workspace_id: workspace?.id || null,
      };

      if (taskType === "project") {
        if (!selectedProjectId) {
          throw new Error("Selecione um projeto");
        }
        taskData.project_id = selectedProjectId;
      } else if (taskType === "routine") {
        if (!selectedRoutineId) {
          throw new Error("Selecione uma rotina");
        }
        taskData.routine_id = selectedRoutineId;
      }

      const { data: newTask, error: taskError } = await supabase
        .from("tasks")
        .insert([taskData])
        .select()
        .single();
      
      if (taskError) throw taskError;

      // Link selected processes
      if (selectedProcesses.length > 0) {
        const { error: processError } = await supabase
          .from("task_processes")
          .insert(
            selectedProcesses.map((processId) => ({
              task_id: newTask.id,
              process_id: processId,
            }))
          );
        if (processError) throw processError;
      }

      return newTask;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["home-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["my-tasks"] });
      toast.success("Tarefa criada com sucesso!");
      resetForm();
      onOpenChange(false);
    },
    onError: (error: any) => {
      console.error("Erro ao criar tarefa:", error);
      toast.error(error.message || "Erro ao criar tarefa");
    },
  });

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setPriority("medium");
    setStatus("todo");
    setDueDate("");
    setSetor("");
    setAssignedTo(user?.id || "");
    setDocumentation("");
    setSelectedProcesses([]);
    setSelectedProjectId("");
    setSelectedRoutineId("");
    setTaskType("standalone");
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
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Tarefa</DialogTitle>
          <DialogDescription>
            Crie uma nova tarefa e escolha o tipo e responsável
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-3">
            <Label>Tipo de Tarefa *</Label>
            <Tabs value={taskType} onValueChange={(v) => setTaskType(v as any)} className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="standalone">Pessoal</TabsTrigger>
                <TabsTrigger value="project">Projeto</TabsTrigger>
                <TabsTrigger value="routine">Rotina</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {taskType === "project" && (
            <div className="space-y-2">
              <Label htmlFor="project_id">Projeto *</Label>
              <Select value={selectedProjectId} onValueChange={setSelectedProjectId} required>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um projeto" />
                </SelectTrigger>
                <SelectContent>
                  {projects?.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {taskType === "routine" && (
            <div className="space-y-2">
              <Label htmlFor="routine_id">Rotina *</Label>
              <Select value={selectedRoutineId} onValueChange={setSelectedRoutineId} required>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma rotina" />
                </SelectTrigger>
                <SelectContent>
                  {routines?.map((routine) => (
                    <SelectItem key={routine.id} value={routine.id}>
                      {routine.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="title">Título *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Revisar documento"
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

          {/* Sector selection - only for admin/gestor */}
          {canAssignToOthers && (
            <div className="space-y-2">
              <Label>Setor</Label>
              <Select value={setor || "none"} onValueChange={(val) => setSetor(val === "none" ? "" : val)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um setor (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem setor específico</SelectItem>
                  {positions?.map((position) => (
                    <SelectItem key={position.id} value={position.id}>
                      {position.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Selecionar um setor filtra os responsáveis vinculados
              </p>
            </div>
          )}

          {/* Responsible selection */}
          <div className="space-y-2">
            <Label htmlFor="assigned_to">Responsável</Label>
            {canAssignToOthers ? (
              <Select value={assignedTo} onValueChange={setAssignedTo}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um responsável" />
                </SelectTrigger>
                <SelectContent>
                  {filteredMembers?.map((member) => (
                    <SelectItem key={member.user_id} value={member.user_id}>
                      {member.full_name}
                      {member.user_id === user?.id ? " (Você)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="flex items-center h-10 px-3 bg-muted/50 rounded-md border">
                <span className="text-sm">
                  {workspaceMembers?.find(m => m.user_id === user?.id)?.full_name || "Você"}
                </span>
              </div>
            )}
            {!canAssignToOthers && (
              <p className="text-xs text-muted-foreground">
                A tarefa será atribuída a você
              </p>
            )}
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

          <div className="space-y-2">
            <Label htmlFor="due_date">Data de Vencimento</Label>
            <Input
              id="due_date"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="documentation">Documentação</Label>
            <Textarea
              id="documentation"
              value={documentation}
              onChange={(e) => setDocumentation(e.target.value)}
              placeholder="Adicione documentação, links ou anotações importantes..."
              rows={3}
            />
          </div>

          {processes && processes.length > 0 && (
            <div className="space-y-2">
              <Label>POPs Vinculados</Label>
              <ScrollArea className="h-32 border rounded-md p-2">
                <div className="space-y-2">
                  {processes.map((process) => (
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
              </ScrollArea>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4">
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
