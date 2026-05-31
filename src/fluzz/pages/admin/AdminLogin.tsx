import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { useAuth } from "@/fluzz/contexts/AuthContext";
import { useAdmin } from "@/fluzz/contexts/AdminContext";
import { Button } from "@/fluzz/components/ui/button";
import { Input } from "@/fluzz/components/ui/input";
import { Label } from "@/fluzz/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/fluzz/components/ui/card";
import { Shield, Lock, Mail, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { ThemeToggle } from "@/fluzz/components/ThemeToggle";

const AdminLogin = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [setupLoading, setSetupLoading] = useState(false);
  // Default to true to never show setup button unless explicitly confirmed no admin exists
  const [hasAdmin, setHasAdmin] = useState<boolean>(true);
  const [checkComplete, setCheckComplete] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isAdmin, loading: adminLoading, checkAdminStatus } = useAdmin();

  // Redirect if already logged in as admin
  useEffect(() => {
    if (!adminLoading && isAdmin && user) {
      navigate("/tools/wizzy-flow/admin/dashboard", { replace: true });
    }
  }, [isAdmin, adminLoading, user, navigate]);

  useEffect(() => {
    // Only check after user logs in
    if (!user) {
      setCheckComplete(false);
      return;
    }

    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke(
          "admin-check-super-admin-exists"
        );

        if (error) {
          console.error("Error checking super admin:", error);
          // On error, assume admin exists (safer - don't show setup button)
          setHasAdmin(true);
          setCheckComplete(true);
          return;
        }

        setHasAdmin(Boolean(data?.hasSuperAdmin));
        setCheckComplete(true);
      } catch (err) {
        console.error("Error checking super admin:", err);
        // On error, assume admin exists (safer - don't show setup button)
        setHasAdmin(true);
        setCheckComplete(true);
      }
    })();
  }, [user]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        toast.error("Credenciais inválidas");
        setLoading(false);
        return;
      }

      // Check if user is admin
      const { data: adminData, error: adminError } = await supabase
        .from("admin_users")
        .select("role")
        .eq("user_id", data.user.id)
        .single();

      if (adminError || !adminData) {
        toast.error("Você não tem permissão para acessar esta área.");
        await supabase.auth.signOut();
        setLoading(false);
        return;
      }

      await checkAdminStatus();
      toast.success("Login realizado com sucesso!");
      navigate("/tools/wizzy-flow/admin/dashboard");
    } catch {
      toast.error("Erro ao fazer login");
    } finally {
      setLoading(false);
    }
  };

  const handleSetupSuperAdmin = async () => {
    if (!user) {
      toast.error("Você precisa estar logado para se configurar como super admin");
      return;
    }

    setSetupLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("admin-setup-super-admin");

      if (error) {
        toast.error("Erro ao configurar super admin");
        console.error("Setup error:", error);
        setSetupLoading(false);
        return;
      }

      if (data?.error) {
        toast.error(data.error);
        setSetupLoading(false);
        return;
      }

      toast.success("Super administrador configurado com sucesso!");
      await checkAdminStatus();
      setHasAdmin(true);
      navigate("/tools/wizzy-flow/admin/dashboard");
    } catch (error) {
      console.error("Error setting up super admin:", error);
      toast.error("Erro ao configurar super admin");
    } finally {
      setSetupLoading(false);
    }
  };

  // Show loading while checking admin status
  if (adminLoading || (user && isAdmin)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4" />
          <p className="text-muted-foreground">Verificando acesso...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
            <Shield className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Painel Administrativo</CardTitle>
          <CardDescription>
            Acesso restrito a administradores da plataforma
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@empresa.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Entrando..." : "Entrar"}
            </Button>
          </form>
        </CardContent>
        
        {checkComplete && hasAdmin === false && user && (
          <CardFooter className="flex flex-col border-t pt-6">
            <p className="text-sm text-muted-foreground mb-4 text-center">
              Nenhum super administrador configurado. 
              <br />
              Você pode se configurar como o primeiro admin.
            </p>
            <Button 
              variant="outline" 
              className="w-full gap-2"
              onClick={handleSetupSuperAdmin}
              disabled={setupLoading}
            >
              <UserPlus className="h-4 w-4" />
              {setupLoading ? "Configurando..." : "Configurar como Super Admin"}
            </Button>
          </CardFooter>
        )}
        
      </Card>
    </div>
  );
};

export default AdminLogin;
