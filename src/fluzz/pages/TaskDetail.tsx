import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { AppLayout } from "@/fluzz/components/layout/AppLayout";
import { Button } from "@/fluzz/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/fluzz/components/ui/card";
import { Badge } from "@/fluzz/components/ui/badge";
import { Checkbox } from "@/fluzz/components/ui/checkbox";
import { Textarea } from "@/fluzz/components/ui/textarea";
import { Label } from "@/fluzz/components/ui/label";
import { Switch } from "@/fluzz/components/ui/switch";
import { renderDocumentation } from "@/fluzz/lib/linkify";
import { 
  ArrowLeft, 
  Calendar, 
  User, 
  FileText, 
  Plus,
  Trash2,
  Save,
  LinkIcon,
  Edit2,
  GripVertical,
  Paperclip,
  History,
  ChevronDown,
  RefreshCcw
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/fluzz/components/ui/collapsible";
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
import { formatDateBR, isTaskOverdue, isTaskDueSoon } from "@/fluzz/lib/utils";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/fluzz/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Input } from "@/fluzz/components/ui/input";
import { SectorDrawer } from "@/fluzz/components/tasks/SectorDrawer";
import { MemberDrawer } from "@/fluzz/components/tasks/MemberDrawer";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";
import { useAuth } from "@/fluzz/contexts/AuthContext";
import { Briefcase, UserCircle, ChevronRight, Shield, CheckCircle, XCircle } from "lucide-react";
import { TaskAttachments } from "@/fluzz/components/tasks/TaskAttachments";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/fluzz/components/ui/sheet";
import { MultiAssigneeAvatars } from "@/fluzz/components/tasks/MultiAssigneeAvatars";
import { Avatar, AvatarFallback, AvatarImage } from "@/fluzz/components/ui/avatar";
import { X } from "lucide-react";

// Approval Status Badge Component
const ApprovalStatusBadge = ({ status }: { status: string | null }) => {
  if (status === 'approved') {
    return (
      <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200 border-emerald-300">
        <CheckCircle size={12} className="mr-1" />
        Aprovada
      </Badge>
    );
  }
  if (status === 'rejected') {
    return (
      <Badge className="bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200 border-rose-300">
        <XCircle size={12} className="mr-1" />
        Ajuste Solicitado
      </Badge>
    );
  }
  return (
    <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200 border-amber-300">
      <Shield size={12} className="mr-1" />
      Validação Pendente
    </Badge>
  );
};

// Approval Section Component
const ApprovalSection = ({ 
  task, 
  workspaceMembers, 
  currentUserId,
  onApprove,
  onResubmit
}: { 
  task: any; 
  workspaceMembers: any[] | undefined;
  currentUserId: string | undefined;
  onApprove: (status: string, notes?: string) => void;
  onResubmit: (notes?: string) => void;
}) => {
  const [showApprovalActions, setShowApprovalActions] = useState(false);
  const [showResubmitForm, setShowResubmitForm] = useState(false);
  const [approvalNotes, setApprovalNotes] = useState("");
  const [resubmitNotes, setResubmitNotes] = useState("");
  
  const isReviewer = currentUserId === task.approval_reviewer_id;
  const isAssignee = currentUserId === task.assigned_to;
  const approvalStatus = task.approval_status || 'pending';
  const canReview = isReviewer;
  const canResubmit = isAssignee && approvalStatus === 'rejected';
  
  const reviewerName = workspaceMembers?.find(m => m.user_id === task.approval_reviewer_id)?.profiles?.full_name || "Não definido";
  
  // Extract validation history from documentation
  const extractValidationHistory = () => {
    if (!task.documentation) return [];
    const historyMatch = task.documentation.match(/--- HISTÓRICO DE VALIDAÇÃO ---\n([\s\S]*?)(?:--- FIM DO HISTÓRICO ---|$)/);
    if (!historyMatch) return [];
    
    const historyText = historyMatch[1];
    const entries: { type: string; date: string; notes: string }[] = [];
    
    const regex = /\[(\d{2}\/\d{2}\/\d{4} \d{2}:\d{2})\] (AJUSTE SOLICITADO|REENVIADO PARA VALIDAÇÃO|APROVADO)(?::\n([\s\S]*?))?(?=\n\[|\n--- FIM|$)/g;
    let match;
    while ((match = regex.exec(historyText)) !== null) {
      entries.push({
        date: match[1],
        type: match[2],
        notes: match[3]?.trim() || ''
      });
    }
    return entries;
  };
  
  const validationHistory = extractValidationHistory();
  const lastRejectionNotes = validationHistory.filter(h => h.type === 'AJUSTE SOLICITADO').pop()?.notes;
  
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <ApprovalStatusBadge status={approvalStatus} />
      </div>
      
      <p className="text-sm text-muted-foreground">
        Revisor: {reviewerName}
      </p>
      
      {/* Show message for rejected status with last rejection notes */}
      {approvalStatus === 'rejected' && (
        <div className="p-3 rounded-md bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 space-y-2">
          <p className="text-sm text-rose-800 dark:text-rose-200 font-medium">
            Ajustes solicitados pelo revisor
          </p>
          {lastRejectionNotes && (
            <p className="text-sm text-rose-700 dark:text-rose-300 whitespace-pre-wrap">
              {lastRejectionNotes}
            </p>
          )}
        </div>
      )}
      
      {/* Show message for approved status */}
      {approvalStatus === 'approved' && (
        <div className="p-3 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
          <p className="text-sm text-emerald-800 dark:text-emerald-200 font-medium">
            {isReviewer ? "Você aprovou esta tarefa." : "Esta tarefa foi aprovada pelo revisor."}
          </p>
        </div>
      )}
      
      {/* Show validation history */}
      {validationHistory.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-between text-muted-foreground">
              <span className="flex items-center gap-2">
                <History size={14} />
                Histórico de Validação ({validationHistory.length})
              </span>
              <ChevronDown size={14} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 mt-2">
            {validationHistory.map((entry, idx) => (
              <div 
                key={idx} 
                className={`p-2 rounded text-xs border ${
                  entry.type === 'APROVADO' 
                    ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800' 
                    : entry.type === 'AJUSTE SOLICITADO'
                    ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800'
                    : 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800'
                }`}
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="font-medium">
                    {entry.type === 'APROVADO' && 'Aprovado'}
                    {entry.type === 'AJUSTE SOLICITADO' && 'Ajuste Solicitado'}
                    {entry.type === 'REENVIADO PARA VALIDAÇÃO' && 'Reenviado para Validação'}
                  </span>
                  <span className="text-muted-foreground">{entry.date}</span>
                </div>
                {entry.notes && <p className="whitespace-pre-wrap">{entry.notes}</p>}
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}
      
      {/* Show resubmit button for assignee when rejected */}
      {canResubmit && !showResubmitForm && (
        <div className="pt-2 border-t">
          <Button 
            variant="default" 
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white"
            onClick={() => setShowResubmitForm(true)}
          >
            <RefreshCcw size={14} className="mr-1" />
            Reenviar para Validação
          </Button>
        </div>
      )}
      
      {/* Resubmit form */}
      {canResubmit && showResubmitForm && (
        <div className="space-y-2 pt-2 border-t">
          <Textarea
            placeholder="Descreva os ajustes realizados (opcional)..."
            value={resubmitNotes}
            onChange={(e) => setResubmitNotes(e.target.value)}
            className="min-h-[80px]"
          />
          <div className="flex gap-2">
            <Button 
              variant="default" 
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => {
                onResubmit(resubmitNotes);
                setShowResubmitForm(false);
                setResubmitNotes("");
              }}
            >
              Enviar para Validação
            </Button>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => {
                setShowResubmitForm(false);
                setResubmitNotes("");
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}
      
      {/* Show approval buttons for reviewer */}
      {canReview && approvalStatus !== 'approved' && (
        <div className="space-y-3 pt-2 border-t">
          {!showApprovalActions ? (
            <div className="flex gap-2">
              <Button 
                variant="default" 
                size="sm" 
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => onApprove('approved')}
              >
                <CheckCircle size={14} className="mr-1" />
                Aprovar
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                className="border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-300 dark:hover:bg-rose-950/30"
                onClick={() => setShowApprovalActions(true)}
              >
                <XCircle size={14} className="mr-1" />
                Solicitar Ajuste
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Textarea
                placeholder="Descreva o que precisa ser ajustado..."
                value={approvalNotes}
                onChange={(e) => setApprovalNotes(e.target.value)}
                className="min-h-[80px]"
              />
              <div className="flex gap-2">
                <Button 
                  variant="destructive" 
                  size="sm"
                  onClick={() => {
                    onApprove('rejected', approvalNotes);
                    setShowApprovalActions(false);
                    setApprovalNotes("");
                  }}
                >
                  Enviar Solicitação de Ajuste
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => {
                    setShowApprovalActions(false);
                    setApprovalNotes("");
                  }}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Show button for reviewer to change approved status */}
      {canReview && approvalStatus === 'approved' && (
        <div className="pt-2 border-t">
          <Button 
            variant="outline" 
            size="sm"
            className="border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-950/30"
            onClick={() => setShowApprovalActions(true)}
          >
            <XCircle size={14} className="mr-1" />
            Revogar Aprovação
          </Button>
          
          {showApprovalActions && (
            <div className="space-y-2 mt-2">
              <Textarea
                placeholder="Descreva o que precisa ser ajustado..."
                value={approvalNotes}
                onChange={(e) => setApprovalNotes(e.target.value)}
                className="min-h-[80px]"
              />
              <div className="flex gap-2">
                <Button 
                  variant="destructive" 
                  size="sm"
                  onClick={() => {
                    onApprove('rejected', approvalNotes);
                    setShowApprovalActions(false);
                    setApprovalNotes("");
                  }}
                >
                  Solicitar Ajustes
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => {
                    setShowApprovalActions(false);
                    setApprovalNotes("");
                  }}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface SortableSubtaskProps {
  subtask: any;
  onToggle: (subtaskId: string, completed: boolean) => void;
  onDelete: (subtask: { id: string; title: string }) => void;
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
        onClick={() => onDelete({ id: subtask.id, title: subtask.title })}
      >
        <Trash2 size={14} />
      </Button>
    </div>
  );
};

export default function TaskDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const { user } = useAuth();
  const [newSubtask, setNewSubtask] = useState("");
  const [isAddingProcess, setIsAddingProcess] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [subtaskToDelete, setSubtaskToDelete] = useState<{ id: string; title: string } | null>(null);
  
  // Inline editing states
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [editDescription, setEditDescription] = useState("");
  const [isEditingProject, setIsEditingProject] = useState(false);
  const [isEditingDocumentation, setIsEditingDocumentation] = useState(false);
  const [editDocumentation, setEditDocumentation] = useState("");
  
  const [editedTask, setEditedTask] = useState({
    title: "",
    description: "",
    priority: "",
    status: "",
    setor: "",
    start_date: "",
    due_date: "",
    documentation: "",
    assigned_to: "",
    requires_approval: false,
    approval_reviewer_id: "" as string | null,
    approval_status: null as string | null
  });
  
  const [showReviewerSheet, setShowReviewerSheet] = useState(false);

  const { data: task, isLoading } = useQuery({
    queryKey: ["task", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*, projects(name), subtasks(*)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: taskProcesses } = useQuery({
    queryKey: ["task-processes", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_processes")
        .select("*, process_documentation(id, title, area)")
        .eq("task_id", id!);
      if (error) throw error;
      return data;
    },
  });

  // Query para buscar os responsáveis da tarefa
  const { data: taskAssignees } = useQuery({
    queryKey: ["task-assignees", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_assignees")
        .select("user_id")
        .eq("task_id", id!);
      if (error) throw error;
      return data || [];
    },
    enabled: !!id,
  });

  useEffect(() => {
    if (task) {
      setEditedTask({
        title: task.title || "",
        description: task.description || "",
        priority: task.priority || "medium",
        status: task.status || "todo",
        setor: task.setor || "",
        start_date: task.start_date || "",
        due_date: task.due_date || "",
        documentation: task.documentation || "",
        assigned_to: task.assigned_to || "",
        requires_approval: task.requires_approval || false,
        approval_reviewer_id: task.approval_reviewer_id || null,
        approval_status: task.approval_status || null
      });
    }
  }, [task]);

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

  const { data: workspaceProjects } = useQuery({
    queryKey: ["workspace-projects", workspace?.id],
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
    enabled: !!workspace,
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const addSubtaskMutation = useMutation({
    mutationFn: async (title: string) => {
      const maxOrder = task?.subtasks?.reduce((max: number, s: any) => 
        Math.max(max, s.subtask_order || 0), 0) || 0;
      const { error } = await supabase
        .from("subtasks")
        .insert([{ task_id: id!, title, subtask_order: maxOrder + 1 }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task", id] });
      setNewSubtask("");
      toast.success("Subtarefa adicionada!");
    },
  });

  const reorderSubtasksMutation = useMutation({
    mutationFn: async (reorderedSubtasks: { id: string; subtask_order: number }[]) => {
      const updates = reorderedSubtasks.map((s) =>
        supabase.from("subtasks").update({ subtask_order: s.subtask_order }).eq("id", s.id)
      );
      await Promise.all(updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task", id] });
    },
  });

  const toggleSubtaskMutation = useMutation({
    mutationFn: async ({ subtaskId, completed }: { subtaskId: string; completed: boolean }) => {
      const { error } = await supabase
        .from("subtasks")
        .update({ completed })
        .eq("id", subtaskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task", id] });
    },
  });

  const updateSubtaskMutation = useMutation({
    mutationFn: async ({ subtaskId, title }: { subtaskId: string; title: string }) => {
      const { error } = await supabase
        .from("subtasks")
        .update({ title })
        .eq("id", subtaskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task", id] });
      toast.success("Subtarefa atualizada!");
    },
  });

  const deleteSubtaskMutation = useMutation({
    mutationFn: async (subtaskId: string) => {
      const { error } = await supabase
        .from("subtasks")
        .delete()
        .eq("id", subtaskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task", id] });
      setSubtaskToDelete(null);
      toast.success("Subtarefa removida!");
    },
  });

  const linkProcessMutation = useMutation({
    mutationFn: async (processId: string) => {
      const { error } = await supabase
        .from("task_processes")
        .insert([{ task_id: id!, process_id: processId }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-processes", id] });
      setIsAddingProcess(false);
      toast.success("POP vinculado!");
    },
  });

  const unlinkProcessMutation = useMutation({
    mutationFn: async (taskProcessId: string) => {
      const { error } = await supabase
        .from("task_processes")
        .delete()
        .eq("id", taskProcessId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-processes", id] });
      toast.success("POP desvinculado!");
    },
  });

  // Mutation para adicionar responsável
  const addAssigneeMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("task_assignees")
        .insert([{ task_id: id!, user_id: userId }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-assignees", id] });
      toast.success("Responsável adicionado!");
    },
    onError: () => {
      toast.error("Erro ao adicionar responsável");
    }
  });

  // Mutation para remover responsável
  const removeAssigneeMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("task_assignees")
        .delete()
        .eq("task_id", id!)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-assignees", id] });
      toast.success("Responsável removido!");
    },
    onError: () => {
      toast.error("Erro ao remover responsável");
    }
  });

  const updateTaskMutation = useMutation({
    mutationFn: async (updates: any) => {
      const { error } = await supabase
        .from("tasks")
        .update(updates)
        .eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task", id] });
      setIsEditing(false);
      toast.success("Tarefa atualizada!");
    },
    onError: (error: any) => {
      console.error("Error updating task:", error);
      toast.error("Erro ao atualizar tarefa: " + (error?.message || "Erro desconhecido"));
    }
  });

  const quickStatusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      const { error } = await supabase
        .from("tasks")
        .update({ status: newStatus })
        .eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task", id] });
      toast.success("Status atualizado!");
    },
    onError: () => {
      toast.error("Erro ao atualizar status");
    }
  });

  const inlineUpdateMutation = useMutation({
    mutationFn: async (updates: { title?: string; description?: string; documentation?: string; project_id?: string | null }) => {
      const { error } = await supabase
        .from("tasks")
        .update(updates)
        .eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task", id] });
      toast.success("Atualizado!");
    },
    onError: () => {
      toast.error("Erro ao atualizar");
    }
  });

  const approvalMutation = useMutation({
    mutationFn: async ({ approval_status, notes }: { approval_status: string; notes?: string }) => {
      const now = new Date();
      const dateStr = `${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
      
      const currentDoc = task?.documentation || '';
      const hasHistory = currentDoc.includes('--- HISTÓRICO DE VALIDAÇÃO ---');
      
      let newHistory = '';
      const statusLabel = approval_status === 'approved' ? 'APROVADO' : 'AJUSTE SOLICITADO';
      const historyEntry = notes 
        ? `[${dateStr}] ${statusLabel}:\n${notes}`
        : `[${dateStr}] ${statusLabel}`;
      
      if (hasHistory) {
        // Insert before --- FIM DO HISTÓRICO ---
        newHistory = currentDoc.replace(
          '--- FIM DO HISTÓRICO ---',
          `${historyEntry}\n\n--- FIM DO HISTÓRICO ---`
        );
      } else {
        // Create new history section
        newHistory = currentDoc 
          ? `${currentDoc}\n\n--- HISTÓRICO DE VALIDAÇÃO ---\n${historyEntry}\n\n--- FIM DO HISTÓRICO ---`
          : `--- HISTÓRICO DE VALIDAÇÃO ---\n${historyEntry}\n\n--- FIM DO HISTÓRICO ---`;
      }
      
      const { error } = await supabase
        .from("tasks")
        .update({ approval_status, documentation: newHistory })
        .eq("id", id!);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["task", id] });
      queryClient.invalidateQueries({ queryKey: ["my-tasks"] });
      if (variables.approval_status === 'approved') {
        toast.success("Tarefa aprovada!");
      } else {
        toast.success("Ajuste solicitado!");
      }
    },
    onError: (error: any) => {
      console.error("Error updating approval status:", error);
      toast.error("Erro ao atualizar status de aprovação");
    }
  });

  const resubmitMutation = useMutation({
    mutationFn: async ({ notes }: { notes?: string }) => {
      const now = new Date();
      const dateStr = `${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
      
      const currentDoc = task?.documentation || '';
      const historyEntry = notes 
        ? `[${dateStr}] REENVIADO PARA VALIDAÇÃO:\n${notes}`
        : `[${dateStr}] REENVIADO PARA VALIDAÇÃO`;
      
      // Insert before --- FIM DO HISTÓRICO ---
      const newHistory = currentDoc.replace(
        '--- FIM DO HISTÓRICO ---',
        `${historyEntry}\n\n--- FIM DO HISTÓRICO ---`
      );
      
      const { error } = await supabase
        .from("tasks")
        .update({ approval_status: 'pending', documentation: newHistory })
        .eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task", id] });
      queryClient.invalidateQueries({ queryKey: ["my-tasks"] });
      toast.success("Tarefa reenviada para validação!");
    },
    onError: (error: any) => {
      console.error("Error resubmitting task:", error);
      toast.error("Erro ao reenviar para validação");
    }
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("tasks")
        .delete()
        .eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tarefa excluída!");
      navigate(`/tools/wizzy-flow/projects/${task?.project_id}`);
    },
    onError: () => {
      toast.error("Erro ao excluir tarefa");
    }
  });

  const handleSave = () => {
    const updates = {
      ...editedTask,
      start_date: editedTask.start_date || null,
      due_date: editedTask.due_date || null,
      setor: editedTask.setor || null,
      assigned_to: editedTask.assigned_to || null,
      approval_reviewer_id: editedTask.requires_approval ? editedTask.approval_reviewer_id : null,
      approval_status: editedTask.requires_approval ? (editedTask.approval_status || 'pending') : null,
    };
    updateTaskMutation.mutate(updates);
  };

  const handleDelete = () => {
    deleteTaskMutation.mutate();
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
        </div>
      </AppLayout>
    );
  }

  const priorityColors = {
    high: "destructive",
    medium: "default",
    low: "secondary",
  };

  const statusLabels = {
    todo: "A fazer",
    in_progress: "Fazendo",
    completed: "Feito",
  };

  const isOverdue = isTaskOverdue(task.due_date, task.status);
  const isDueSoon = isTaskDueSoon(task.due_date, task.status);

  return (
    <AppLayout>
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem certeza?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza de que deseja excluir a tarefa '{task?.title}' e todas as suas subtarefas? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="space-y-4 sm:space-y-6">
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
              {isEditingProject ? (
                <Select
                  value={task.project_id || "none"}
                  onValueChange={(value) => {
                    const projectId = value === "none" ? null : value;
                    inlineUpdateMutation.mutate({ project_id: projectId });
                    setIsEditingProject(false);
                  }}
                  open={isEditingProject}
                  onOpenChange={setIsEditingProject}
                >
                  <SelectTrigger className="w-auto h-auto py-1 text-xs sm:text-sm text-muted-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem projeto</SelectItem>
                    {workspaceProjects?.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p 
                  className="text-xs sm:text-sm text-muted-foreground mt-1 cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1"
                  onDoubleClick={() => setIsEditingProject(true)}
                >
                  Projeto: {task.projects?.name || "Sem projeto"}
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            {isEditing ? (
              <>
                <Button onClick={handleSave} disabled={updateTaskMutation.isPending} size="sm" className="flex-1 sm:flex-initial">
                  <Save size={14} className="mr-1 sm:mr-2" />
                  <span className="hidden sm:inline">Salvar</span>
                  <span className="sm:hidden">Salvar</span>
                </Button>
                <Button variant="outline" size="sm" className="flex-1 sm:flex-initial" onClick={() => {
                  setIsEditing(false);
                  setEditedTask({
                    title: task.title || "",
                    description: task.description || "",
                    priority: task.priority || "medium",
                    status: task.status || "todo",
                    setor: task.setor || "",
                    start_date: task.start_date || "",
                    due_date: task.due_date || "",
                    documentation: task.documentation || "",
                    assigned_to: task.assigned_to || "",
                    requires_approval: task.requires_approval || false,
                    approval_reviewer_id: task.approval_reviewer_id || null,
                    approval_status: task.approval_status || null
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
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Detalhes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
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
                          {editedTask.setor ? (sectors?.find(s => s.id === editedTask.setor || s.name === editedTask.setor)?.name || editedTask.setor) : "Selecione um setor"}
                        </span>
                        <ChevronRight size={16} />
                      </Button>
                    </SectorDrawer>
                  ) : (
                    <p className="text-muted-foreground mt-2">
                      {task.setor ? (sectors?.find(s => s.id === task.setor || s.name === task.setor)?.name || task.setor) : "Sem setor definido"}
                    </p>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <Label>Responsável</Label>
                    {!isEditing && (
                      <MemberDrawer 
                        value="" 
                        onValueChange={(value) => {
                          if (value && !taskAssignees?.some(a => a.user_id === value)) {
                            addAssigneeMutation.mutate(value);
                          }
                        }}
                        positionId={task.setor === "Multiplos" ? "Multiplos" : (task.setor || undefined)}
                      >
                        <Button variant="ghost" size="icon" className="h-6 w-6" type="button">
                          <Plus size={14} />
                        </Button>
                      </MemberDrawer>
                    )}
                  </div>
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
                    <div className="mt-2 space-y-2">
                      {taskAssignees && taskAssignees.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {taskAssignees.map(assignee => {
                            const profile = workspaceMembers?.find(m => m.user_id === assignee.user_id)?.profiles;
                            return (
                              <div 
                                key={assignee.user_id}
                                className="flex items-center gap-2 bg-muted/50 rounded-full pl-1 pr-2 py-1 group"
                              >
                                <Avatar className="h-6 w-6">
                                  <AvatarFallback className="bg-primary/10 text-primary text-xs">
                                    {profile?.full_name?.charAt(0).toUpperCase() || "?"}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="text-sm">{profile?.full_name || "Usuário"}</span>
                                <button
                                  onClick={() => removeAssigneeMutation.mutate(assignee.user_id)}
                                  className="opacity-0 group-hover:opacity-100 transition-opacity ml-1"
                                >
                                  <X size={14} className="text-muted-foreground hover:text-destructive" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-muted-foreground">Sem responsável</p>
                      )}
                    </div>
                  )}
                </div>

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

                {/* Approval Section */}
                <div className="border-t pt-4 mt-4">
                  <Label className="flex items-center gap-2 mb-3">
                    <Shield size={16} />
                    Aprovação
                  </Label>
                  
                  {isEditing ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="requires-approval" className="text-sm">
                          Requer aprovação de outra pessoa
                        </Label>
                        <Switch
                          id="requires-approval"
                          checked={editedTask.requires_approval}
                          onCheckedChange={(checked) => {
                            setEditedTask({ 
                              ...editedTask, 
                              requires_approval: checked,
                              approval_status: checked ? 'pending' : null
                            });
                            if (checked) {
                              setShowReviewerSheet(true);
                            }
                          }}
                        />
                      </div>
                      
                      {editedTask.requires_approval && (
                        <Sheet open={showReviewerSheet} onOpenChange={setShowReviewerSheet}>
                          <SheetTrigger asChild>
                            <Button variant="outline" className="w-full justify-between">
                              <span className="flex items-center gap-2">
                                <UserCircle size={16} />
                                {editedTask.approval_reviewer_id 
                                  ? workspaceMembers?.find(m => m.user_id === editedTask.approval_reviewer_id)?.profiles?.full_name || "Revisor selecionado"
                                  : "Selecionar quem deve aprovar"}
                              </span>
                              <ChevronRight size={16} />
                            </Button>
                          </SheetTrigger>
                          <SheetContent>
                            <SheetHeader>
                              <SheetTitle>Selecionar Revisor</SheetTitle>
                            </SheetHeader>
                            <div className="mt-4 space-y-2">
                              {workspaceMembers?.filter(m => m.user_id !== task?.assigned_to).map((member) => (
                                <Button
                                  key={member.user_id}
                                  variant={editedTask.approval_reviewer_id === member.user_id ? "default" : "outline"}
                                  className="w-full justify-start"
                                  onClick={() => {
                                    setEditedTask({ ...editedTask, approval_reviewer_id: member.user_id });
                                    setShowReviewerSheet(false);
                                  }}
                                >
                                  <UserCircle size={16} className="mr-2" />
                                  {member.profiles?.full_name || "Usuário"}
                                </Button>
                              ))}
                            </div>
                          </SheetContent>
                        </Sheet>
                      )}
                    </div>
                  ) : task.requires_approval ? (
                    <ApprovalSection 
                      task={task}
                      workspaceMembers={workspaceMembers}
                      currentUserId={user?.id}
                      onApprove={(status, notes) => {
                        approvalMutation.mutate({ approval_status: status, notes });
                      }}
                      onResubmit={(notes) => {
                        resubmitMutation.mutate({ notes });
                      }}
                    />
                  ) : (
                    <p className="text-muted-foreground text-sm">Esta tarefa não requer aprovação</p>
                  )}
                </div>

                {/* Datas de início e fim */}
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
                    {isEditing ? (
                      <Input
                        type="date"
                        value={editedTask.due_date}
                        onChange={(e) => setEditedTask({ ...editedTask, due_date: e.target.value })}
                        className="mt-2"
                      />
                    ) : (
                      <div className="mt-2">
                        {task.due_date ? (
                          <Badge 
                            variant={isOverdue ? "destructive" : isDueSoon ? "default" : "secondary"}
                            className={isDueSoon && !isOverdue ? "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-400 border-amber-300" : ""}
                          >
                            <Calendar size={12} className="mr-1" />
                            {formatDateBR(task.due_date)}
                          </Badge>
                        ) : (
                          <p className="text-muted-foreground text-sm">Não definida</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

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

                <div>
                  <Label className="flex items-center gap-2">
                    <Paperclip size={16} />
                    Arquivos Anexados
                  </Label>
                  <div className="mt-2">
                    <TaskAttachments taskId={id!} isEditing={isEditing} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Subtarefas</CardTitle>
                  <Badge variant="secondary">
                    {task.subtasks?.filter((s: any) => s.completed).length || 0} de {task.subtasks?.length || 0}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={(event: DragEndEvent) => {
                    const { active, over } = event;
                    if (over && active.id !== over.id) {
                      const sortedSubtasks = [...(task.subtasks || [])].sort(
                        (a: any, b: any) => (a.subtask_order || 0) - (b.subtask_order || 0)
                      );
                      const oldIndex = sortedSubtasks.findIndex((s: any) => s.id === active.id);
                      const newIndex = sortedSubtasks.findIndex((s: any) => s.id === over.id);
                      const newOrder = arrayMove(sortedSubtasks, oldIndex, newIndex);
                      const updates = newOrder.map((s: any, index: number) => ({
                        id: s.id,
                        subtask_order: index + 1,
                      }));
                      reorderSubtasksMutation.mutate(updates);
                    }
                  }}
                >
                  <SortableContext
                    items={[...(task.subtasks || [])].sort((a: any, b: any) => (a.subtask_order || 0) - (b.subtask_order || 0)).map((s: any) => s.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {[...(task.subtasks || [])].sort((a: any, b: any) => (a.subtask_order || 0) - (b.subtask_order || 0)).map((subtask: any) => (
                      <SortableSubtask
                        key={subtask.id}
                        subtask={subtask}
                        onToggle={(subtaskId, completed) =>
                          toggleSubtaskMutation.mutate({ subtaskId, completed })
                        }
                        onUpdate={(subtaskId, title) =>
                          updateSubtaskMutation.mutate({ subtaskId, title })
                        }
                        onDelete={setSubtaskToDelete}
                        isPending={toggleSubtaskMutation.isPending}
                      />
                    ))}
                  </SortableContext>
                </DndContext>

                <div className="flex gap-2 pt-2">
                  <Input
                    placeholder="Nova subtarefa..."
                    value={newSubtask}
                    onChange={(e) => setNewSubtask(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === "Enter" && newSubtask.trim()) {
                        addSubtaskMutation.mutate(newSubtask);
                      }
                    }}
                  />
                  <Button
                    onClick={() => newSubtask.trim() && addSubtaskMutation.mutate(newSubtask)}
                    disabled={!newSubtask.trim()}
                  >
                    <Plus size={16} />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>POP's Vinculados</CardTitle>
                  <Badge variant="secondary">
                    {taskProcesses?.length || 0}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {taskProcesses?.map((tp: any) => (
                  <div key={tp.id} className="flex items-center gap-2 p-3 bg-muted/50 rounded group hover:bg-muted transition-colors">
                    <div 
                      className="flex-1 cursor-pointer"
                      onClick={() => navigate(`/tools/wizzy-flow/workspace/processes?processId=${tp.process_id}`)}
                    >
                      <p className="font-medium text-sm hover:text-primary transition-colors">
                        {tp.process_documentation?.title}
                      </p>
                      <p className="text-xs text-muted-foreground">{tp.process_documentation?.area}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        unlinkProcessMutation.mutate(tp.id);
                      }}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                ))}
                
                <Dialog open={isAddingProcess} onOpenChange={setIsAddingProcess}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="w-full gap-2">
                      <LinkIcon size={16} />
                      Vincular POP
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Vincular POP</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Selecione um POP</Label>
                        <Select onValueChange={(value) => linkProcessMutation.mutate(value)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Escolher processo..." />
                          </SelectTrigger>
                          <SelectContent>
                            {processes
                              ?.filter((p) => !taskProcesses?.some((tp: any) => tp.process_id === p.id))
                              .map((process) => (
                                <SelectItem key={process.id} value={process.id}>
                                  {process.title} ({process.area})
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => {
                          setIsAddingProcess(false);
                          navigate("/tools/wizzy-flow/workspace/processes");
                        }}
                      >
                        Criar Novo POP
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>

                {taskProcesses && taskProcesses.length > 0 && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => navigate(`/tools/wizzy-flow/workspace/processes`)}
                  >
                    Ver POP's
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <AlertDialog open={!!subtaskToDelete} onOpenChange={(open) => !open && setSubtaskToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Tem certeza?</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza de que deseja excluir a subtarefa '{subtaskToDelete?.title}'? Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction 
                onClick={() => subtaskToDelete && deleteSubtaskMutation.mutate(subtaskToDelete.id)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}
