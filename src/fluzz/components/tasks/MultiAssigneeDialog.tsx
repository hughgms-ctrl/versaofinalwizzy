import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/fluzz/components/ui/dialog";
import { Button } from "@/fluzz/components/ui/button";
import { Checkbox } from "@/fluzz/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/fluzz/components/ui/avatar";
import { ScrollArea } from "@/fluzz/components/ui/scroll-area";
import { Label } from "@/fluzz/components/ui/label";
import { Switch } from "@/fluzz/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/fluzz/components/ui/select";
import { User, Users, Briefcase, UserRoundPlus, Phone } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/fluzz/components/ui/tabs";

interface MultiAssigneeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId: string;
  currentAssignees: { user_id: string }[];
}

export function MultiAssigneeDialog({
  open,
  onOpenChange,
  taskId,
  currentAssignees,
}: MultiAssigneeDialogProps) {
  const { workspace } = useWorkspace();
  const queryClient = useQueryClient();
  
  const [selectedSector, setSelectedSector] = useState<string>("all");
  const [allowMultipleSectors, setAllowMultipleSectors] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<string[]>(
    currentAssignees.map(a => a.user_id)
  );
  const [selectedExternals, setSelectedExternals] = useState<string[]>([]);

  // Fetch current external assignees
  const { data: currentExternalAssignees } = useQuery({
    queryKey: ["task-external-assignees", taskId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_external_assignees")
        .select("participant_id")
        .eq("task_id", taskId);
      if (error) throw error;
      return data?.map(a => a.participant_id) || [];
    },
    enabled: open && !!taskId,
  });

  // Reset selected users when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedUsers(currentAssignees.map(a => a.user_id));
      setSelectedExternals(currentExternalAssignees || []);
    }
  }, [open, currentAssignees, currentExternalAssignees]);

  // Fetch positions/sectors
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
    enabled: !!workspace,
  });

  // Fetch workspace members with their positions
  const { data: workspaceMembers } = useQuery({
    queryKey: ["workspace-members-with-positions", workspace?.id],
    queryFn: async () => {
      if (!workspace) return [];
      const { data: members, error: membersError } = await supabase
        .from("workspace_members")
        .select("id, user_id, role")
        .eq("workspace_id", workspace.id);
      if (membersError) throw membersError;
      if (!members || members.length === 0) return [];

      const userIds = members.map(m => m.user_id);
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, user_id, full_name, avatar_url")
        .in("user_id", userIds);
      if (profilesError) throw profilesError;

      const { data: userPositions, error: positionsError } = await supabase
        .from("user_positions")
        .select("user_id, position_id")
        .in("user_id", userIds);
      if (positionsError) throw positionsError;

      return members.map(member => ({
        ...member,
        profiles: profiles?.find(p => p.user_id === member.user_id) || null,
        positionIds: userPositions
          ?.filter(up => up.user_id === member.user_id)
          .map(up => up.position_id) || [],
      }));
    },
    enabled: !!workspace,
  });

  // Fetch external participants
  const { data: externalParticipants } = useQuery({
    queryKey: ["external-participants", workspace?.id],
    queryFn: async () => {
      if (!workspace) return [];
      const { data, error } = await supabase
        .from("external_participants")
        .select("id, name, phone, email")
        .eq("workspace_id", workspace.id)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!workspace,
  });

  // Filter members based on sector selection
  const filteredMembers = useMemo(() => {
    if (!workspaceMembers) return [];
    if (allowMultipleSectors || selectedSector === "all") return workspaceMembers;
    return workspaceMembers.filter(member => 
      member.positionIds.includes(selectedSector)
    );
  }, [workspaceMembers, selectedSector, allowMultipleSectors]);

  // Mutation to update assignees
  const updateAssigneesMutation = useMutation({
    mutationFn: async ({ userIds, externalIds }: { userIds: string[]; externalIds: string[] }) => {
      // Delete existing internal assignees
      const { error: deleteError } = await supabase
        .from("task_assignees")
        .delete()
        .eq("task_id", taskId);
      if (deleteError) throw deleteError;

      // Insert new internal assignees
      if (userIds.length > 0) {
        const { error: insertError } = await supabase
          .from("task_assignees")
          .insert(userIds.map(userId => ({ task_id: taskId, user_id: userId })));
        if (insertError) throw insertError;
      }

      // Update main assigned_to for backwards compatibility
      const { error: updateError } = await supabase
        .from("tasks")
        .update({ assigned_to: userIds.length > 0 ? userIds[0] : null })
        .eq("id", taskId);
      if (updateError) throw updateError;

      // Delete existing external assignees
      const { error: deleteExtError } = await supabase
        .from("task_external_assignees")
        .delete()
        .eq("task_id", taskId);
      if (deleteExtError) throw deleteExtError;

      // Insert new external assignees
      if (externalIds.length > 0) {
        const { error: insertExtError } = await supabase
          .from("task_external_assignees")
          .insert(externalIds.map(pid => ({ task_id: taskId, participant_id: pid })));
        if (insertExtError) throw insertExtError;
      }

      // Send WhatsApp notifications for newly assigned externals
      const previousExternals = currentExternalAssignees || [];
      const newExternals = externalIds.filter(id => !previousExternals.includes(id));
      
      // Get task workspace_id
      const { data: taskData } = await supabase
        .from("tasks")
        .select("workspace_id")
        .eq("id", taskId)
        .single();

      if (taskData?.workspace_id && newExternals.length > 0) {
        for (const participantId of newExternals) {
          try {
            await supabase.functions.invoke("send-whatsapp-notification", {
              body: {
                workspace_id: taskData.workspace_id,
                participant_id: participantId,
                task_id: taskId,
                message_type: "task_assigned",
              },
            });
          } catch {
            // Don't block assignment if notification fails
          }
        }
      }
    },
    onSuccess: () => {
      toast.success("Responsáveis atualizados!");
      queryClient.invalidateQueries({ queryKey: ["task-assignees"] });
      queryClient.invalidateQueries({ queryKey: ["task-external-assignees"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["my-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["task"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      onOpenChange(false);
    },
    onError: () => {
      toast.error("Erro ao atualizar responsáveis");
    },
  });

  const handleToggleUser = (userId: string) => {
    setSelectedUsers(prev => 
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleToggleExternal = (participantId: string) => {
    setSelectedExternals(prev => 
      prev.includes(participantId) ? prev.filter(id => id !== participantId) : [...prev, participantId]
    );
  };

  const handleSave = () => {
    updateAssigneesMutation.mutate({ userIds: selectedUsers, externalIds: selectedExternals });
  };

  const getInitials = (name: string | null) => {
    if (!name) return null;
    return name.charAt(0).toUpperCase();
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "admin": return "Administrador";
      case "gestor": return "Gestor";
      case "membro": return "Membro";
      default: return role;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users size={18} />
            Gerenciar Responsáveis
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="members" className="w-full">
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="members" className="gap-1">
              <Users className="h-3.5 w-3.5" />
              Equipe ({selectedUsers.length})
            </TabsTrigger>
            <TabsTrigger value="external" className="gap-1">
              <UserRoundPlus className="h-3.5 w-3.5" />
              Externos ({selectedExternals.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="members" className="space-y-4 mt-4">
            {/* Sector filter */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Filtrar por setor</Label>
                <div className="flex items-center gap-2">
                  <Switch
                    id="multi-sector"
                    checked={allowMultipleSectors}
                    onCheckedChange={(checked) => {
                      setAllowMultipleSectors(checked);
                      if (checked) setSelectedSector("all");
                    }}
                  />
                  <Label htmlFor="multi-sector" className="text-xs text-muted-foreground cursor-pointer">
                    Múltiplos setores
                  </Label>
                </div>
              </div>
              
              {!allowMultipleSectors && (
                <Select value={selectedSector} onValueChange={setSelectedSector}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um setor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      <div className="flex items-center gap-2">
                        <Users size={14} />
                        Todos os setores
                      </div>
                    </SelectItem>
                    {positions?.map(position => (
                      <SelectItem key={position.id} value={position.id}>
                        <div className="flex items-center gap-2">
                          <Briefcase size={14} />
                          {position.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Members list */}
            <div className="border rounded-lg">
              <ScrollArea className="h-[280px]">
                <div className="p-2 space-y-1">
                  {filteredMembers.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Nenhum membro encontrado neste setor
                    </p>
                  ) : (
                    filteredMembers.map(member => {
                      const profile = member.profiles as any;
                      const isSelected = selectedUsers.includes(member.user_id);
                      
                      return (
                        <label
                          key={member.user_id}
                          className={`flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors ${
                            isSelected ? "bg-primary/10" : "hover:bg-muted"
                          }`}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => handleToggleUser(member.user_id)}
                          />
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={profile?.avatar_url} />
                            <AvatarFallback className="bg-primary/10 text-primary text-sm">
                              {getInitials(profile?.full_name) || <User className="h-3 w-3" />}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {profile?.full_name || "Usuário"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {getRoleLabel(member.role)}
                            </p>
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </div>
          </TabsContent>

          <TabsContent value="external" className="space-y-4 mt-4">
            <div className="border rounded-lg">
              <ScrollArea className="h-[320px]">
                <div className="p-2 space-y-1">
                  {!externalParticipants || externalParticipants.length === 0 ? (
                    <div className="text-center py-8">
                      <UserRoundPlus className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">
                        Nenhum participante externo cadastrado
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Cadastre participantes em Workspace → Participantes
                      </p>
                    </div>
                  ) : (
                    externalParticipants.map(participant => {
                      const isSelected = selectedExternals.includes(participant.id);
                      return (
                        <label
                          key={participant.id}
                          className={`flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors ${
                            isSelected ? "bg-primary/10" : "hover:bg-muted"
                          }`}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => handleToggleExternal(participant.id)}
                          />
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="bg-accent text-accent-foreground text-sm">
                              {participant.name.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{participant.name}</p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {participant.phone}
                            </p>
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </div>
          </TabsContent>
        </Tabs>

        {/* Selected count */}
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {selectedUsers.length + selectedExternals.length} responsável(is) selecionado(s)
            {selectedExternals.length > 0 && ` (${selectedExternals.length} externo${selectedExternals.length > 1 ? 's' : ''})`}
          </span>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSave}
            disabled={updateAssigneesMutation.isPending}
          >
            {updateAssigneesMutation.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
