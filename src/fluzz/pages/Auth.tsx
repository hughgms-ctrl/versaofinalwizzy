import { useState, useEffect } from "react";
import { useAuth } from "@/fluzz/contexts/AuthContext";
import { Navigate, useNavigate, useSearchParams, Link } from "react-router-dom";
import { Button } from "@/fluzz/components/ui/button";
import { Input } from "@/fluzz/components/ui/input";
import { Label } from "@/fluzz/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/fluzz/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/fluzz/components/ui/tabs";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { toast } from "sonner";
import { Separator } from "@/fluzz/components/ui/separator";
export default function Auth() {
  const {
    user,
    loading,
    signUp,
    signIn
  } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [inviteData, setInviteData] = useState<any>(null);
  const [isInvitedUser, setIsInvitedUser] = useState(false);
  const [newPassword, setNewPassword] = useState("");

  // Login form state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Signup form state
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupFullName, setSignupFullName] = useState("");

  // ============================================================
  // 🔥 PROCESS INVITE - Backend trigger já processa automaticamente
  // Esta função serve como fallback caso o trigger não funcione
  // ============================================================
  const processInvite = async () => {
    try {
      const {
        data: {
          user: currentUser
        }
      } = await supabase.auth.getUser();
      if (!currentUser) return;

      // Verificar se já foi processado pelo trigger do backend
      const {
        data: existingMember
      } = await supabase.from("workspace_members").select("id").eq("workspace_id", inviteData.workspace_id).eq("user_id", currentUser.id).maybeSingle();
      if (existingMember) {
        console.log("Convite já foi processado pelo backend trigger");
        return; // Já foi processado
      }

      // Fallback: processar manualmente se o trigger não funcionou
      console.log("Processando convite manualmente (fallback)");

      // Add user to workspace
      const {
        error: memberError
      } = await supabase.from("workspace_members").insert({
        workspace_id: inviteData.workspace_id,
        user_id: currentUser.id,
        role: inviteData.role,
        invited_by: inviteData.invited_by
      });
      if (memberError && !memberError.message.includes("duplicate")) {
        throw memberError;
      }

      // Set permissions if not admin
      if (inviteData.role !== "admin" && inviteData.permissions) {
        const {
          error: permError
        } = await supabase.from("wizzy_flow_user_permissions").insert({
          workspace_id: inviteData.workspace_id,
          user_id: currentUser.id,
          ...inviteData.permissions
        });
        if (permError && !permError.message.includes("duplicate")) {
          throw permError;
        }
      }

      // Mark invite as accepted
      await supabase.from("workspace_invites").update({
        accepted: true
      }).eq("token", inviteToken);

      // Create welcome notification
      await supabase.from("notifications").insert({
        user_id: currentUser.id,
        workspace_id: inviteData.workspace_id,
        type: "workspace_invite",
        title: `Bem-vindo ao ${(inviteData.workspaces as any)?.name || "workspace"}!`,
        message: `Você agora faz parte do workspace como ${inviteData.role === "admin" ? "Administrador" : inviteData.role === "gestor" ? "Gestor" : "Membro"}.`,
        link: "/",
        data: inviteData
      });
      toast.success("Bem-vindo ao workspace!");
    } catch (error) {
      console.error("Erro ao processar convite:", error);
      // Não mostra erro se já foi processado
      if (error && !String(error).includes("duplicate")) {
        toast.error("Erro ao processar convite");
      }
    }
  };

  // ============================================================
  // CHECK INVITE
  // ============================================================
  useEffect(() => {
    const checkInvitedUser = async () => {
      const {
        data: {
          user: currentUser
        }
      } = await supabase.auth.getUser();
      const token = searchParams.get("invite");
      if (currentUser && token) {
        setIsInvitedUser(true);
        setInviteToken(token);
        loadInviteData(token);
      } else if (token) {
        setInviteToken(token);
        loadInviteData(token);
      }
    };
    checkInvitedUser();
  }, [searchParams]);
  const loadInviteData = async (token: string) => {
    try {
      const {
        data,
        error
      } = await supabase.from("workspace_invites").select("*, workspaces(name)").eq("token", token).eq("accepted", false).gt("expires_at", new Date().toISOString()).single();
      if (error) throw error;
      if (data) {
        setInviteData(data);
        setSignupEmail(data.email);
        toast.info(`Convite para ${(data.workspaces as any).name}`);
      } else {
        toast.error("Convite inválido ou expirado");
      }
    } catch (error) {
      console.error("Erro ao carregar convite:", error);
      toast.error("Erro ao carregar convite");
    }
  };

  // ============================================================
  // LOADING SCREEN
  // ============================================================
  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>;
  }

  // ============================================================
  // INVITED USER SET PASSWORD SCREEN
  // ============================================================
  if (user && isInvitedUser) {
    const handleSetPassword = async (e: React.FormEvent) => {
      e.preventDefault();
      setIsLoading(true);
      try {
        const {
          error
        } = await supabase.auth.updateUser({
          password: newPassword
        });
        if (error) throw error;

        // Aguardar processamento do trigger do backend
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Chamar processInvite como fallback
        await processInvite();
        toast.success("Senha definida! Aguarde...");

        // Aguardar mais tempo para garantir workspace_members
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Limpar o estado de convite antes de redirecionar
        setIsInvitedUser(false);
        setInviteToken(null);
        setInviteData(null);

         // Ir para a home sem recarregar a página (evita perder conteúdo em edição)
         navigate("/tools/wizzy-flow/", { replace: true });
      } catch (error: any) {
        console.error("Erro ao definir senha:", error);
        toast.error(error.message || "Erro ao definir senha");
      } finally {
        setIsLoading(false);
      }
    };
    return <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-muted/20 to-background p-4">
        <Card className="w-full max-w-md shadow-lg animate-fade-in">
          <CardHeader className="space-y-1 text-center">
            <CardTitle className="text-3xl font-bold text-primary">Defina sua Senha</CardTitle>
            <CardDescription>
              {inviteData ? `Convite para ${(inviteData.workspaces as any)?.name}` : "Crie uma senha para acessar sua conta"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSetPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">Nova Senha</Label>
                <Input id="new-password" type="password" placeholder="••••••••" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={6} />
                <p className="text-xs text-muted-foreground">Mínimo de 6 caracteres</p>
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Definindo senha..." : "Definir Senha e Entrar"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>;
  }

  // ============================================================
  // AUTHENTICATED → REDIRECT
  // ============================================================
  if (user) {
    return <Navigate to="/tools/wizzy-flow/" replace />;
  }

  // ============================================================
  // LOGIN
  // ============================================================
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await signIn(loginEmail, loginPassword);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  // ============================================================
  // GOOGLE LOGIN
  // ============================================================
  const handleGoogleLogin = async () => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/`,
          queryParams: {
            // Evita "grudar" em uma conta Google (ex.: corporativa) e cair em 403.
            prompt: "select_account",
          },
        },
      });
      if (error) throw error;
    } catch (error: any) {
      console.error("Erro no login com Google:", error);
      toast.error(error.message || "Erro ao fazer login com Google");
      setIsLoading(false);
    }
  };

  // ============================================================
  // SIGNUP
  // ============================================================
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await signUp(signupEmail, signupPassword, signupFullName);
      if (inviteToken && inviteData) {
        setTimeout(async () => {
          await processInvite();
        }, 2000);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  // ============================================================
  // AUTH PAGE UI
  // ============================================================
  return <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-muted/20 to-background p-4">
      <Card className="w-full max-w-md shadow-lg animate-fade-in">
        <CardHeader className="space-y-1 text-center">
          <img src="/favicon.png" alt="Fluzz Logo" className="w-16 h-16 mx-auto mb-2" />
          <CardTitle className="text-3xl font-bold text-primary">Fluzz</CardTitle>
          <CardDescription>
            {inviteData ? `Você foi convidado para ${(inviteData.workspaces as any).name}` : "Gerenciamento de projetos simplificado"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue={inviteToken ? "signup" : "login"} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Login</TabsTrigger>
              <TabsTrigger value="signup">Cadastro</TabsTrigger>
            </TabsList>

            {/* LOGIN */}
            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <Input 
                    id="login-email" 
                    type="email" 
                    inputMode="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    placeholder="seu@email.com" 
                    value={loginEmail} 
                    onChange={e => setLoginEmail(e.target.value)} 
                    required 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Senha</Label>
                  <Input 
                    id="login-password" 
                    type="password" 
                    autoComplete="current-password"
                    placeholder="••••••••" 
                    value={loginPassword} 
                    onChange={e => setLoginPassword(e.target.value)} 
                    required 
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? "Entrando..." : "Entrar"}
                </Button>

                <div className="relative my-4">
                  <Separator />
                  <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
                    ou continue com
                  </span>
                </div>

                <Button 
                  type="button" 
                  variant="outline" 
                  className="w-full flex items-center gap-2" 
                  onClick={handleGoogleLogin}
                  disabled={isLoading}
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24">
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      fill="#EA4335"
                    />
                  </svg>
                  Continuar com Google
                </Button>

                <div className="text-center">
                  <Link to="/tools/wizzy-flow/forgot-password">
                    <Button type="button" variant="link" className="text-sm">
                      Esqueceu a senha?
                    </Button>
                  </Link>
                </div>
              </form>
            </TabsContent>

            {/* SIGNUP */}
            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-name">Nome completo</Label>
                  <Input id="signup-name" type="text" placeholder="João Silva" value={signupFullName} onChange={e => setSignupFullName(e.target.value)} required />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input id="signup-email" type="email" placeholder="seu@email.com" value={signupEmail} onChange={e => setSignupEmail(e.target.value)} disabled={!!inviteToken} required />
                  {inviteToken && <p className="text-xs text-muted-foreground">Email pré-preenchido pelo convite</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-password">Senha</Label>
                  <Input id="signup-password" type="password" placeholder="••••••••" value={signupPassword} onChange={e => setSignupPassword(e.target.value)} required minLength={6} />
                </div>

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? "Criando conta..." : "Criar conta"}
                </Button>

                <div className="relative my-4">
                  <Separator />
                  <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
                    ou continue com
                  </span>
                </div>

                <Button 
                  type="button" 
                  variant="outline" 
                  className="w-full flex items-center gap-2" 
                  onClick={handleGoogleLogin}
                  disabled={isLoading}
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24">
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      fill="#EA4335"
                    />
                  </svg>
                  Continuar com Google
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>;
}