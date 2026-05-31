import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { AppLayout } from "@/fluzz/components/layout/AppLayout";
import { Button } from "@/fluzz/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/fluzz/components/ui/card";
import { Badge } from "@/fluzz/components/ui/badge";
import { Textarea } from "@/fluzz/components/ui/textarea";
import { Label } from "@/fluzz/components/ui/label";
import { Input } from "@/fluzz/components/ui/input";
import { Checkbox } from "@/fluzz/components/ui/checkbox";
import { renderDocumentation } from "@/fluzz/lib/linkify";
import { ArrowLeft, Calendar, FileText, Edit2, Trash2, Plus, GripVertical, Save, Paperclip, Shield } from "lucide-react";
import { toast } from "sonner";
import { formatDateBR } from "@/fluzz/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/fluzz/components/ui/select";
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
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";
import { MemberDrawer } from "@/fluzz/components/tasks/MemberDrawer";
import { SectorDrawer } from "@/fluzz/components/tasks/SectorDrawer";
import { UserCircle, ChevronRight, Briefcase } from "lucide-react";
import { Avatar, AvatarFallback } from "@/fluzz/components/ui/avatar";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface SortableSubtaskProps {
  subtask: any;
  onToggle: (subtaskId: string, completed: boolean) => void;
  onDelete: (subtaskId: string) => void;
  onUpdate: (subtaskId: string, title: string) => void;
  isPending: boolean;
}

const SortableSubtask = ({ subtask, onToggle, onDelete, onUpdate, isPending }: SortableSubtaskProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(subtask.title);
  
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: subtask.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleSave = () => {
    if (editTitle.trim() && editTitle !== subtask.title) {
      onUpdate(subtask.id, editTitle.trim());
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      setEditTitle(subtask.title);
      setIsEditing(false);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 p-2 rounded hover:bg-muted/50 ${isDragging ? 'bg-muted/50' : ''}`}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing touch-none"
      >
        <GripVertical size={16} className="text-muted-foreground" />
      </button>
      <Checkbox
        checked={subtask.completed}
        onCheckedChange={(checked) => onToggle(subtask.id, !!checked)}
        disabled={isPending}
      />
      {isEditing ? (
        <input
          type="text"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          autoFocus
          className="flex-1 bg-transparent border-b border-primary outline-none px-1"
        />
      ) : (
        <span 
          className={`flex-1 cursor-pointer ${subtask.completed ? "line-through text-muted-foreground" : ""}`}
          onDoubleClick={() => {
            setEditTitle(subtask.title);
            setIsEditing(true);
          }}
        >
          {subtask.title}
        </span>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => onDelete(subtask.id)}
      >
        <Trash2 size={14} />
      </Button>
    </div>
  );
};

export default function RoutineTaskDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { workspace, isAdmin, isGestor } = useWorkspace();
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [newSubtask, setNewSubtask] = useState("");
  const canEdit = isAdmin || isGestor;

  // Inline editing states
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [editDescription, setEditDescription] = useState("");
  const [isEditingDocumentation, setIsEditingDocumentation] = useState(false);
  const [editDocumentation, setEditDocumentation] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const [editedTask, setEditedTask] = useState({
    title: "",
    description: "",
    priority: "",
    status: "",
    documentation: "",
    assigned_to: "",
    start_date: "",
    project_id: "",
    setor: "",
  });

  const { data: task, isLoading } = useQuery({
    queryKey: ["routine-task", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("routine_tasks")
        .select("*, projects(id, name), process_documentation(id, title), routines(id, name, position_id)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: subtasks, isLoading: subtasksLoading } = useQuery({
    queryKey: ["routine-task-subtasks", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("routine_task_subtasks")
        .select("*")
        .eq("routine_task_id", id!)
        .order("subtask_order");
      if (error) throw error;
      return data || [];
    },
    enabled: !!id,
  });

  const { data: sectorData } = useQuery({
    queryKey: ["position-name", task?.setor],
    queryFn: async () => {
      if (!task?.setor) return null;
      const { data, error } = await supabase
        .from("positions")
        .select("id, name")
        .eq("id", task.setor)
        .single();
      if (error) return null;
      return data;
    },
    enabled: !!task?.setor,
  });

  const { data: sectors } = useQuery({
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

  const { data: assignee } = useQuery({
    queryKey: ["profile", task?.assigned_to],
    queryFn: async () => {
      if (!task?.assigned_to) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("id", task.assigned_to)
        .single();
      if (error) return null;
      return data;
    },
    enabled: !!task?.assigned_to,
  });

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
    enabled: !!workspace && isEditing,
  });

  useEffect(() => {
    if (task) {
      setEditedTask({
        title: task.title || "",
        description: task.description || "",
        priority: task.priority || "medium",
        status: task.status || "todo",
        documentation: task.documentation || "",
        assigned_to: task.assigned_to || "",
        start_date: task.start_date || "",
        project_id: task.project_id || "",
        setor: task.setor || "",
      });
    }
  }, [task]);

  const updateTaskMutation = useMutation({
    mutationFn: async (updates: any) => {
      const { error } = await supabase
        .from("routine_tasks")
        .update(updates)
        .eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["routine-task", id] });
      queryClient.invalidateQueries({ queryKey: ["routine-tasks"] });
      setIsEditing(false);
      toast.success("Tarefa atualizada!");
    },
    onError: () => {
      toast.error("Erro ao atualizar tarefa");
    },
  });

  const inlineUpdateMutation = useMutation({
    mutationFn: async (updates: { title?: string; description?: string; documentation?: string }) => {
      const { error } = await supabase
        .from("routine_tasks")
        .update(updates)
        .eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["routine-task", id] });
      toast.success("Atualizado!");
    },
    onError: () => {
      toast.error("Erro ao atualizar");
    }
  });

  const quickStatusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      const { error } = await supabase
        .from("routine_tasks")
        .update({ status: newStatus })
        .eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["routine-task", id] });
      toast.success("Status atualizado!");
    },
    onError: () => {
      toast.error("Erro ao atualizar status");
    }
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("routine_tasks")
        .delete()
        .eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tarefa excluída!");
      navigate(-1);
    },
    onError: () => {
      toast.error("Erro ao excluir tarefa");
    },
  });

  // Subtask mutations
  const addSubtaskMutation = useMutation({
    mutationFn: async (title: string) => {
      const maxOrder = subtasks?.length || 0;
      const { error } = await supabase
        .from("routine_task_subtasks")
        .insert({
          routine_task_id: id!,
          title,
          subtask_order: maxOrder,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["routine-task-subtasks", id] });
      setNewSubtask("");
    },
    onError: () => {
      toast.error("Erro ao adicionar subtarefa");
    },
  });

  const toggleSubtaskMutation = useMutation({
    mutationFn: async ({ subtaskId, completed }: { subtaskId: string; completed: boolean }) => {
      const { error } = await supabase
        .from("routine_task_subtasks")
        .update({ completed })
        .eq("id", subtaskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["routine-task-subtasks", id] });
    },
    onError: () => {
      toast.error("Erro ao atualizar subtarefa");
    },
  });

  const updateSubtaskMutation = useMutation({
    mutationFn: async ({ subtaskId, title }: { subtaskId: string; title: string }) => {
      const { error } = await supabase
        .from("routine_task_subtasks")
        .update({ title })
        .eq("id", subtaskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["routine-task-subtasks", id] });
    },
    onError: () => {
      toast.error("Erro ao atualizar subtarefa");
    },
  });

  const deleteSubtaskMutation = useMutation({
    mutationFn: async (subtaskId: string) => {
      const { error } = await supabase
        .from("routine_task_subtasks")
        .delete()
        .eq("id", subtaskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["routine-task-subtasks", id] });
    },
    onError: () => {
      toast.error("Erro ao excluir subtarefa");
    },
  });

  const reorderSubtasksMutation = useMutation({
    mutationFn: async (reorderedSubtasks: any[]) => {
      for (let i = 0; i < reorderedSubtasks.length; i++) {
        const { error } = await supabase
          .from("routine_task_subtasks")
          .update({ subtask_order: i })
          .eq("id", reorderedSubtasks[i].id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["routine-task-subtasks", id] });
    },
    onError: () => {
      toast.error("Erro ao reordenar subtarefas");
    },
  });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !subtasks) return;

    const oldIndex = subtasks.findIndex((s) => s.id === active.id);
    const newIndex = subtasks.findIndex((s) => s.id === over.id);
    
    const reordered = arrayMove(subtasks, oldIndex, newIndex);
    reorderSubtasksMutation.mutate(reordered);
  };

  const handleAddSubtask = () => {
    if (newSubtask.trim()) {
      addSubtaskMutation.mutate(newSubtask.trim());
    }
  };

  const handleSave = () => {
    updateTaskMutation.mutate({
      ...editedTask,
      project_id: editedTask.project_id || null,
      assigned_to: editedTask.assigned_to || null,
      start_date: editedTask.start_date || null,
      setor: editedTask.setor || null,
    });
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

  if (!task) {
    return (
      <AppLayout>
        <div className="text-center py-16">
          <p className="text-muted-foreground">Tarefa não encontrada</p>
          <Button onClick={() => navigate(-1)} className="mt-4">Voltar</Button>
        </div>
      </AppLayout>
    );
  }

  const priorityColors = {
    high: "destructive",
    medium: "default",
    low: "secondary",
  };

  const completedSubtasks = subtasks?.filter(s => s.completed).length || 0;
  const totalSubtasks = subtasks?.length || 0;

  return (
    <AppLayout>
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem certeza?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza de que deseja excluir a tarefa '{task?.title}'? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTaskMutation.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
          <div className="flex items-start gap-2 sm:gap-4 flex-1 min-w-0">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="flex-shrink-0 mt-1">
              <ArrowLeft size={20} />
            </Button>
            <div className="flex-1 min-w-0">
              {isEditing ? (
                <Input
                  value={editedTask.title}
                  onChange={(e) => setEditedTask({ ...editedTask, title: e.target.value })}
                  className="text-xl sm:text-2xl md:text-3xl font-bold h-auto py-2"
                />
              ) : isEditingTitle ? (
                <Input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onBlur={() => {
                    if (editTitle.trim() && editTitle !== task.title) {
                      inlineUpdateMutation.mutate({ title: editTitle.trim() });
                    }
                    setIsEditingTitle(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      if (editTitle.trim() && editTitle !== task.title) {
                        inlineUpdateMutation.mutate({ title: editTitle.trim() });
                      }
                      setIsEditingTitle(false);
                    } else if (e.key === "Escape") {
                      setEditTitle(task.title);
                      setIsEditingTitle(false);
                    }
                  }}
                  autoFocus
                  className="text-xl sm:text-2xl md:text-3xl font-bold h-auto py-2"
                />
              ) : (
                <h1 
                  className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1 break-words"
                  onDoubleClick={() => {
                    setEditTitle(task.title);
                    setIsEditingTitle(true);
                  }}
                >
                  {task.title}
                </h1>
              )}
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                Rotina: {task.routines?.name}
              </p>
            </div>
          </div>
          {canEdit && (
            <div className="flex gap-2 w-full sm:w-auto">
              {isEditing ? (
                <>
                  <Button onClick={handleSave} disabled={updateTaskMutation.isPending} size="sm" className="flex-1 sm:flex-initial">
                    <Save size={14} className="mr-1 sm:mr-2" />
                    <span>Salvar</span>
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1 sm:flex-initial" onClick={() => {
                    setIsEditing(false);
                    setEditedTask({
                      title: task.title || "",
                      description: task.description || "",
                      priority: task.priority || "medium",
                      status: task.status || "todo",
                      documentation: task.documentation || "",
                      assigned_to: task.assigned_to || "",
                      start_date: task.start_date || "",
                      project_id: task.project_id || "",
                      setor: task.setor || "",
                    });
                  }}>
                    Cancelar
                  </Button>
                </>
              ) : (
                <>
                  <Button onClick={() => setIsEditing(true)} size="sm" className="flex-1 sm:flex-initial">
                    <Edit2 size={14} className="mr-1 sm:mr-2" />
                    <span className="hidden sm:inline">Editar</span>
                    <span className="sm:hidden">Editar</span>
                  </Button>
                  <Button variant="destructive" size="icon" onClick={() => setShowDeleteDialog(true)} className="h-8 w-8 sm:h-9 sm:w-9">
                    <Trash2 size={14} />
                  </Button>
                </>
              )}
            </div>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Detalhes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Descrição */}
                <div>
                  <Label>Descrição</Label>
                  {isEditing ? (
                    <Textarea
                      value={editedTask.description}
                      onChange={(e) => setEditedTask({ ...editedTask, description: e.target.value })}
                      placeholder="Adicione uma descrição..."
                      className="mt-2 min-h-[100px] resize-y"
                    />
                  ) : isEditingDescription ? (
                    <Textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      onBlur={() => {
                        if (editDescription !== task.description) {
                          inlineUpdateMutation.mutate({ description: editDescription });
                        }
                        setIsEditingDescription(false);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          setEditDescription(task.description || "");
                          setIsEditingDescription(false);
                        }
                      }}
                      autoFocus
                      placeholder="Adicione uma descrição..."
                      className="mt-2 min-h-[100px] resize-y"
                    />
                  ) : (
                    <p 
                      className="text-muted-foreground mt-2 cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1 py-1 whitespace-pre-wrap"
                      onDoubleClick={() => {
                        setEditDescription(task.description || "");
                        setIsEditingDescription(true);
                      }}
                    >
                      {task.description || "Sem descrição (duplo clique para editar)"}
                    </p>
                  )}
                </div>

                {/* Setor */}
                <div>
                  <Label>Setor</Label>
                  {isEditing ? (
                    <SectorDrawer 
                      value={editedTask.setor} 
                      onValueChange={(value) => setEditedTask({ ...editedTask, setor: value, assigned_to: "" })}
                    >
                      <Button variant="outline" className="w-full justify-between mt-2" type="button">
                        <span className="flex items-center gap-2">
                          <Briefcase size={16} />
                          {editedTask.setor ? (sectors?.find(s => s.id === editedTask.setor)?.name || editedTask.setor) : "Selecione um setor"}
                        </span>
                        <ChevronRight size={16} />
                      </Button>
                    </SectorDrawer>
                  ) : (
                    <p className="text-muted-foreground mt-2">
                      {sectorData?.name || "Sem setor definido"}
                    </p>
                  )}
                </div>

                {/* Responsável */}
                <div>
                  <Label>Responsável</Label>
                  {isEditing ? (
                    <MemberDrawer 
                      value={editedTask.assigned_to} 
                      onValueChange={(value) => setEditedTask({ ...editedTask, assigned_to: value })}
                      positionId={editedTask.setor || undefined}
                    >
                      <Button variant="outline" className="w-full justify-between mt-2" type="button">
                        <span className="flex items-center gap-2">
                          <UserCircle size={16} />
                          {editedTask.assigned_to && workspaceMembers?.find(m => m.user_id === editedTask.assigned_to)?.profiles?.full_name || "Selecione um responsável"}
                        </span>
                        <ChevronRight size={16} />
                      </Button>
                    </MemberDrawer>
                  ) : (
                    <div className="mt-2">
                      {assignee ? (
                        <div className="flex items-center gap-2 bg-muted/50 rounded-full pl-1 pr-2 py-1 w-fit">
                          <Avatar className="h-6 w-6">
                            <AvatarFallback className="bg-primary/10 text-primary text-xs">
                              {assignee.full_name?.charAt(0).toUpperCase() || "?"}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm">{assignee.full_name}</span>
                        </div>
                      ) : (
                        <p className="text-muted-foreground">Sem responsável</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Prioridade */}
                <div>
                  <Label>Prioridade</Label>
                  {isEditing ? (
                    <Select
                      value={editedTask.priority}
                      onValueChange={(value) => setEditedTask({ ...editedTask, priority: value })}
                    >
                      <SelectTrigger className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Baixa</SelectItem>
                        <SelectItem value="medium">Média</SelectItem>
                        <SelectItem value="high">Alta</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="mt-2">
                      <Badge variant={priorityColors[task.priority as keyof typeof priorityColors] as any}>
                        {task.priority === "high" ? "Alta" : task.priority === "medium" ? "Média" : "Baixa"}
                      </Badge>
                    </div>
                  )}
                </div>

                {/* Status */}
                <div>
                  <Label>Status</Label>
                  <Select
                    value={isEditing ? editedTask.status : task.status}
                    onValueChange={(value) => {
                      if (isEditing) {
                        setEditedTask({ ...editedTask, status: value });
                      } else {
                        quickStatusMutation.mutate(value);
                      }
                    }}
                    disabled={quickStatusMutation.isPending}
                  >
                    <SelectTrigger className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todo">A fazer</SelectItem>
                      <SelectItem value="in_progress">Fazendo</SelectItem>
                      <SelectItem value="completed">Feito</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Aprovação (info only - routine tasks don't have approval) */}
                <div className="border-t pt-4 mt-4">
                  <Label className="flex items-center gap-2 mb-3">
                    <Shield size={16} />
                    Aprovação
                  </Label>
                  <p className="text-muted-foreground text-sm">Esta tarefa não requer aprovação</p>
                </div>

                {/* Data de Início */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Data de Início</Label>
                    {isEditing ? (
                      <Input
                        type="date"
                        value={editedTask.start_date}
                        onChange={(e) => setEditedTask({ ...editedTask, start_date: e.target.value })}
                        className="mt-2"
                      />
                    ) : (
                      <div className="mt-2">
                        {task.start_date ? (
                          <Badge variant="secondary">
                            <Calendar size={12} className="mr-1" />
                            {formatDateBR(task.start_date)}
                          </Badge>
                        ) : (
                          <p className="text-muted-foreground text-sm">Não definida</p>
                        )}
                      </div>
                    )}
                  </div>
                  
                  <div>
                    <Label>Data de Fim (Prazo)</Label>
                    <div className="mt-2">
                      <p className="text-muted-foreground text-sm">Não aplicável</p>
                    </div>
                  </div>
                </div>

                {/* Documentação */}
                <div>
                  <Label className="flex items-center gap-2">
                    <FileText size={16} />
                    Documentação
                  </Label>
                  {isEditing ? (
                    <Textarea
                      value={editedTask.documentation}
                      onChange={(e) => setEditedTask({ ...editedTask, documentation: e.target.value })}
                      placeholder="Adicione documentação adicional..."
                      className="mt-2 min-h-[120px] resize-y"
                    />
                  ) : isEditingDocumentation ? (
                    <Textarea
                      value={editDocumentation}
                      onChange={(e) => setEditDocumentation(e.target.value)}
                      onBlur={() => {
                        if (editDocumentation !== task.documentation) {
                          inlineUpdateMutation.mutate({ documentation: editDocumentation });
                        }
                        setIsEditingDocumentation(false);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          setEditDocumentation(task.documentation || "");
                          setIsEditingDocumentation(false);
                        }
                      }}
                      autoFocus
                      placeholder="Adicione documentação adicional..."
                      className="mt-2 min-h-[120px] resize-y"
                    />
                  ) : (
                    <div 
                      className="text-sm text-foreground p-3 bg-muted/50 rounded mt-2 whitespace-pre-wrap cursor-pointer hover:bg-muted/70"
                      onDoubleClick={() => {
                        setEditDocumentation(task.documentation || "");
                        setIsEditingDocumentation(true);
                      }}
                    >
                      {task.documentation ? renderDocumentation(task.documentation) : <span className="text-muted-foreground">Sem documentação (duplo clique para editar)</span>}
                    </div>
                  )}
                </div>

                {/* Arquivos Anexados (info only) */}
                <div>
                  <Label className="flex items-center gap-2">
                    <Paperclip size={16} />
                    Arquivos Anexados
                  </Label>
                  <div className="mt-2">
                    <p className="text-muted-foreground text-sm">Nenhum arquivo anexado.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Subtarefas Card */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Subtarefas</CardTitle>
                  <Badge variant="secondary">
                    {completedSubtasks} de {totalSubtasks}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Subtasks list */}
                {subtasksLoading ? (
                  <div className="text-center py-4">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" />
                  </div>
                ) : subtasks && subtasks.length > 0 ? (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={subtasks.map(s => s.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {subtasks.map((subtask) => (
                        <SortableSubtask
                          key={subtask.id}
                          subtask={subtask}
                          onToggle={(subtaskId, completed) => 
                            toggleSubtaskMutation.mutate({ subtaskId, completed })
                          }
                          onDelete={(subtaskId) => deleteSubtaskMutation.mutate(subtaskId)}
                          onUpdate={(subtaskId, title) => 
                            updateSubtaskMutation.mutate({ subtaskId, title })
                          }
                          isPending={toggleSubtaskMutation.isPending}
                        />
                      ))}
                    </SortableContext>
                  </DndContext>
                ) : null}

                {/* Add subtask input */}
                <div className="flex gap-2 pt-2">
                  <Input
                    placeholder="Nova subtarefa..."
                    value={newSubtask}
                    onChange={(e) => setNewSubtask(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === "Enter" && newSubtask.trim()) {
                        handleAddSubtask();
                      }
                    }}
                  />
                  <Button
                    onClick={handleAddSubtask}
                    disabled={!newSubtask.trim() || addSubtaskMutation.isPending}
                  >
                    <Plus size={16} />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {task.projects && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Projeto Vinculado</CardTitle>
                </CardHeader>
                <CardContent>
                  <Badge variant="secondary">{task.projects.name}</Badge>
                </CardContent>
              </Card>
            )}
            {task.process_documentation && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">POP Vinculado</CardTitle>
                </CardHeader>
                <CardContent>
                  <Badge variant="secondary" className="gap-1">
                    <FileText className="h-3 w-3" />
                    {task.process_documentation.title}
                  </Badge>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
