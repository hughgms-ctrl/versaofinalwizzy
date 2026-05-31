import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Input } from "@/fluzz/components/ui/input";
import { Label } from "@/fluzz/components/ui/label";
import { Textarea } from "@/fluzz/components/ui/textarea";
import { toast } from "sonner";
import { FileText, FolderPlus, ArrowLeft, Check, Trash2, Folder } from "lucide-react";
import { Card, CardContent } from "@/fluzz/components/ui/card";
import { cn } from "@/fluzz/lib/utils";

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate?: Date | null;
}

type DialogStep = "choose" | "new" | "template" | "standalone";

export const CreateProjectDialog = ({ open, onOpenChange, defaultDate }: CreateProjectDialogProps) => {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [step, setStep] = useState<DialogStep>("choose");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [templateToDelete, setTemplateToDelete] = useState<string | null>(null);

  // Set default date when provided (for calendar click)
  useEffect(() => {
    if (defaultDate && open) {
      const dateStr = defaultDate.toISOString().split('T')[0];
      setStartDate(dateStr);
      setEndDate(dateStr);
    }
  }, [defaultDate, open]);

  const { data: templates } = useQuery({
    queryKey: ["project-templates", workspace?.id],
    queryFn: async () => {
      if (!workspace?.id) return [];
      const { data, error } = await supabase
        .from("project_templates")
        .select("id, name, description, color")
        .eq("workspace_id", workspace.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!workspace?.id && open,
  });

  const createMutation = useMutation({
    mutationFn: async (isStandaloneFolder: boolean = false) => {
      if (!workspace) {
        toast.error("Workspace não encontrado");
        return;
      }

      const { data, error } = await supabase
        .from("projects")
        .insert([
          {
            user_id: user!.id,
            workspace_id: workspace.id,
            name,
            description,
            status: "active",
            is_standalone_folder: isStandaloneFolder,
            is_draft: true,
            pending_notifications: true,
            start_date: startDate || null,
            end_date: endDate || startDate || null,
          },
        ])
        .select()
        .single();
      
      if (error) {
        console.error("Erro ao criar projeto:", error);
        throw error;
      }
      
      return data;
    },
    onSuccess: async (data, isStandaloneFolder) => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      await queryClient.refetchQueries({ queryKey: ["projects"] });
      toast.success(isStandaloneFolder ? "Rascunho criado! Edite e publique quando estiver pronto." : "Rascunho criado! Edite e publique quando estiver pronto.");
      handleClose();
      // Navegar para o novo projeto para edição
      if (data) {
        window.location.href = `/projects/${data.id}`;
      }
    },
    onError: (error) => {
      console.error("Erro na mutation:", error);
      toast.error("Erro ao criar projeto");
    },
  });

  const createFromTemplateMutation = useMutation({
    mutationFn: async (templateId: string) => {
      if (!workspace || !user) {
        throw new Error("Workspace ou usuário não encontrado");
      }

      // Fetch template from project_templates table
      const { data: template, error: templateError } = await supabase
        .from("project_templates")
        .select("*")
        .eq("id", templateId)
        .single();

      if (templateError) throw templateError;

      // Create new project based on template with is_draft = true and preserve color
      const { data: newProject, error: projectError } = await supabase
        .from("projects")
        .insert([
          {
            name: template.name,
            description: null, // NÃO copiar descrição do template
            status: "active",
            user_id: user.id,
            workspace_id: workspace.id,
            is_draft: true, // Sempre começa como rascunho
            pending_notifications: true, // Notificações pendentes
            color: template.color, // Manter a cor do template
          },
        ])
        .select()
        .single();

      if (projectError) throw projectError;

      // Fetch template tasks with subtasks
      const { data: templateTasks, error: tasksError } = await supabase
        .from("template_tasks")
        .select("*")
        .eq("template_id", templateId)
        .order("task_order");

      if (tasksError) throw tasksError;

      // Fetch template subtasks
      const { data: templateSubtasks } = await supabase
        .from("template_subtasks")
        .select("*")
        .in("template_task_id", templateTasks?.map(t => t.id) || []);

      // Fetch template task processes
      const { data: templateTaskProcesses } = await supabase
        .from("template_task_processes")
        .select("*")
        .in("template_task_id", templateTasks?.map(t => t.id) || []);

      // Fetch template task assignees
      const { data: templateTaskAssignees } = await supabase
        .from("template_task_assignees")
        .select("*")
        .in("template_task_id", templateTasks?.map(t => t.id) || []);

      if (templateTasks && templateTasks.length > 0) {
        const taskIdToIndex: Record<string, number> = {};
        templateTasks.forEach((task, index) => {
          taskIdToIndex[task.id] = index;
        });

        const newTasks = templateTasks.map((task) => ({
          title: task.title,
          description: task.description, // Copiar descrição do template
          status: "todo",
          priority: task.priority,
          setor: task.setor,
          documentation: null, // NÃO copiar documentação
          process_id: task.process_id,
          completed_verified: false,
          project_id: newProject.id,
          due_date: null, // NÃO copiar datas
          start_date: null, // NÃO copiar datas
        }));

        const { data: insertedTasks, error: insertError } = await supabase
          .from("tasks")
          .insert(newTasks)
          .select();

        if (insertError) throw insertError;

        if (insertedTasks && insertedTasks.length > 0) {
          // Copy subtasks
          const allSubtasks: any[] = [];
          for (let i = 0; i < templateTasks.length; i++) {
            const originalTask = templateTasks[i];
            const newTask = insertedTasks[i];
            const taskSubtasks = templateSubtasks?.filter(s => s.template_task_id === originalTask.id) || [];
            
            if (taskSubtasks.length > 0) {
              const subtasksForTask = taskSubtasks.map((subtask) => ({
                title: subtask.title,
                completed: false,
                task_id: newTask.id,
              }));
              allSubtasks.push(...subtasksForTask);
            }
          }

          if (allSubtasks.length > 0) {
            await supabase.from("subtasks").insert(allSubtasks);
          }

          // Copy task_processes
          if (templateTaskProcesses && templateTaskProcesses.length > 0) {
            const newTaskProcesses = templateTaskProcesses
              .filter(tp => taskIdToIndex[tp.template_task_id] !== undefined)
              .map(tp => ({
                task_id: insertedTasks[taskIdToIndex[tp.template_task_id]].id,
                process_id: tp.process_id,
              }));

            if (newTaskProcesses.length > 0) {
              await supabase.from("task_processes").insert(newTaskProcesses);
            }
          }

          // Copy task_assignees from template
          if (templateTaskAssignees && templateTaskAssignees.length > 0) {
            const newTaskAssignees = templateTaskAssignees
              .filter(ta => taskIdToIndex[ta.template_task_id] !== undefined)
              .map(ta => ({
                task_id: insertedTasks[taskIdToIndex[ta.template_task_id]].id,
                user_id: ta.user_id,
              }));

            if (newTaskAssignees.length > 0) {
              await supabase.from("task_assignees").insert(newTaskAssignees);
            }
          }
        }
      }

      return newProject;
    },
    onSuccess: async (newProject) => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Rascunho criado! Edite e clique em 'Publicar' quando estiver pronto.");
      handleClose();
      // Navegar para o novo projeto
      if (newProject) {
        window.location.href = `/projects/${newProject.id}`;
      }
    },
    onError: (error) => {
      console.error("Erro ao criar projeto a partir do modelo:", error);
      toast.error("Erro ao criar projeto a partir do modelo");
    },
  });

  const handleClose = () => {
    setName("");
    setDescription("");
    setStartDate("");
    setEndDate("");
    setStep("choose");
    setSelectedTemplate(null);
    onOpenChange(false);
  };

  const handleSubmit = (e: React.FormEvent, isStandaloneFolder: boolean = false) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error(isStandaloneFolder ? "O nome da pasta é obrigatório" : "O nome do projeto é obrigatório");
      return;
    }
    createMutation.mutate(isStandaloneFolder);
  };

  const handleCreateFromTemplate = () => {
    if (!selectedTemplate) {
      toast.error("Selecione um modelo");
      return;
    }
    createFromTemplateMutation.mutate(selectedTemplate);
  };

  const deleteTemplateMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const { error } = await supabase
        .from("project_templates")
        .delete()
        .eq("id", templateId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-templates"] });
      toast.success("Modelo excluído com sucesso!");
      setTemplateToDelete(null);
      setSelectedTemplate(null);
    },
    onError: () => {
      toast.error("Erro ao excluir modelo");
    },
  });

  return (
    <>
      <AlertDialog open={!!templateToDelete} onOpenChange={() => setTemplateToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Modelo</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza de que deseja excluir este modelo? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => templateToDelete && deleteTemplateMutation.mutate(templateToDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        {step === "choose" && (
          <>
            <DialogHeader>
              <DialogTitle>Novo Projeto</DialogTitle>
              <DialogDescription>
                Escolha como deseja criar seu projeto
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
              <Card 
                className="cursor-pointer hover:border-primary transition-colors"
                onClick={() => setStep("new")}
              >
                <CardContent className="p-4 sm:p-6 flex flex-col items-center gap-3 text-center">
                  <FolderPlus className="h-8 w-8 sm:h-10 sm:w-10 text-primary" />
                  <div>
                    <h3 className="font-semibold text-sm sm:text-base">Novo Projeto</h3>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      Criar projeto do zero
                    </p>
                  </div>
                </CardContent>
              </Card>
              <Card 
                className="cursor-pointer hover:border-primary transition-colors"
                onClick={() => setStep("standalone")}
              >
                <CardContent className="p-4 sm:p-6 flex flex-col items-center gap-3 text-center">
                  <Folder className="h-8 w-8 sm:h-10 sm:w-10 text-primary" />
                  <div>
                    <h3 className="font-semibold text-sm sm:text-base">Sem Projeto</h3>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      Para tarefas sem projeto
                    </p>
                  </div>
                </CardContent>
              </Card>
              <Card 
                className={cn(
                  "cursor-pointer hover:border-primary transition-colors",
                  (!templates || templates.length === 0) && "opacity-50 cursor-not-allowed"
                )}
                onClick={() => templates && templates.length > 0 && setStep("template")}
              >
                <CardContent className="p-4 sm:p-6 flex flex-col items-center gap-3 text-center">
                  <FileText className="h-8 w-8 sm:h-10 sm:w-10 text-primary" />
                  <div>
                    <h3 className="font-semibold text-sm sm:text-base">Usar Modelo</h3>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      {templates && templates.length > 0 
                        ? `${templates.length} modelo(s)`
                        : "Nenhum modelo"
                      }
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}

        {step === "new" && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => setStep("choose")}
                  className="h-8 w-8"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                  <DialogTitle>Novo Projeto</DialogTitle>
                  <DialogDescription>
                    Crie um novo projeto para organizar suas tarefas
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <form onSubmit={(e) => handleSubmit(e, false)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome do Projeto *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Website Redesign"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Descrição</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Descreva o objetivo do projeto..."
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="startDate">Data de Início</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      // Se a data de fim for anterior, ajusta
                      if (endDate && e.target.value > endDate) {
                        setEndDate(e.target.value);
                      }
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endDate">Data de Fim</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={endDate}
                    min={startDate || undefined}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClose}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Criando..." : "Criar Projeto"}
                </Button>
              </div>
            </form>
          </>
        )}

        {step === "standalone" && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => setStep("choose")}
                  className="h-8 w-8"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                  <DialogTitle>Nova Pasta Sem Projeto</DialogTitle>
                  <DialogDescription>
                    Crie uma pasta para organizar tarefas sem projeto (não será contada como projeto)
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <form onSubmit={(e) => handleSubmit(e, true)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome da Pasta *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Tarefas Gerais"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Descrição</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Descreva o propósito desta pasta..."
                  rows={4}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClose}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Criando..." : "Criar Pasta"}
                </Button>
              </div>
            </form>
          </>
        )}

        {step === "template" && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => setStep("choose")}
                  className="h-8 w-8"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                  <DialogTitle>Selecionar Modelo</DialogTitle>
                  <DialogDescription>
                    Escolha um modelo para criar seu projeto
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <div className="space-y-3 max-h-[300px] overflow-y-auto">
              {templates?.map((template) => (
                <Card 
                  key={template.id}
                  className={cn(
                    "cursor-pointer transition-colors",
                    selectedTemplate === template.id 
                      ? "border-primary bg-primary/5" 
                      : "hover:border-primary/50"
                  )}
                  onClick={() => setSelectedTemplate(template.id)}
                >
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium">{template.name}</h4>
                      {template.description && (
                        <p className="text-sm text-muted-foreground line-clamp-1">
                          {template.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {selectedTemplate === template.id && (
                        <Check className="h-5 w-5 text-primary" />
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          setTemplateToDelete(template.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
              >
                Cancelar
              </Button>
              <Button 
                onClick={handleCreateFromTemplate}
                disabled={!selectedTemplate || createFromTemplateMutation.isPending}
              >
                {createFromTemplateMutation.isPending ? "Criando..." : "Criar a partir do Modelo"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
};