import { useState } from "react";
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
import { Switch } from "@/fluzz/components/ui/switch";
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
import { SectorDrawer } from "./SectorDrawer";
import { MemberDrawer } from "./MemberDrawer";
import { 
  Briefcase, 
  UserCircle, 
  ChevronRight, 
  Shield, 
  FileText, 
  Link as LinkIcon,
  Upload,
  X,
  Plus
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/fluzz/components/ui/sheet";

interface CreateMyTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultProjectId?: string | null;
}

export const CreateMyTaskDialog = ({ open, onOpenChange, defaultProjectId }: CreateMyTaskDialogProps) => {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const queryClient = useQueryClient();
  
  // Form states
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [setor, setSetor] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [priority, setPriority] = useState("medium");
  const [status, setStatus] = useState("todo");
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [approvalReviewerId, setApprovalReviewerId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [documentation, setDocumentation] = useState("");
  const [selectedProcesses, setSelectedProcesses] = useState<string[]>([]);
  const [showReviewerSheet, setShowReviewerSheet] = useState(false);
  const [showProcessSheet, setShowProcessSheet] = useState(false);
  const [linkInput, setLinkInput] = useState("");
  const [links, setLinks] = useState<string[]>([]);

  // Fetch sectors/positions
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

  // Fetch workspace members
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
        .select("id, user_id, full_name")
        .in("user_id", userIds);

      if (profilesError) throw profilesError;

      return members.map(member => ({
        user_id: member.user_id,
        role: member.role,
        profiles: profiles?.find(p => p.user_id === member.user_id)
      }));
    },
    enabled: !!workspace,
  });

  // Fetch processes based on sector
  const { data: processes } = useQuery({
    queryKey: ["processes", workspace?.id, setor],
    queryFn: async () => {
      if (!workspace) return [];
      
      let query = supabase
        .from("process_documentation")
        .select("id, title, area")
        .eq("workspace_id", workspace.id)
        .order("title");
      
      // If a specific sector is selected (not "Multiplos"), filter by area
      if (setor && setor !== "Multiplos") {
        const sectorName = sectors?.find(s => s.id === setor)?.name;
        if (sectorName) {
          query = query.eq("area", sectorName);
        }
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!workspace,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) {
        throw new Error("User not authenticated");
      }
      
      // Build documentation with links
      let fullDocumentation = documentation;
      if (links.length > 0) {
        const linksText = links.join("\n");
        fullDocumentation = documentation 
          ? `${documentation}\n\nLinks:\n${linksText}` 
          : `Links:\n${linksText}`;
      }
      
      const taskData = {
        title,
        description: description || null,
        setor: setor || null,
        assigned_to: assignedTo || user.id,
        priority,
        status,
        requires_approval: requiresApproval,
        approval_reviewer_id: requiresApproval ? approvalReviewerId : null,
        approval_status: requiresApproval ? 'pending' : null,
        start_date: startDate || null,
        due_date: dueDate || null,
        documentation: fullDocumentation || null,
        project_id: defaultProjectId || null,
        workspace_id: workspace?.id || null,
      };
      
      const { data, error } = await supabase
        .from("tasks")
        .insert([taskData])
        .select();
        
      if (error) throw error;

      // Add assignee to task_assignees table
      if (data && data[0]) {
        const taskId = data[0].id;
        const assigneeId = assignedTo || user.id;
        
        await supabase
          .from("task_assignees")
          .insert([{ task_id: taskId, user_id: assigneeId }]);

        // Link selected processes
        if (selectedProcesses.length > 0) {
          const processLinks = selectedProcesses.map(processId => ({
            task_id: taskId,
            process_id: processId
          }));
          await supabase.from("task_processes").insert(processLinks);
        }
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-tasks"] });
      toast.success("Tarefa criada com sucesso!");
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
    setSetor("");
    setAssignedTo("");
    setPriority("medium");
    setStatus("todo");
    setRequiresApproval(false);
    setApprovalReviewerId(null);
    setStartDate("");
    setDueDate("");
    setDocumentation("");
    setSelectedProcesses([]);
    setLinks([]);
    setLinkInput("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("O título da tarefa é obrigatório");
      return;
    }
    createMutation.mutate();
  };

  const getSectorName = (sectorId: string) => {
    if (sectorId === "Multiplos") return "Múltiplos";
    return sectors?.find(s => s.id === sectorId)?.name || sectorId;
  };

  const getMemberName = (userId: string) => {
    return workspaceMembers?.find(m => m.user_id === userId)?.profiles?.full_name || "Selecione um responsável";
  };

  const handleAddLink = () => {
    if (linkInput.trim()) {
      setLinks([...links, linkInput.trim()]);
      setLinkInput("");
    }
  };

  const handleRemoveLink = (index: number) => {
    setLinks(links.filter((_, i) => i !== index));
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
          <DialogTitle>Nova Tarefa</DialogTitle>
          <DialogDescription>
            Crie uma tarefa pessoal para você
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
              placeholder="Ex: Criar página inicial"
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

          {/* 3. Setor */}
          <div className="space-y-2">
            <Label>Setor</Label>
            <SectorDrawer 
              value={setor} 
              onValueChange={(value) => {
                setSetor(value);
                setAssignedTo("");
                setSelectedProcesses([]);
              }}
            >
              <Button variant="outline" className="w-full justify-between" type="button">
                <span className="flex items-center gap-2">
                  <Briefcase size={16} />
                  {setor ? getSectorName(setor) : "Selecione um setor"}
                </span>
                <ChevronRight size={16} />
              </Button>
            </SectorDrawer>
          </div>

          {/* 4. Responsável */}
          <div className="space-y-2">
            <Label>Responsável</Label>
            <MemberDrawer 
              value={assignedTo} 
              onValueChange={setAssignedTo}
              positionId={setor === "Multiplos" ? "Multiplos" : (setor || undefined)}
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

          {/* 5. Prioridade */}
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

          {/* 6. Status */}
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

          {/* 7. Aprovação */}
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
                  if (!checked) {
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
                        ? getMemberName(approvalReviewerId)
                        : "Selecionar quem deve aprovar"}
                    </span>
                    <ChevronRight size={16} />
                  </Button>
                </SheetTrigger>
                <SheetContent>
                  <SheetHeader>
                    <SheetTitle>Selecionar Revisor</SheetTitle>
                  </SheetHeader>
                  <ScrollArea className="h-[calc(100vh-120px)] mt-4">
                    <div className="space-y-2">
                      {workspaceMembers?.filter(m => m.user_id !== user?.id).map((member) => (
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
                      ))}
                    </div>
                  </ScrollArea>
                </SheetContent>
              </Sheet>
            )}
          </div>

          {/* 8. Datas */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Data de Início</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Data de Fim (Prazo)</Label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>

          {/* 9. Documentação */}
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
            
            {/* Links */}
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  value={linkInput}
                  onChange={(e) => setLinkInput(e.target.value)}
                  placeholder="Cole um link aqui..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddLink();
                    }
                  }}
                />
                <Button type="button" variant="outline" size="icon" onClick={handleAddLink}>
                  <LinkIcon size={16} />
                </Button>
              </div>
              
              {links.length > 0 && (
                <div className="space-y-1">
                  {links.map((link, index) => (
                    <div key={index} className="flex items-center gap-2 text-sm bg-muted/50 rounded px-2 py-1">
                      <LinkIcon size={12} className="text-muted-foreground flex-shrink-0" />
                      <span className="truncate flex-1">{link}</span>
                      <Button 
                        type="button" 
                        variant="ghost" 
                        size="icon" 
                        className="h-5 w-5"
                        onClick={() => handleRemoveLink(index)}
                      >
                        <X size={12} />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 10. POPs Vinculados */}
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
                          {setor ? "Nenhum processo cadastrado para este setor" : "Selecione um setor primeiro"}
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
              {createMutation.isPending ? "Criando..." : "Criar Tarefa"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
