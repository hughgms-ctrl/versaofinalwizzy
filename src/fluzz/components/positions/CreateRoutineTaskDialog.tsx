import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";
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
import { Checkbox } from "@/fluzz/components/ui/checkbox";
import { ScrollArea } from "@/fluzz/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/fluzz/components/ui/select";
import { toast } from "sonner";
import { MemberDrawer } from "../tasks/MemberDrawer";
import { 
  UserCircle, 
  ChevronRight, 
  FileText, 
  Plus
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/fluzz/components/ui/sheet";

interface CreateRoutineTaskDialogProps {
  routineId: string;
  positionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateRoutineTaskDialog({
  routineId,
  positionId,
  open,
  onOpenChange,
}: CreateRoutineTaskDialogProps) {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const queryClient = useQueryClient();
  
  // Form states
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [priority, setPriority] = useState("medium");
  const [status, setStatus] = useState("todo");
  const [startDate, setStartDate] = useState("");
  const [documentation, setDocumentation] = useState("");
  const [projectId, setProjectId] = useState<string>("none");
  const [selectedProcesses, setSelectedProcesses] = useState<string[]>([]);
  const [showProcessSheet, setShowProcessSheet] = useState(false);

  // Fetch position details
  const { data: position } = useQuery({
    queryKey: ["position", positionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("positions")
        .select("id, name")
        .eq("id", positionId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: open && !!positionId,
  });

  // Fetch projects
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

  // Fetch workspace members assigned to this position
  const { data: workspaceMembers } = useQuery({
    queryKey: ["workspace-members-position", workspace?.id, positionId],
    queryFn: async () => {
      if (!workspace) return [];
      
      // Get users assigned to this position
      const { data: userPositions, error: posError } = await supabase
        .from("user_positions")
        .select("user_id")
        .eq("position_id", positionId);
      
      if (posError) throw posError;
      
      const assignedUserIds = userPositions?.map(up => up.user_id) || [];
      
      const { data: members, error: membersError } = await supabase
        .from("workspace_members")
        .select("user_id, role")
        .eq("workspace_id", workspace.id);
      
      if (membersError) throw membersError;
      if (!members || members.length === 0) return [];

      // Filter only members assigned to this position
      const filteredMembers = members.filter(m => assignedUserIds.includes(m.user_id));
      if (filteredMembers.length === 0) return [];

      const userIds = filteredMembers.map(m => m.user_id);
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      
      if (profilesError) throw profilesError;

      return filteredMembers.map(member => ({
        user_id: member.user_id,
        role: member.role,
        profiles: profiles?.find(p => p.id === member.user_id)
      }));
    },
    enabled: !!workspace && open && !!positionId,
  });

  // Fetch processes for this position's sector
  const { data: processes } = useQuery({
    queryKey: ["processes", workspace?.id, position?.name],
    queryFn: async () => {
      if (!workspace || !position) return [];
      
      const { data, error } = await supabase
        .from("process_documentation")
        .select("id, title, area")
        .eq("workspace_id", workspace.id)
        .eq("area", position.name)
        .order("title");
      
      if (error) throw error;
      return data;
    },
    enabled: !!workspace && open && !!position?.name,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data: newTask, error: taskError } = await supabase
        .from("routine_tasks")
        .insert({
          routine_id: routineId,
          title,
          description: description || null,
          priority,
          status,
          setor: positionId, // Store the position ID
          documentation: documentation || null,
          project_id: projectId === "none" ? null : projectId,
          assigned_to: assignedTo || null,
          start_date: startDate || null,
          process_id: selectedProcesses.length > 0 ? selectedProcesses[0] : null,
        })
        .select()
        .single();

      if (taskError) throw taskError;
      return newTask;
    },
    onSuccess: () => {
      toast.success("Tarefa adicionada à rotina!");
      queryClient.invalidateQueries({ queryKey: ["routine-tasks", routineId] });
      resetForm();
      onOpenChange(false);
    },
    onError: (error: any) => {
      console.error("Error creating routine task:", error);
      toast.error("Erro ao criar tarefa");
    },
  });

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setAssignedTo("");
    setPriority("medium");
    setStatus("todo");
    setStartDate("");
    setDocumentation("");
    setProjectId("none");
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

  const getMemberName = (userId: string) => {
    return workspaceMembers?.find(m => m.user_id === userId)?.profiles?.full_name || "Selecione um responsável";
  };

  const toggleProcess = (processId: string) => {
    setSelectedProcesses(prev => 
      prev.includes(processId) 
        ? prev.filter(id => id !== processId)
        : [...prev, processId]
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Adicionar Tarefa à Rotina</DialogTitle>
          <DialogDescription>
            Esta tarefa será gerada automaticamente conforme a recorrência da rotina
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 1. Título */}
          <div className="space-y-2">
            <Label htmlFor="title">Título *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Conferir relatório financeiro"
              required
            />
          </div>

          {/* 2. Descrição */}
          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descreva os detalhes da tarefa..."
              className="min-h-[80px] resize-y"
            />
          </div>

          {/* 3. Responsável - only members from this position */}
          <div className="space-y-2">
            <Label>Responsável</Label>
            <MemberDrawer 
              value={assignedTo} 
              onValueChange={setAssignedTo}
              positionId={positionId}
            >
              <Button variant="outline" className="w-full justify-between" type="button">
                <span className="flex items-center gap-2">
                  <UserCircle size={16} />
                  {assignedTo ? getMemberName(assignedTo) : "Selecione um responsável"}
                </span>
                <ChevronRight size={16} />
              </Button>
            </MemberDrawer>
          </div>

          {/* 4. Prioridade */}
          <div className="space-y-2">
            <Label>Prioridade</Label>
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

          {/* 5. Status */}
          <div className="space-y-2">
            <Label>Status</Label>
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

          {/* 6. Datas */}
          <div className="space-y-2">
            <Label>Data de Início</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          {/* 7. Projeto */}
          <div className="space-y-2">
            <Label>Vincular a Projeto (Opcional)</Label>
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

          {/* 8. Documentação */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <FileText size={16} />
              Documentação
            </Label>
            <Textarea
              value={documentation}
              onChange={(e) => setDocumentation(e.target.value)}
              placeholder="Adicione documentação, links ou anotações importantes..."
              className="min-h-[80px] resize-y"
            />
          </div>

          {/* 9. POPs Vinculados */}
          <div className="space-y-2">
            <Label>POP's Vinculados</Label>
            <Sheet open={showProcessSheet} onOpenChange={setShowProcessSheet}>
              <SheetTrigger asChild>
                <Button variant="outline" className="w-full justify-between" type="button">
                  <span className="flex items-center gap-2">
                    <Plus size={16} />
                    {selectedProcesses.length > 0 
                      ? `${selectedProcesses.length} POP(s) selecionado(s)`
                      : "Vincular POPs"}
                  </span>
                  <ChevronRight size={16} />
                </Button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>Selecionar POPs</SheetTitle>
                </SheetHeader>
                <ScrollArea className="h-[calc(100vh-120px)] mt-4">
                  <div className="space-y-2">
                    {processes && processes.length > 0 ? (
                      processes.map((process) => (
                        <div
                          key={process.id}
                          className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                          onClick={() => toggleProcess(process.id)}
                        >
                          <Checkbox 
                            checked={selectedProcesses.includes(process.id)}
                            onCheckedChange={() => toggleProcess(process.id)}
                          />
                          <div className="flex-1">
                            <p className="font-medium">{process.title}</p>
                            <p className="text-xs text-muted-foreground">{process.area}</p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <FileText size={48} className="mx-auto mb-4 opacity-20" />
                        <p>Nenhum POP encontrado</p>
                        <p className="text-sm mt-2">
                          Nenhum processo cadastrado para este setor
                        </p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </SheetContent>
            </Sheet>

            {/* Show selected processes */}
            {selectedProcesses.length > 0 && (
              <div className="space-y-1">
                {selectedProcesses.map(processId => {
                  const process = processes?.find(p => p.id === processId);
                  return process ? (
                    <div key={processId} className="flex items-center gap-2 text-sm">
                      <div className="w-2 h-2 rounded-full bg-primary" />
                      <span>{process.title}</span>
                      <span className="text-muted-foreground">({process.area})</span>
                    </div>
                  ) : null;
                })}
              </div>
            )}
          </div>

          {/* Buttons */}
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
              {createMutation.isPending ? "Adicionando..." : "Adicionar Tarefa"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
