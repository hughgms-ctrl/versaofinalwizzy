import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { useAuth } from "@/fluzz/contexts/AuthContext";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";
import { Button } from "@/fluzz/components/ui/button";
import { Input } from "@/fluzz/components/ui/input";
import { Label } from "@/fluzz/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/fluzz/components/ui/card";
import { toast } from "sonner";
import { Building2 } from "lucide-react";

const ONBOARDING_COMPLETED_KEY = "fluzz_onboarding_completed";

export default function WorkspaceSetup() {
  const { user } = useAuth();
  const { workspaces, loading: workspaceLoading, changeWorkspace } = useWorkspace();
  const navigate = useNavigate();

  const [workspaceName, setWorkspaceName] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  const markOnboardingComplete = () => {
    if (!user) return;
    localStorage.setItem(`${ONBOARDING_COMPLETED_KEY}_${user.id}`, "true");
  };

  useEffect(() => {
    if (!user) return;
    if (workspaceLoading) return;

    // Regra: se o usuário já tem qualquer workspace, não deve ver esta tela.
    if (workspaces.length > 0) {
      markOnboardingComplete();
      navigate("/tools/wizzy-flow/my-tasks", { replace: true });
      return;
    }

    setChecking(false);
  }, [user, workspaceLoading, workspaces.length, navigate]);

  if (!user) return <Navigate to="/tools/wizzy-flow/auth" replace />;

  if (workspaceLoading || checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!workspaceName.trim()) {
      toast.error("Digite um nome para o workspace");
      return;
    }

    setLoading(true);

    try {
      // Criar workspace
      const { data: workspace, error: workspaceError } = await supabase
        .from("workspaces")
        .insert({
          name: workspaceName.trim(),
          created_by: user.id,
        })
        .select()
        .single();

      if (workspaceError) throw workspaceError;

      // Adicionar usuário como admin do workspace
      const { error: memberError } = await supabase.from("workspace_members").insert({
        workspace_id: workspace.id,
        user_id: user.id,
        role: "admin",
      });

      if (memberError) throw memberError;

      markOnboardingComplete();

      toast.success("Workspace criado com sucesso!");
      await changeWorkspace(workspace.id);
      navigate("/tools/wizzy-flow/my-tasks", { replace: true });
    } catch (error) {
      console.error("Erro ao criar workspace:", error);
      toast.error("Erro ao criar workspace");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">Criar workspace</CardTitle>
          <CardDescription>Configure seu workspace para começar a usar o Wizzy Flow</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateWorkspace} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="workspace-name">Nome do Workspace</Label>
              <Input
                id="workspace-name"
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                placeholder="Ex: Minha Empresa"
                required
              />
              <p className="text-xs text-muted-foreground">Este será o nome da sua empresa ou equipe</p>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Criando..." : "Criar Workspace"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
