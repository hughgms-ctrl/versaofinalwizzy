import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/fluzz/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/fluzz/components/ui/avatar";
import { Badge } from "@/fluzz/components/ui/badge";
import { User } from "lucide-react";

interface ProjectMembersProps {
  projectId: string;
}

export const ProjectMembers = ({ projectId }: ProjectMembersProps) => {
  const { data: membersData } = useQuery({
    queryKey: ["project-members", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_members")
        .select("*")
        .eq("project_id", projectId);
      if (error) throw error;
      return data;
    },
  });

  const { data: profiles } = useQuery({
    queryKey: ["member-profiles", membersData],
    enabled: !!membersData && membersData.length > 0,
    queryFn: async () => {
      if (!membersData) return [];
      const userIds = membersData.map(m => m.user_id);
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", userIds);
      return data || [];
    },
  });

  const { data: projectData } = useQuery({
    queryKey: ["project-with-owner", projectId],
    queryFn: async () => {
      const { data: proj, error } = await supabase
        .from("projects")
        .select("*")
        .eq("id", projectId)
        .single();
      if (error) throw error;
      
      const { data: ownerProfile } = await supabase
        .from("profiles")
        .select("full_name, avatar_url")
        .eq("id", proj.user_id)
        .maybeSingle();
      
      return { project: proj, ownerProfile };
    },
  });

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Membros da Equipe</CardTitle>
          <CardDescription>
            Colaboradores deste projeto
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Project Owner */}
          {projectData?.project && (
            <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
              <div className="flex items-center gap-3">
                <Avatar>
                  <AvatarImage src={projectData.ownerProfile?.avatar_url || ""} className="object-cover" />
                  <AvatarFallback>
                    <User size={16} />
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{projectData.ownerProfile?.full_name || "Sem nome"}</p>
                  <p className="text-xs text-muted-foreground">Proprietário</p>
                </div>
              </div>
              <Badge>Dono</Badge>
            </div>
          )}

          {/* Members */}
          {membersData?.map((member) => {
            const profile = profiles?.find(p => p.id === member.user_id);
            return (
              <div
                key={member.id}
                className="flex items-center justify-between p-3 rounded-lg border"
              >
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarImage src={profile?.avatar_url || ""} className="object-cover" />
                    <AvatarFallback>
                      <User size={16} />
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{profile?.full_name || "Sem nome"}</p>
                    <p className="text-xs text-muted-foreground">Membro</p>
                  </div>
                </div>
              </div>
            );
          })}

          {!membersData?.length && (
            <p className="text-center text-muted-foreground py-8">
              Nenhum membro adicional neste projeto
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};