import { AppLayout } from "@/fluzz/components/layout/AppLayout";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/fluzz/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/fluzz/components/ui/avatar";
import { Badge } from "@/fluzz/components/ui/badge";
import { Button } from "@/fluzz/components/ui/button";
import { Navigate, useNavigate } from "react-router-dom";
import { ChevronRight, UserPlus } from "lucide-react";
import { useState } from "react";
import { InviteMemberDialog } from "@/fluzz/components/team/InviteMemberDialog";

interface WorkspaceMemberWithProfile {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
  invited_by: string | null;
  email?: string | null;
  profiles: {
    full_name: string | null;
    avatar_url: string | null;
  } | null;
  inviter_profile?: {
    full_name: string | null;
  } | null;
}

export default function TeamManagement() {
  const { workspace, isAdmin, isGestor } = useWorkspace();
  const navigate = useNavigate();
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);

  const { data: members, isLoading: membersLoading } = useQuery({
    queryKey: ["team-members", workspace?.id],
    queryFn: async () => {
      if (!workspace?.id) return [];
      
      const { data: membersData, error: membersError } = await supabase
        .from("workspace_members")
        .select("id, user_id, role, created_at, invited_by")
        .eq("workspace_id", workspace.id);

      if (membersError) throw membersError;

      // Fetch profiles for members
      // profiles.id é a chave própria da tabela; o vínculo com o usuário autenticado
      // é profiles.user_id, então o filtro/match precisa usar essa coluna.
      const userIds = membersData?.map(m => m.user_id) || [];
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("id, user_id, full_name, avatar_url")
        .in("user_id", userIds);

      // For users without profiles, try to get their email from invites
      const usersWithoutProfiles = userIds.filter(
        userId => !profilesData?.find(p => p.user_id === userId)?.full_name
      );

      // Get emails from workspace_invites for users without profiles
      let emailMap: Record<string, string> = {};
      if (usersWithoutProfiles.length > 0) {
        const { data: invitesWithEmails } = await supabase
          .from("workspace_invites")
          .select("email")
          .eq("workspace_id", workspace.id)
          .eq("accepted", true);
        
        // Also check if there are any users we need to create profiles for
        // by using the get_user_by_email function or just display email
        if (invitesWithEmails) {
          for (const invite of invitesWithEmails) {
            // Try to match with user_id via profile creation
            const { data: userData } = await supabase
              .rpc("get_user_by_email", { _email: invite.email });
            
            if (userData && userData.length > 0) {
              const userId = userData[0].user_id;
              if (usersWithoutProfiles.includes(userId)) {
                emailMap[userId] = invite.email;

                // Try to create a profile for this user if missing
                const existingProfile = profilesData?.find(p => p.user_id === userId);
                if (!existingProfile) {
                  // Create profile with email as fallback name
                  await supabase
                    .from("profiles")
                    .upsert({
                      user_id: userId,
                      full_name: invite.email.split('@')[0], // Use email prefix as fallback
                    }, { onConflict: 'user_id' });
                }
              }
            }
          }
        }
      }

      // Fetch profiles for inviters
      const inviterIds = membersData?.map(m => m.invited_by).filter(Boolean) || [];
      const { data: inviterProfilesData } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", inviterIds);

      // Re-fetch profiles after potential upserts
      const { data: updatedProfilesData } = await supabase
        .from("profiles")
        .select("id, user_id, full_name, avatar_url")
        .in("user_id", userIds);

      // Merge data
      const result = membersData?.map(member => {
        const profile = updatedProfilesData?.find(p => p.user_id === member.user_id);
        return {
          ...member,
          profiles: profile || null,
          email: emailMap[member.user_id] || null,
          inviter_profile: member.invited_by
            ? inviterProfilesData?.find(p => p.user_id === member.invited_by) || null
            : null
        };
      }) || [];

      return result as WorkspaceMemberWithProfile[];
    },
    enabled: !!workspace?.id,
  });

  const { data: pendingInvites, isLoading: invitesLoading } = useQuery({
    queryKey: ["pending-invites", workspace?.id],
    queryFn: async () => {
      if (!workspace?.id) return [];
      
      const { data, error } = await supabase
        .from("workspace_invites")
        .select("id, email, role, created_at, invited_by, expires_at, accepted")
        .eq("workspace_id", workspace.id)
        .eq("accepted", false)
        .gt("expires_at", new Date().toISOString());

      if (error) throw error;

      // Fetch inviter profiles
      const inviterIds = data?.map(i => i.invited_by).filter(Boolean) || [];
      const { data: inviterProfiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", inviterIds);

      return data?.map(invite => ({
        ...invite,
        inviter_profile: invite.invited_by
          ? inviterProfiles?.find(p => p.user_id === invite.invited_by) || null
          : null
      })) || [];
    },
    enabled: !!workspace?.id,
  });


  if (!isAdmin && !isGestor) {
    return <Navigate to="/tools/wizzy-flow/my-tasks" replace />;
  }

  if (membersLoading || invitesLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4" />
            <p className="text-muted-foreground">Carregando equipe...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Gestão de Equipe</h1>
            <p className="text-sm md:text-base text-muted-foreground mt-1 sm:mt-2">
              Clique em um membro para gerenciar suas permissões
            </p>
          </div>
          {isAdmin && (
            <Button onClick={() => setIsInviteDialogOpen(true)} size="sm" className="w-full sm:w-auto">
              <UserPlus className="mr-1 sm:mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Adicionar Membro</span>
              <span className="sm:hidden">Adicionar</span>
            </Button>
          )}
        </div>

        {pendingInvites && pendingInvites.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">Convites Pendentes</h2>
            <div className="grid gap-3">
              {pendingInvites.map((invite) => {
                const initials = invite.email.substring(0, 2).toUpperCase();
                const invitedAt = new Date(invite.created_at).toLocaleDateString('pt-BR', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric'
                });
                const expiresAt = new Date(invite.expires_at).toLocaleDateString('pt-BR', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric'
                });

                return (
                  <Card key={invite.id} className="border-dashed">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4 flex-1">
                          <Avatar>
                            <AvatarFallback className="bg-muted">{initials}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <h3 className="font-medium text-foreground">{invite.email}</h3>
                            <div className="flex flex-wrap items-center gap-2 mt-1">
                              <Badge variant="outline">{invite.role}</Badge>
                              <span className="text-xs text-muted-foreground">
                                Aguardando aceitação
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-muted-foreground">
                              <span>Convidado em {invitedAt}</span>
                              <span>•</span>
                              <span>Expira em {expiresAt}</span>
                            </div>
                            {invite.inviter_profile && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Convidado por {invite.inviter_profile.full_name}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        <div className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">Membros Ativos</h2>
          <div className="grid gap-3">
            {members?.map((member) => {
              const displayName = member.profiles?.full_name || member.email || "Usuário";
              const initials = displayName
                .split(" ")
                .map((n) => n[0])
                .join("")
                .toUpperCase()
                .slice(0, 2) || "?";

              const memberSince = new Date(member.created_at).toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: 'short',
                year: 'numeric'
              });

              return (
                <Card 
                  key={member.id} 
                  className="cursor-pointer hover:bg-accent/50 transition-colors"
                  onClick={() => navigate(`/tools/wizzy-flow/team/${member.user_id}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 flex-1">
                        <Avatar>
                          <AvatarImage 
                            src={member.profiles?.avatar_url || ""} 
                            className="object-cover"
                          />
                          <AvatarFallback>{initials}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <h3 className="font-medium text-foreground">
                            {displayName}
                          </h3>
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            <Badge variant={member.role === "admin" ? "default" : "secondary"}>
                              {member.role}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              Membro desde {memberSince}
                            </span>
                          </div>
                          {member.invited_by && member.inviter_profile && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Convidado por {member.inviter_profile.full_name}
                            </p>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>

      <InviteMemberDialog
        open={isInviteDialogOpen}
        onOpenChange={setIsInviteDialogOpen}
      />
    </AppLayout>
  );
}
