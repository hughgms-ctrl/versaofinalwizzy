import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { 
  X, 
  Calendar, 
  Flag, 
  User, 
  FileText, 
  CheckCircle2, 
  Clock, 
  PlayCircle,
  ChevronRight,
  Plus,
  Link as LinkIcon,
  Hash,
  Trash2,
  GripVertical,
  Check,
  MoreHorizontal
} from "lucide-react";
import { Button } from "@/fluzz/components/ui/button";
import { Badge } from "@/fluzz/components/ui/badge";
import { Textarea } from "@/fluzz/components/ui/textarea";
import { Input } from "@/fluzz/components/ui/input";
import { Checkbox } from "@/fluzz/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/fluzz/components/ui/avatar";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/fluzz/components/ui/select";
import { ScrollArea } from "@/fluzz/components/ui/scroll-area";
import { 
  Popover, 
  PopoverContent, 
  PopoverTrigger 
} from "@/fluzz/components/ui/popover";
import { Calendar as CalendarComponent } from "@/fluzz/components/ui/calendar";
import { cn, formatDateBR, isTaskOverdue, isTaskDueSoon } from "@/fluzz/lib/utils";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { toast } from "sonner";
import { useIsMobile } from "@/fluzz/hooks/use-mobile";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { TaskAttachments } from "@/fluzz/components/tasks/TaskAttachments";

interface FocusModeTaskDetailProps {
  task: any;
  profiles: any[];
  onClose: () => void;
  queryKeyToInvalidate?: string[];
}

const statusConfig = {
  todo: { label: "A fazer", icon: Clock, color: "hsl(0, 68%, 72%)" },
  in_progress: { label: "Fazendo", icon: PlayCircle, color: "hsl(30, 100%, 65%)" },
  completed: { label: "Feito", icon: CheckCircle2, color: "hsl(152, 69%, 53%)" },
};

const priorityConfig = {
  high: { label: "Alta", color: "text-destructive bg-destructive/10" },
  medium: { label: "Média", color: "text-warning bg-warning/10" },
  low: { label: "Baixa", color: "text-info bg-info/10" },
};

export function FocusModeTaskDetail({ 
  task, 
  profiles, 
  onClose,
  queryKeyToInvalidate = ["my-tasks", "tasks"] 
}: FocusModeTaskDetailProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const { workspace } = useWorkspace();
  
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || "");
  const [status, setStatus] = useState(task.status || "todo");
  const [priority, setPriority] = useState(task.priority || "medium");
  const [dueDate, setDueDate] = useState<Date | undefined>(
    task.due_date ? new Date(task.due_date) : undefined
  );
  const [documentation, setDocumentation] = useState(task.documentation || "");
  const [isSaving, setIsSaving] = useState(false);
  const [showAssigneeSelect, setShowAssigneeSelect] = useState(false);
  const [newSubtask, setNewSubtask] = useState("");
  const [showDescription, setShowDescription] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [showDocumentation, setShowDocumentation] = useState(false);

  // Fetch subtasks
  const { data: subtasks, refetch: refetchSubtasks } = useQuery({
    queryKey: ["task-subtasks-focus", task.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("subtasks")
        .select("*")
        .eq("task_id", task.id)
        .order("subtask_order");
      return data || [];
    },
    enabled: !!task.id,
  });

  // Fetch workspace members
  const { data: workspaceMembers } = useQuery({
    queryKey: ["workspace-members-focus", workspace?.id],
    queryFn: async () => {
      if (!workspace?.id) return [];
      const { data: members } = await supabase
        .from("workspace_members")
        .select("user_id, role")
        .eq("workspace_id", workspace.id);
      if (!members || members.length === 0) return [];
      const userIds = members.map(m => m.user_id);
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("*")
        .in("id", userIds);
      return members.map(m => ({
        ...m,
        profile: profilesData?.find(p => p.id === m.user_id)
      }));
    },
    enabled: !!workspace?.id,
  });

  // Fetch current assignees
  const { data: currentAssignees, refetch: refetchAssignees } = useQuery({
    queryKey: ["task-assignees-focus", task.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("task_assignees")
        .select("user_id")
        .eq("task_id", task.id);
      return data?.map(a => a.user_id) || [];
    },
    enabled: !!task.id,
  });

  const taskAssignees = task.task_assignees || [];
  const assigneeProfiles = taskAssignees
    .map((ta: any) => profiles?.find(p => p.id === ta.user_id))
    .filter(Boolean);

  const isOverdue = isTaskOverdue(task.due_date, task.status);
  const isDueSoon = isTaskDueSoon(task.due_date, task.status);
  const isCompleted = status === "completed";

  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description || "");
    setStatus(task.status || "todo");
    setPriority(task.priority || "medium");
    setDueDate(task.due_date ? new Date(task.due_date) : undefined);
    setDocumentation(task.documentation || "");
  }, [task]);

  const handleSave = async (field: string, value: any) => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("tasks")
        .update({ [field]: value })
        .eq("id", task.id);
      if (error) throw error;
      queryKeyToInvalidate.forEach(key => 
        queryClient.invalidateQueries({ queryKey: [key] })
      );
    } catch (error) {
      toast.error("Erro ao salvar");
    } finally {
      setIsSaving(false);
    }
  };

  const handleStatusChange = (newStatus: string) => {
    setStatus(newStatus);
    handleSave("status", newStatus);
  };

  const handleCheckClick = () => {
    const newStatus = isCompleted ? "todo" : "completed";
    handleStatusChange(newStatus);
  };

  const handleTitleBlur = () => {
    if (title.trim() && title !== task.title) handleSave("title", title.trim());
  };

  const handleDescriptionBlur = () => {
    if (description !== task.description) handleSave("description", description);
  };

  const handleDueDateChange = (date: Date | undefined) => {
    setDueDate(date);
    handleSave("due_date", date ? format(date, "yyyy-MM-dd") : null);
  };

  const handleDocumentationBlur = () => {
    if (documentation !== task.documentation) handleSave("documentation", documentation);
  };

  const handlePriorityChange = (newPriority: string) => {
    setPriority(newPriority);
    handleSave("priority", newPriority);
  };

  const handleAddAssignee = async (userId: string) => {
    try {
      if (currentAssignees?.includes(userId)) {
        toast.info("Usuário já é responsável");
        return;
      }
      const { error } = await supabase
        .from("task_assignees")
        .insert({ task_id: task.id, user_id: userId });
      if (error) throw error;
      refetchAssignees();
      queryKeyToInvalidate.forEach(key => 
        queryClient.invalidateQueries({ queryKey: [key] })
      );
      toast.success("Responsável adicionado!");
      setShowAssigneeSelect(false);
    } catch (error) {
      toast.error("Erro ao adicionar responsável");
    }
  };

  const handleRemoveAssignee = async (userId: string) => {
    try {
      const { error } = await supabase
        .from("task_assignees")
        .delete()
        .eq("task_id", task.id)
        .eq("user_id", userId);
      if (error) throw error;
      refetchAssignees();
      queryKeyToInvalidate.forEach(key => 
        queryClient.invalidateQueries({ queryKey: [key] })
      );
      toast.success("Responsável removido!");
    } catch (error) {
      toast.error("Erro ao remover responsável");
    }
  };

  // Subtask mutations
  const addSubtask = async () => {
    if (!newSubtask.trim()) return;
    try {
      const maxOrder = subtasks?.reduce((max: number, s: any) => 
        Math.max(max, s.subtask_order || 0), 0) || 0;
      const { error } = await supabase
        .from("subtasks")
        .insert({ task_id: task.id, title: newSubtask.trim(), subtask_order: maxOrder + 1 });
      if (error) throw error;
      setNewSubtask("");
      refetchSubtasks();
    } catch (error) {
      toast.error("Erro ao adicionar subtarefa");
    }
  };

  const toggleSubtask = async (subtaskId: string, completed: boolean) => {
    try {
      const { error } = await supabase
        .from("subtasks")
        .update({ completed })
        .eq("id", subtaskId);
      if (error) throw error;
      refetchSubtasks();
    } catch (error) {
      toast.error("Erro ao atualizar subtarefa");
    }
  };

  const deleteSubtask = async (subtaskId: string) => {
    try {
      const { error } = await supabase
        .from("subtasks")
        .delete()
        .eq("id", subtaskId);
      if (error) throw error;
      refetchSubtasks();
    } catch (error) {
      toast.error("Erro ao excluir subtarefa");
    }
  };

  const completedSubtasks = subtasks?.filter((s: any) => s.completed).length || 0;
  const totalSubtasks = subtasks?.length || 0;

  // Sidebar properties section (shared between mobile & desktop)
  const PropertiesSidebar = () => (
    <div className="space-y-4">
      {/* Project */}
      {task.projects?.name && (
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Projeto</label>
          <div className="flex items-center gap-2 text-sm">
            <Hash className="h-3.5 w-3.5 text-muted-foreground" />
            <span>{task.projects.name}</span>
          </div>
        </div>
      )}

      {/* Status */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
        <Select value={status} onValueChange={handleStatusChange}>
          <SelectTrigger className="w-full h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(statusConfig).map(([key, config]) => (
              <SelectItem key={key} value={key}>
                <div className="flex items-center gap-2">
                  <config.icon className="h-3.5 w-3.5" style={{ color: config.color }} />
                  {config.label}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Due Date */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Data</label>
        <Popover>
          <PopoverTrigger asChild>
            <Button 
              variant="outline" 
              size="sm"
              className={cn(
                "w-full justify-start text-left font-normal h-8 text-sm",
                isOverdue && "border-destructive text-destructive",
                isDueSoon && !isOverdue && "border-amber-500 text-amber-500"
              )}
            >
              <Calendar className="mr-2 h-3.5 w-3.5" />
              {dueDate ? format(dueDate, "dd MMM yyyy", { locale: ptBR }) : "Sem data"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <CalendarComponent
              mode="single"
              selected={dueDate}
              onSelect={handleDueDateChange}
              initialFocus
              locale={ptBR}
            />
            {dueDate && (
              <div className="p-2 border-t">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="w-full text-destructive"
                  onClick={() => handleDueDateChange(undefined)}
                >
                  Remover data
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>
      </div>

      {/* Priority */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Prioridade</label>
        <Select value={priority} onValueChange={handlePriorityChange}>
          <SelectTrigger className="w-full h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(priorityConfig).map(([key, config]) => (
              <SelectItem key={key} value={key}>
                <Badge variant="secondary" className={cn("text-xs", config.color)}>
                  {config.label}
                </Badge>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Assignees */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Responsáveis</label>
        <div className="space-y-1">
          {assigneeProfiles.map((profile: any) => (
            <div 
              key={profile.id} 
              className="flex items-center gap-2 p-1 rounded hover:bg-destructive/10 cursor-pointer group"
              onClick={() => handleRemoveAssignee(profile.id)}
              title="Clique para remover"
            >
              <Avatar className="h-5 w-5">
                <AvatarImage src={profile.avatar_url} />
                <AvatarFallback className="text-[10px]">
                  {profile.full_name?.charAt(0)?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm truncate flex-1 group-hover:text-destructive">
                {profile.full_name?.split(' ')[0]}
              </span>
              <X className="h-3 w-3 opacity-0 group-hover:opacity-100 text-destructive" />
            </div>
          ))}
          <Popover open={showAssigneeSelect} onOpenChange={setShowAssigneeSelect}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs w-full justify-start">
                <Plus className="h-3 w-3" />
                Adicionar
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2" align="start">
              <ScrollArea className="max-h-48">
                <div className="space-y-1">
                  {workspaceMembers?.filter(m => !currentAssignees?.includes(m.user_id)).map((member) => (
                    <Button
                      key={member.user_id}
                      variant="ghost"
                      className="w-full justify-start gap-2 h-auto py-1.5 text-sm"
                      onClick={() => handleAddAssignee(member.user_id)}
                    >
                      <Avatar className="h-5 w-5">
                        <AvatarImage src={member.profile?.avatar_url} />
                        <AvatarFallback className="text-[10px]">
                          {member.profile?.full_name?.charAt(0)?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="truncate">{member.profile?.full_name || "Sem nome"}</span>
                    </Button>
                  ))}
                  {workspaceMembers?.filter(m => !currentAssignees?.includes(m.user_id)).length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      Todos já foram adicionados
                    </p>
                  )}
                </div>
              </ScrollArea>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Documentation - Links & Files */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Documentação</label>
        <TaskAttachments taskId={task.id} isEditing={true} />
      </div>
    </div>
  );

  // Mobile horizontal scrollable properties
  const MobilePropertyChips = () => (
    <div className="relative -mx-4">
      <div className="flex gap-2 overflow-x-auto px-4 pb-2" style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        <style>{`.mobile-chips-scroll::-webkit-scrollbar { display: none; }`}</style>
        {/* Status chip */}
        <Popover>
          <PopoverTrigger asChild>
            <button className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted text-sm whitespace-nowrap">
              {(() => {
                const StatusIcon = statusConfig[status as keyof typeof statusConfig]?.icon || Clock;
                return <StatusIcon className="h-3.5 w-3.5" style={{ color: statusConfig[status as keyof typeof statusConfig]?.color }} />;
              })()}
              {statusConfig[status as keyof typeof statusConfig]?.label || "Status"}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-40 p-1" align="start">
            {Object.entries(statusConfig).map(([key, config]) => (
              <button
                key={key}
                onClick={() => handleStatusChange(key)}
                className={cn(
                  "w-full flex items-center gap-2 p-2 rounded text-sm hover:bg-accent",
                  status === key && "bg-accent"
                )}
              >
                <config.icon className="h-3.5 w-3.5" style={{ color: config.color }} />
                {config.label}
              </button>
            ))}
          </PopoverContent>
        </Popover>

        {/* Priority chip */}
        <Popover>
          <PopoverTrigger asChild>
            <button className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted text-sm whitespace-nowrap">
              <Flag className="h-3.5 w-3.5" />
              {priorityConfig[priority as keyof typeof priorityConfig]?.label || "Prioridade"}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-36 p-1" align="start">
            {Object.entries(priorityConfig).map(([key, config]) => (
              <button
                key={key}
                onClick={() => handlePriorityChange(key)}
                className={cn(
                  "w-full flex items-center gap-2 p-2 rounded text-sm hover:bg-accent",
                  priority === key && "bg-accent"
                )}
              >
                {config.label}
              </button>
            ))}
          </PopoverContent>
        </Popover>

        {/* Assignees chip */}
        <Popover open={showAssigneeSelect} onOpenChange={setShowAssigneeSelect}>
          <PopoverTrigger asChild>
            <button className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted text-sm whitespace-nowrap">
              <User className="h-3.5 w-3.5" />
              {assigneeProfiles.length > 0 ? `${assigneeProfiles.length} responsáve${assigneeProfiles.length > 1 ? 'is' : 'l'}` : "Responsável"}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2" align="start">
            <ScrollArea className="max-h-48">
              <div className="space-y-1">
                {assigneeProfiles.map((profile: any) => (
                  <div 
                    key={profile.id} 
                    className="flex items-center gap-2 p-1.5 rounded hover:bg-destructive/10 cursor-pointer group"
                    onClick={() => handleRemoveAssignee(profile.id)}
                  >
                    <Avatar className="h-5 w-5">
                      <AvatarImage src={profile.avatar_url} />
                      <AvatarFallback className="text-[10px]">{profile.full_name?.charAt(0)?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm flex-1 group-hover:text-destructive">{profile.full_name}</span>
                    <X className="h-3 w-3 text-destructive" />
                  </div>
                ))}
                <div className="border-t my-1" />
                {workspaceMembers?.filter(m => !currentAssignees?.includes(m.user_id)).map((member) => (
                  <button
                    key={member.user_id}
                    onClick={() => handleAddAssignee(member.user_id)}
                    className="w-full flex items-center gap-2 p-1.5 rounded text-sm hover:bg-accent"
                  >
                    <Avatar className="h-5 w-5">
                      <AvatarImage src={member.profile?.avatar_url} />
                      <AvatarFallback className="text-[10px]">{member.profile?.full_name?.charAt(0)?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <span className="truncate">{member.profile?.full_name || "Sem nome"}</span>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </PopoverContent>
        </Popover>

        {/* Description chip */}
        <button 
          className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted text-sm whitespace-nowrap"
          onClick={() => setShowDescription(!showDescription)}
        >
          <FileText className="h-3.5 w-3.5" />
          Descrição
        </button>

        {/* Documentation chip */}
        <button 
          className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted text-sm whitespace-nowrap"
          onClick={() => setShowDocumentation(!showDocumentation)}
        >
          <LinkIcon className="h-3.5 w-3.5" />
          Docs
        </button>

        {/* Spacer to ensure last item is scrollable into view */}
        <div className="flex-shrink-0 w-1" aria-hidden="true" />
      </div>
    </div>
  );

  const content = (
    <div className={cn(
      "flex flex-col bg-card",
      isMobile ? "fixed inset-0 z-50 h-full" : "h-[80vh] max-h-[700px]"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b">
        <div className="flex items-center gap-1.5 min-w-0">
          {task.projects?.name ? (
            <>
              <Hash className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <span className="text-sm text-muted-foreground truncate">
                {task.projects.name}
              </span>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">Tarefa pessoal</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(`/tools/wizzy-flow/tasks/${task.id}`)}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <div className={cn(
          "flex h-full",
          isMobile ? "flex-col overflow-y-auto" : "flex-row"
        )}>
          {/* Main Content Area */}
          <div className={cn(
            "flex-1 p-4 space-y-4 overflow-y-auto",
            !isMobile && "border-r"
          )}>
            {/* Checkbox + Title */}
            <div className="flex items-start gap-3">
              <button
                onClick={handleCheckClick}
                className={cn(
                  "flex-shrink-0 w-5 h-5 rounded-full border-2 mt-1 transition-all duration-200",
                  "flex items-center justify-center",
                  isCompleted 
                    ? "bg-primary border-primary" 
                    : "border-muted-foreground/40 hover:border-primary"
                )}
              >
                {isCompleted && <Check className="h-3 w-3 text-primary-foreground" />}
              </button>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={handleTitleBlur}
                className={cn(
                  "text-lg font-semibold border-none p-0 h-auto focus-visible:ring-0 bg-transparent",
                  isCompleted && "line-through text-muted-foreground"
                )}
                placeholder="Título da tarefa"
              />
            </div>

            {/* Due date display */}
            {dueDate && (
              <div className="flex items-center gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <button className={cn(
                      "flex items-center gap-1.5 text-sm",
                      isOverdue && "text-destructive",
                      isDueSoon && !isOverdue && "text-warning",
                      !isOverdue && !isDueSoon && "text-muted-foreground"
                    )}>
                      <Calendar className="h-3.5 w-3.5" />
                      {format(dueDate, "dd MMM yyyy", { locale: ptBR })}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={dueDate}
                      onSelect={handleDueDateChange}
                      initialFocus
                      locale={ptBR}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            )}

            {/* Mobile: Horizontal scrollable property chips */}
            {isMobile && <MobilePropertyChips />}

            {/* Description (mobile: togglable, desktop: always visible) */}
            {(showDescription || !isMobile || description) && (
              <div className="space-y-1">
                {!isMobile && (
                  <label className="text-xs text-muted-foreground">Descrição</label>
                )}
                {editingDescription ? (
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    onBlur={() => { handleDescriptionBlur(); setEditingDescription(false); }}
                    placeholder="Adicione uma descrição..."
                    className="min-h-[60px] resize-y text-sm"
                    autoFocus
                  />
                ) : (
                  <div
                    onClick={() => setEditingDescription(true)}
                    className="text-sm whitespace-pre-wrap cursor-text min-h-[24px] rounded-md px-3 py-2 hover:bg-accent/30 transition-colors"
                  >
                    {description || <span className="text-muted-foreground/60">Adicione uma descrição...</span>}
                  </div>
                )}
              </div>
            )}

            {/* Documentation (mobile: togglable) */}
            {isMobile && showDocumentation && (
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Documentação</label>
                <TaskAttachments taskId={task.id} isEditing={true} />
              </div>
            )}

            {/* Subtasks */}
            <div className="space-y-2">
              {totalSubtasks > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {completedSubtasks} de {totalSubtasks}
                  </span>
                </div>
              )}
              
              {subtasks?.map((subtask: any) => (
                <div key={subtask.id} className="flex items-center gap-2 group">
                  <Checkbox
                    checked={subtask.completed}
                    onCheckedChange={(checked) => toggleSubtask(subtask.id, !!checked)}
                    className="flex-shrink-0"
                  />
                  <span className={cn(
                    "flex-1 text-sm",
                    subtask.completed && "line-through text-muted-foreground"
                  )}>
                    {subtask.title}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100"
                    onClick={() => deleteSubtask(subtask.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}

              {/* Add subtask */}
              <div className="flex items-center gap-2">
                <Plus className="h-4 w-4 text-primary flex-shrink-0" />
                <input
                  type="text"
                  value={newSubtask}
                  onChange={(e) => setNewSubtask(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addSubtask()}
                  placeholder="Adicionar subtarefa"
                  className="flex-1 text-sm bg-transparent outline-none text-primary placeholder:text-primary/60"
                />
              </div>
            </div>
          </div>

          {/* Desktop Sidebar */}
          {!isMobile && (
            <div className="w-[240px] flex-shrink-0 p-4 overflow-y-auto">
              <PropertiesSidebar />
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return content;
}
