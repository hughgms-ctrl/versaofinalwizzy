import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { useAuth } from "@/fluzz/contexts/AuthContext";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/fluzz/components/ui/sheet";
import { Button } from "@/fluzz/components/ui/button";
import { Badge } from "@/fluzz/components/ui/badge";
import { Avatar, AvatarFallback } from "@/fluzz/components/ui/avatar";
import { User } from "lucide-react";
import { ScrollArea } from "@/fluzz/components/ui/scroll-area";

interface MemberDrawerProps {
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
  positionId?: string; // Optional: filter by position
}

export const MemberDrawer = ({ value, onValueChange, children, positionId }: MemberDrawerProps) => {
  const { workspace } = useWorkspace();
  const { user } = useAuth();

  // Validate if positionId is a valid UUID
  const isValidUUID = (id?: string) => {
    if (!id) return false;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(id);
  };

  // "Multiplos" means show all members from all sectors
  const isMultipleSectors = positionId === "Multiplos";
  const validPositionId = isValidUUID(positionId) ? positionId : undefined;

  const { data: workspaceMembers, isLoading } = useQuery({
    queryKey: ["workspace-members-drawer", workspace?.id, validPositionId, isMultipleSectors],
    queryFn: async () => {
      if (!workspace?.id) return [];

      const fallbackCurrentUser = async () => {
        if (!user?.id) return [];
        const { data: profile } = await supabase
          .from("profiles")
          .select("id, user_id, full_name, avatar_url")
          .eq("user_id", user.id)
          .maybeSingle();

        return [{
          user_id: user.id,
          role: "admin",
          profile: profile || { id: user.id, full_name: user.email || "Voce", avatar_url: null },
        }];
      };
      
      // Fetch workspace members with profiles
      const { data: members, error: membersError } = await supabase
        .from("workspace_members")
        .select("user_id, role")
        .eq("workspace_id", workspace.id);
      
      if (membersError) {
        console.warn("Erro ao buscar membros do workspace:", membersError);
        return fallbackCurrentUser();
      }
      if (!members || members.length === 0) return fallbackCurrentUser();

      let userIds = members.map(m => m.user_id);

      // If positionId is provided and valid (and not "multiple"), filter by users assigned to that position
      if (validPositionId && !isMultipleSectors) {
        const { data: userPositions, error: positionsError } = await supabase
          .from("user_positions")
          .select("user_id")
          .eq("position_id", validPositionId);
        
        if (positionsError) throw positionsError;
        
        if (userPositions && userPositions.length > 0) {
          const positionUserIds = userPositions.map(up => up.user_id);
          userIds = userIds.filter(uid => positionUserIds.includes(uid));
        } else {
          return fallbackCurrentUser();
        }
      }
      // If isMultipleSectors is true, we keep all userIds (no filtering)

      // Fetch profiles for filtered users
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, user_id, full_name, avatar_url")
        .in("user_id", userIds);

      if (profilesError) {
        console.warn("Erro ao buscar perfis dos membros:", profilesError);
        return fallbackCurrentUser();
      }

      // Combine data
      return members
        .filter(m => userIds.includes(m.user_id))
        .map(member => ({
          user_id: member.user_id,
          role: member.role,
          profile: profiles?.find(p => p.user_id === member.user_id)
        }));
    },
    enabled: !!workspace?.id,
  });

  const selectedMember = workspaceMembers?.find(m => m.user_id === value);

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      admin: "Administrador",
      gestor: "Gestor",
      membro: "Membro"
    };
    return labels[role] || role;
  };

  const getInitials = (name: string) => {
    if (!name) return "?";
    const parts = name.split(" ");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        {children}
      </SheetTrigger>
      <SheetContent side="bottom" className="h-[80vh]">
        <SheetHeader>
          <SheetTitle>Selecionar Responsável</SheetTitle>
          <SheetDescription>
            Escolha o membro da equipe responsável por esta tarefa
          </SheetDescription>
        </SheetHeader>
        
        <ScrollArea className="h-[calc(80vh-120px)] mt-4">
          <div className="space-y-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              </div>
            ) : workspaceMembers && workspaceMembers.length > 0 ? (
              workspaceMembers.map((member) => (
                <Button
                  key={member.user_id}
                  variant={value === member.user_id ? "default" : "outline"}
                  className="w-full justify-between h-auto py-4"
                  onClick={() => {
                    onValueChange(member.user_id);
                    // Close drawer after selection
                    document.querySelector('[data-radix-dialog-close]')?.dispatchEvent(
                      new Event('click', { bubbles: true })
                    );
                  }}
                >
                  <div className="flex items-center gap-3 flex-1 text-left">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback>
                        {getInitials(member.profile?.full_name || "")}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-semibold">
                        {member.profile?.full_name || "Sem nome"}
                      </div>
                      <div className="text-xs text-muted-foreground font-normal">
                        {getRoleLabel(member.role)}
                      </div>
                    </div>
                  </div>
                  {value === member.user_id && (
                    <Badge variant="secondary" className="ml-2">Selecionado</Badge>
                  )}
                </Button>
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <User size={48} className="mx-auto mb-4 opacity-20" />
                <p>
                  {validPositionId 
                    ? "Nenhum membro atribuído a este setor"
                    : "Nenhum membro na equipe"
                  }
                </p>
              </div>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};
