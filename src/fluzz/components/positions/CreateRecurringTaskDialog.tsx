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
import { 
  FileText, 
  Plus,
  ChevronRight
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/fluzz/components/ui/sheet";

interface CreateRecurringTaskDialogProps {
  positionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateRecurringTaskDialog({ positionId, open, onOpenChange }: CreateRecurringTaskDialogProps) {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const queryClient = useQueryClient();
  
  // Form states
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [recurrenceType, setRecurrenceType] = useState("daily");
  const [projectId, setProjectId] = useState<string>("none");
  const [selectedProcesses, setSelectedProcesses] = useState<string[]>([]);
  const [showProcessSheet, setShowProcessSheet] = useState(false);

  // Fetch projects for optional linking
  const { data: projects } = useQuery({
    queryKey: ["projects-for-routine", workspace?.id],
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

  // Fetch processes for optional linking
  const { data: processes } = useQuery({
    queryKey: ["processes-for-routine", workspace?.id],
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

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Usuário não autenticado");

      const { error } = await supabase.from("recurring_tasks").insert({
        position_id: positionId,
        title,
        description: description || null,
        priority,
        recurrence_type: recurrenceType,
        project_id: projectId === "none" ? null : projectId,
        process_id: selectedProcesses.length > 0 ? selectedProcesses[0] : null,
        created_by: user.id,
        workspace_id: workspace?.id,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Rotina criada com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["recurring-tasks", positionId] });
      resetForm();
      onOpenChange(false);
    },
    onError: (error: any) => {
      console.error("Error creating recurring task:", error);
      toast.error(error.message || "Erro ao criar rotina");
    },
  });

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setPriority("medium");
    setRecurrenceType("daily");
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
          <DialogTitle>Criar Nova Rotina</DialogTitle>
          <DialogDescription>
            Configure uma tarefa recorrente para este setor
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
              placeholder="Ex: Relatório de Vendas Diário"
              required
            />
          </div>

          {/* 2. Descrição */}
          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descreva detalhadamente o que deve ser feito nesta tarefa..."
              className="min-h-[80px] resize-y"
            />
          </div>

          {/* 3. Prioridade e Recorrência */}
          <div className="grid grid-cols-2 gap-4">
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

            <div className="space-y-2">
              <Label>Recorrência</Label>
              <Select value={recurrenceType} onValueChange={setRecurrenceType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Diária</SelectItem>
                  <SelectItem value="weekly">Semanal</SelectItem>
                  <SelectItem value="monthly">Mensal</SelectItem>
                  <SelectItem value="yearly">Anual</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 4. Projeto */}
          <div className="space-y-2">
            <Label>Vincular a Projeto (Opcional)</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um projeto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum projeto</SelectItem>
                {projects?.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Se vinculada, a tarefa aparecerá também no projeto selecionado
            </p>
          </div>

          {/* 5. POPs Vinculados */}
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
              {createMutation.isPending ? "Criando..." : "Criar Rotina"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
