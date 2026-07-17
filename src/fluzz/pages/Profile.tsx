import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { useAuth } from "@/fluzz/contexts/AuthContext";
import { AppLayout } from "@/fluzz/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/fluzz/components/ui/card";
import { Button } from "@/fluzz/components/ui/button";
import { Input } from "@/fluzz/components/ui/input";
import { Label } from "@/fluzz/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/fluzz/components/ui/avatar";
import { toast } from "sonner";
import { Camera, Save, Mail, User as UserIcon, Building2, ArrowRight, Plus, Smartphone } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/fluzz/components/ui/dialog";
import { PushNotificationSettings } from "@/fluzz/components/notifications/PushNotificationSettings";
import { UserSubscriptionPanel } from "@/fluzz/components/subscription/UserSubscriptionPanel";

export default function Profile() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      if (!user?.id) {
        throw new Error("Usuário não autenticado");
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;

      // Se não existir perfil, cria um registro básico para este usuário
      if (!data) {
        const { data: inserted, error: insertError } = await supabase
          .from("profiles")
          .insert({
            user_id: user.id,
            full_name: (user.user_metadata as any)?.full_name || "",
          })
          .select("*")
          .single();

        if (insertError) throw insertError;

        setFullName(inserted.full_name || "");
        return inserted;
      }

      setFullName(data.full_name || "");
      return data;
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async () => {
      let avatarUrl = profile?.avatar_url;

      // Upload avatar if changed
      if (avatarFile) {
        const fileExt = avatarFile.name.split(".").pop();
        const fileName = `${user!.id}-${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(fileName, avatarFile, { upsert: true });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from("avatars")
          .getPublicUrl(fileName);
        
        avatarUrl = urlData.publicUrl;
      }

      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName,
          avatar_url: avatarUrl,
        })
        .eq("user_id", user!.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile", user?.id] });
      toast.success("Perfil atualizado com sucesso!");
      setAvatarFile(null);
      setAvatarPreview(null);
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar perfil");
    },
  });

  const createWorkspaceMutation = useMutation({
    mutationFn: async () => {
      if (!newWorkspaceName.trim()) {
        throw new Error("Nome do workspace é obrigatório");
      }

      // Create workspace
      const { data: workspace, error: wsError } = await supabase
        .from("workspaces")
        .insert({ name: newWorkspaceName.trim(), created_by: user!.id })
        .select()
        .single();

      if (wsError) throw wsError;

      // Add user as admin of the workspace
      const { error: memberError } = await supabase
        .from("workspace_members")
        .insert({
          workspace_id: workspace.id,
          user_id: user!.id,
          role: "admin",
        });

      if (memberError) throw memberError;

      return workspace;
    },
    onSuccess: (workspace) => {
      toast.success("Workspace criado com sucesso!");
      setNewWorkspaceName("");
      setIsCreateDialogOpen(false);
      navigate(`/tools/wizzy-flow/workspaces`);
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao criar workspace");
    },
  });

  const handleCreateWorkspace = (e: React.FormEvent) => {
    e.preventDefault();
    createWorkspaceMutation.mutate();
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAvatarFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfileMutation.mutate();
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

  return (
    <AppLayout>
      <div className="space-y-4 sm:space-y-6 max-w-2xl">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">Perfil</h1>
          <p className="text-sm md:text-base text-muted-foreground mt-1">
            Gerencie suas informações pessoais
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Informações do Perfil</CardTitle>
            <CardDescription>
              Atualize seus dados pessoais e avatar
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="flex items-center gap-6">
                <Avatar className="h-24 w-24">
                  <AvatarImage 
                    src={avatarPreview || profile?.avatar_url || ""} 
                    className="object-cover"
                  />
                  <AvatarFallback>
                    <UserIcon className="h-12 w-12" />
                  </AvatarFallback>
                </Avatar>
                <div>
                  <Label
                    htmlFor="avatar"
                    className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-md transition-colors"
                  >
                    <Camera size={16} />
                    Alterar Foto
                  </Label>
                  <Input
                    id="avatar"
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarChange}
                    className="hidden"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    JPG, PNG ou GIF. Máx 2MB
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="fullName">Nome Completo</Label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Seu nome completo"
                    className="pl-9"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    value={user?.email || ""}
                    disabled
                    className="pl-9 bg-muted"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  O email não pode ser alterado
                </p>
              </div>

              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={updateProfileMutation.isPending}
                  className="gap-2"
                >
                  <Save size={16} />
                  {updateProfileMutation.isPending ? "Salvando..." : "Salvar Alterações"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Workspaces</CardTitle>
            <CardDescription>
              Gerencie seus workspaces e permissões
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button className="w-full gap-2">
                  <Plus className="h-4 w-4" />
                  Criar Novo Workspace
                </Button>
              </DialogTrigger>
              <DialogContent>
                <form onSubmit={handleCreateWorkspace}>
                  <DialogHeader>
                    <DialogTitle>Criar Novo Workspace</DialogTitle>
                    <DialogDescription>
                      Crie um novo workspace para organizar seus projetos e equipe.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="py-4">
                    <Label htmlFor="workspaceName">Nome do Workspace</Label>
                    <Input
                      id="workspaceName"
                      value={newWorkspaceName}
                      onChange={(e) => setNewWorkspaceName(e.target.value)}
                      placeholder="Ex: Minha Empresa"
                      className="mt-2"
                      autoFocus
                    />
                  </div>
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsCreateDialogOpen(false)}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="submit"
                      disabled={createWorkspaceMutation.isPending || !newWorkspaceName.trim()}
                    >
                      {createWorkspaceMutation.isPending ? "Criando..." : "Criar Workspace"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>

            <Button
              variant="outline"
              className="w-full justify-between"
              onClick={() => navigate("/tools/wizzy-flow/workspaces")}
            >
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                <span>Gerenciar Meus Workspaces</span>
              </div>
              <ArrowRight className="h-4 w-4" />
            </Button>
            <p className="text-xs text-muted-foreground">
              Veja todos os workspaces, saia ou exclua workspaces dos quais você é proprietário
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5" />
              Instalar Aplicativo
            </CardTitle>
            <CardDescription>
              Instale o Fluzz na sua tela inicial para acesso rápido e notificações push.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              className="w-full gap-2" 
              onClick={() => navigate('/install')}
            >
              <Smartphone className="h-4 w-4" />
              Instalar na Tela Inicial
            </Button>
          </CardContent>
        </Card>

        <PushNotificationSettings />

        <UserSubscriptionPanel />
      </div>
    </AppLayout>
  );
}
