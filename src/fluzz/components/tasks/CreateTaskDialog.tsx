import { useMemo, useState } from "react";
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
import { Checkbox } from "@/fluzz/components/ui/checkbox";
import { Switch } from "@/fluzz/components/ui/switch";
import { ScrollArea } from "@/fluzz/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/fluzz/components/ui/sheet";
import { toast } from "sonner";
import { SectorDrawer } from "./SectorDrawer";
import { MemberDrawer } from "./MemberDrawer";
import { Avatar, AvatarFallback } from "@/fluzz/components/ui/avatar";
import {
  Briefcase,
  ChevronRight,
  FileText,
  Link as LinkIcon,
  Plus,
  Shield,
  Upload,
  UserCircle,
  X,
} from "lucide-react";

interface CreateTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}

type LinkItem = { name: string; url: string };

export const CreateTaskDialog = ({ open, onOpenChange, projectId }: CreateTaskDialogProps) => {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const queryClient = useQueryClient();

  // Fields (order must match TaskDetail)
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sectorId, setSectorId] = useState(""); // can be UUID or "Multiplos"
  const [assignees, setAssignees] = useState<string[]>([]);
  const [priority, setPriority] = useState("medium");
  const [status, setStatus] = useState("todo");

  // Approval
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [approvalReviewerId, setApprovalReviewerId] = useState<string | null>(null);
  const [showReviewerSheet, setShowReviewerSheet] = useState(false);

  // Dates
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");

  // Documentation + attachments
  const [documentation, setDocumentation] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkName, setLinkName] = useState("");
  const [linkUrl, setLinkUrl] = useState("");

  // POPs
  const [selectedProcesses, setSelectedProcesses] = useState<string[]>([]);
  const [processDrawerOpen, setProcessDrawerOpen] = useState(false);

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

      const userIds = members.map((m) => m.user_id);
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);

      if (profilesError) throw profilesError;

      return members.map((member) => ({
        user_id: member.user_id,
        role: member.role,
        profiles: profiles?.find((p) => p.id === member.user_id),
      }));
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

  const sectorName = useMemo(() => {
    if (!sectorId) return "";
    if (sectorId === "Multiplos") return "Múltiplos Setores";
    return positions?.find((p) => p.id === sectorId)?.name || "";
  }, [positions, sectorId]);

  const canPickProcesses = !!sectorId;

  const { data: processes, isLoading: processesLoading } = useQuery({
    queryKey: ["processes", workspace?.id, sectorId],
    queryFn: async () => {
      if (!workspace) return [];
      if (!sectorId) return [];

      let query = supabase
        .from("process_documentation")
        .select("id, title, area")
        .eq("workspace_id", workspace.id)
        .order("title");

      if (sectorId !== "Multiplos") {
        if (!sectorName) return [];
        query = query.eq("area", sectorName);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!workspace,
  });

  const primaryAssignee = useMemo(() => {
    return assignees.length > 0 ? assignees[0] : user?.id;
  }, [assignees, user?.id]);

  const reviewerCandidates = useMemo(() => {
    const excludeId = primaryAssignee;
    return (workspaceMembers || []).filter((m) => m.user_id !== excludeId);
  }, [workspaceMembers, primaryAssignee]);

  const getInitials = (name: string | null | undefined) => {
    if (!name) return "?";
    const parts = name.split(" ");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setSectorId("");
    setAssignees([]);
    setPriority("medium");
    setStatus("todo");
    setRequiresApproval(false);
    setApprovalReviewerId(null);
    setStartDate("");
    setDueDate("");
    setDocumentation("");
    setFiles([]);
    setLinks([]);
    setLinkDialogOpen(false);
    setLinkName("");
    setLinkUrl("");
    setSelectedProcesses([]);
    setProcessDrawerOpen(false);
  };

  const handleAddAssignee = (userId: string) => {
    if (!assignees.includes(userId)) {
      setAssignees([...assignees, userId]);
    }
  };

  const handleRemoveAssignee = (userId: string) => {
    setAssignees(assignees.filter((id) => id !== userId));
  };

  const handleFilesPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
    if (picked.length === 0) return;
    setFiles((prev) => [...prev, ...picked]);
    e.target.value = "";
  };

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const addLink = () => {
    if (!linkName.trim() || !linkUrl.trim()) {
      toast.error("Preencha o nome e a URL do link");
      return;
    }
    setLinks((prev) => [...prev, { name: linkName.trim(), url: linkUrl.trim() }]);
    setLinkName("");
    setLinkUrl("");
    setLinkDialogOpen(false);
  };

  const removeLink = (index: number) => {
    setLinks(links.filter((_, i) => i !== index));
  };

  const toggleProcess = (processId: string) => {
    setSelectedProcesses((prev) =>
      prev.includes(processId) ? prev.filter((id) => id !== processId) : [...prev, processId]
    );
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("User not authenticated");

      const assigneeForTask = assignees.length > 0 ? assignees[0] : user.id;

      const { data: newTask, error: taskError } = await supabase
        .from("tasks")
        .insert([
          {
            project_id: projectId,
            title,
            description: description || null,
            priority,
            status,
            start_date: startDate || null,
            due_date: dueDate || null,
            assigned_to: assigneeForTask,
            documentation: documentation || null,
            setor: sectorId || null,
            requires_approval: requiresApproval,
            approval_reviewer_id: requiresApproval ? approvalReviewerId : null,
            approval_status: requiresApproval ? "pending" : null,
          },
        ])
        .select()
        .single();

      if (taskError) throw taskError;

      // Assignees
      if (assignees.length > 0) {
        const { error: assigneeError } = await supabase.from("task_assignees").insert(
          assignees.map((userId) => ({
            task_id: newTask.id,
            user_id: userId,
          }))
        );
        if (assigneeError) throw assigneeError;
      } else {
        const { error: assigneeError } = await supabase.from("task_assignees").insert({
          task_id: newTask.id,
          user_id: user.id,
        });
        if (assigneeError) throw assigneeError;
      }

      // POPs
      if (selectedProcesses.length > 0) {
        const { error: processError } = await supabase.from("task_processes").insert(
          selectedProcesses.map((processId) => ({
            task_id: newTask.id,
            process_id: processId,
          }))
        );
        if (processError) throw processError;
      }

      // Attachments (files)
      for (const file of files) {
        const storagePath = `${newTask.id}/${Date.now()}-${file.name}`;

        const { error: uploadError } = await supabase.storage
          .from("task-files")
          .upload(storagePath, file);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from("task-files").getPublicUrl(storagePath);

        const { error: insertError } = await supabase.from("task_attachments").insert({
          task_id: newTask.id,
          name: file.name,
          file_url: urlData.publicUrl,
          file_type: file.type,
          file_size: file.size,
          uploaded_by: user.id,
        });

        if (insertError) throw insertError;
      }

      // Attachments (links)
      for (const link of links) {
        const { error } = await supabase.from("task_attachments").insert({
          task_id: newTask.id,
          name: link.name,
          file_url: link.url,
          file_type: "link",
          file_size: null,
          uploaded_by: user.id,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      queryClient.invalidateQueries({ queryKey: ["task-assignees"] });
      queryClient.invalidateQueries({ queryKey: ["task-assignees-multiple"] });
      toast.success("Tarefa criada com sucesso!");
      resetForm();
      onOpenChange(false);
    },
    onError: (error: any) => {
      console.error("Erro ao criar tarefa:", error);
      toast.error(error?.message ? `Erro ao criar tarefa: ${error.message}` : "Erro ao criar tarefa");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("O título da tarefa é obrigatório");
      return;
    }
    if (requiresApproval) {
      if (!approvalReviewerId) {
        toast.error("Selecione quem deve aprovar");
        return;
      }
      if (primaryAssignee && approvalReviewerId === primaryAssignee) {
        toast.error("O aprovador deve ser outra pessoa");
        return;
      }
    }
    createMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Tarefa</DialogTitle>
          <DialogDescription>Crie uma nova tarefa para este projeto</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Título */}
          <div className="space-y-2">
            <Label htmlFor="title">Título *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Criar página inicial"
              required
            />
          </div>

          {/* Descrição */}
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

          {/* Setor */}
          <div className="space-y-2">
            <Label>Setor</Label>
            <SectorDrawer
              value={sectorId}
              onValueChange={(value) => {
                setSectorId(value);
                setAssignees([]);
                setSelectedProcesses([]);
              }}
            >
              <Button variant="outline" className="w-full justify-between" type="button">
                <span className="flex items-center gap-2">
                  <Briefcase size={16} />
                  {sectorId === "Multiplos"
                    ? "Múltiplos Setores"
                    : sectorId && positions?.find((s) => s.id === sectorId)?.name
                      ? positions?.find((s) => s.id === sectorId)?.name
                      : "Selecione um setor"}
                </span>
                <ChevronRight size={16} />
              </Button>
            </SectorDrawer>
          </div>

          {/* Responsáveis */}
          <div className="space-y-2">
            <Label>Responsáveis</Label>

            {assignees.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {assignees.map((userId) => {
                  const member = workspaceMembers?.find((m) => m.user_id === userId);
                  return (
                    <div
                      key={userId}
                      className="flex items-center gap-1.5 bg-muted rounded-full pl-1 pr-2 py-1"
                    >
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-xs bg-primary/10 text-primary">
                          {getInitials(member?.profiles?.full_name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm">{member?.profiles?.full_name || "Usuário"}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveAssignee(userId)}
                        className="ml-1 text-muted-foreground hover:text-foreground"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <MemberDrawer value="" onValueChange={handleAddAssignee} positionId={sectorId || undefined}>
              <Button
                variant="outline"
                className={`w-full justify-between ${assignees.length > 0 ? "border-dashed" : ""}`}
                type="button"
              >
                <span className="flex items-center gap-2">
                  <Plus size={16} />
                  {assignees.length === 0 ? "Adicionar responsável" : "Adicionar mais"}
                </span>
                <ChevronRight size={16} />
              </Button>
            </MemberDrawer>
          </div>

          {/* Prioridade */}
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

          {/* Status */}
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

          {/* Aprovação */}
          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              <Shield size={16} />
              Aprovação
            </Label>
            <div className="flex items-center justify-between">
              <span className="text-sm">Requer aprovação de outra pessoa</span>
              <Switch
                checked={requiresApproval}
                onCheckedChange={(checked) => {
                  setRequiresApproval(checked);
                  if (checked) {
                    setShowReviewerSheet(true);
                  } else {
                    setApprovalReviewerId(null);
                  }
                }}
              />
            </div>

            {requiresApproval && (
              <Sheet open={showReviewerSheet} onOpenChange={setShowReviewerSheet}>
                <SheetTrigger asChild>
                  <Button variant="outline" className="w-full justify-between" type="button">
                    <span className="flex items-center gap-2">
                      <UserCircle size={16} />
                      {approvalReviewerId
                        ? workspaceMembers?.find((m) => m.user_id === approvalReviewerId)?.profiles?.full_name ||
                          "Revisor selecionado"
                        : "Selecionar quem deve aprovar"}
                    </span>
                    <ChevronRight size={16} />
                  </Button>
                </SheetTrigger>
                <SheetContent side="bottom" className="h-[80vh]">
                  <SheetHeader>
                    <SheetTitle>Selecionar Revisor</SheetTitle>
                  </SheetHeader>
                  <ScrollArea className="h-[calc(80vh-120px)] mt-4">
                    <div className="space-y-2">
                      {reviewerCandidates.length > 0 ? (
                        reviewerCandidates.map((member) => (
                          <Button
                            key={member.user_id}
                            variant={approvalReviewerId === member.user_id ? "default" : "outline"}
                            className="w-full justify-start"
                            type="button"
                            onClick={() => {
                              setApprovalReviewerId(member.user_id);
                              setShowReviewerSheet(false);
                            }}
                          >
                            <UserCircle size={16} className="mr-2" />
                            {member.profiles?.full_name || "Usuário"}
                          </Button>
                        ))
                      ) : (
                        <div className="text-sm text-muted-foreground py-6 text-center">
                          Nenhum membro disponível para aprovar.
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </SheetContent>
              </Sheet>
            )}
          </div>

          {/* Datas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start_date">Data de Início</Label>
              <Input
                id="start_date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="due_date">Data de Fim (Prazo)</Label>
              <Input id="due_date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>

          {/* Documentação */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2" htmlFor="documentation">
              <FileText size={16} />
              Documentação
            </Label>
            <Textarea
              id="documentation"
              value={documentation}
              onChange={(e) => setDocumentation(e.target.value)}
              placeholder="Adicione documentação, links ou anotações importantes..."
              rows={3}
            />

            {/* Arquivos + Links */}
            <div className="space-y-3 pt-2">
              <div className="flex flex-wrap gap-2">
                <div>
                  <Input
                    id="task-files"
                    type="file"
                    multiple
                    onChange={handleFilesPicked}
                    className="hidden"
                    disabled={createMutation.isPending}
                  />
                  <Label
                    htmlFor="task-files"
                    className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-md cursor-pointer transition-colors"
                  >
                    <Upload size={14} />
                    Adicionar Arquivos
                  </Label>
                </div>

                <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
                  <SheetTrigger asChild />
                </Dialog>

                <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => setLinkDialogOpen(true)}>
                  <LinkIcon size={14} />
                  Adicionar Link
                </Button>
              </div>

              {/* Link modal (simple) */}
              <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Adicionar Link</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Nome do Link</Label>
                      <Input value={linkName} onChange={(e) => setLinkName(e.target.value)} placeholder="Ex: Grupo do WhatsApp" />
                    </div>
                    <div className="space-y-2">
                      <Label>URL</Label>
                      <Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://..." />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => setLinkDialogOpen(false)}>
                        Cancelar
                      </Button>
                      <Button type="button" onClick={addLink}>
                        Adicionar
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              {(files.length > 0 || links.length > 0) && (
                <div className="space-y-2">
                  {files.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Arquivos</p>
                      {files.map((f, idx) => (
                        <div key={`${f.name}-${idx}`} className="flex items-center gap-2 text-sm bg-muted/50 rounded px-2 py-1">
                          <span className="truncate flex-1">{f.name}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => removeFile(idx)}
                          >
                            <X size={12} />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  {links.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Links</p>
                      {links.map((l, idx) => (
                        <div key={`${l.url}-${idx}`} className="flex items-center gap-2 text-sm bg-muted/50 rounded px-2 py-1">
                          <LinkIcon size={12} className="text-muted-foreground" />
                          <span className="truncate flex-1">{l.name}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => removeLink(idx)}
                          >
                            <X size={12} />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* POPs Vinculados */}
          <div className="space-y-2">
            <Label>POP's Vinculados</Label>

            <Sheet open={processDrawerOpen} onOpenChange={setProcessDrawerOpen}>
              <SheetTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-between"
                  disabled={!canPickProcesses}
                >
                  <span className="flex items-center gap-2">
                    <Plus size={16} />
                    {selectedProcesses.length > 0
                      ? `${selectedProcesses.length} POP(s) selecionado(s)`
                      : canPickProcesses
                        ? "Vincular POPs"
                        : "Selecione um setor primeiro"}
                  </span>
                  <ChevronRight size={16} />
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="h-[80vh]">
                <SheetHeader>
                  <SheetTitle>
                    Selecionar POPs {sectorId === "Multiplos" ? "(Todos os setores)" : sectorName ? `(${sectorName})` : ""}
                  </SheetTitle>
                </SheetHeader>

                <ScrollArea className="h-[calc(80vh-160px)] mt-4">
                  <div className="space-y-2">
                    {processesLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                      </div>
                    ) : processes && processes.length > 0 ? (
                      processes.map((process) => (
                        <div
                          key={process.id}
                          className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                          onClick={() => toggleProcess(process.id)}
                        >
                          <Checkbox checked={selectedProcesses.includes(process.id)} onCheckedChange={() => toggleProcess(process.id)} />
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
                          {sectorId
                            ? "Nenhum processo cadastrado para este setor"
                            : "Selecione um setor primeiro"}
                        </p>
                      </div>
                    )}
                  </div>
                </ScrollArea>

                <div className="pt-4 border-t">
                  <Button type="button" className="w-full" onClick={() => setProcessDrawerOpen(false)}>
                    Concluir
                  </Button>
                </div>
              </SheetContent>
            </Sheet>

            {selectedProcesses.length > 0 && (
              <div className="space-y-1">
                {selectedProcesses.map((processId) => {
                  const p = processes?.find((x) => x.id === processId);
                  if (!p) return null;
                  return (
                    <div key={processId} className="flex items-center gap-2 text-sm">
                      <div className="w-2 h-2 rounded-full bg-primary" />
                      <span className="truncate">{p.title}</span>
                      <span className="text-muted-foreground truncate">({p.area})</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
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
