import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { Button } from "@/fluzz/components/ui/button";
import { Input } from "@/fluzz/components/ui/input";
import { Label } from "@/fluzz/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/fluzz/components/ui/card";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

function parseRecoveryFromHash() {
  const hash = window.location.hash?.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  const params = new URLSearchParams(hash);

  return {
    type: params.get("type"),
    accessToken: params.get("access_token"),
    refreshToken: params.get("refresh_token"),
  };
}

function parseRecoveryFromQuery() {
  const params = new URLSearchParams(window.location.search);

  return {
    type: params.get("type"),
    tokenHash: params.get("token_hash") ?? params.get("token"),
  };
}

const ResetPassword = () => {
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [isValidSession, setIsValidSession] = useState(false);

  const mismatch = useMemo(
    () => Boolean(confirmPassword) && password !== confirmPassword,
    [password, confirmPassword]
  );

  useEffect(() => {
    document.title = "Redefinir senha | Fluzz";

    // If the email link lands on the editor/preview domain via the auth bridge,
    // bounce to the published app keeping the same query/hash tokens.
    const PUBLISHED_APP_ORIGIN = "https://fluzzapp.com";
    const isPreviewDomain = window.location.hostname.includes("lovableproject.com") || window.location.hostname.includes("lovable.app");
    if (isPreviewDomain && window.location.origin !== PUBLISHED_APP_ORIGIN) {
      const target = `${PUBLISHED_APP_ORIGIN}${window.location.pathname}${window.location.search}${window.location.hash}`;
      window.location.replace(target);
      return;
    }

    let mounted = true;

    const init = async () => {
      try {
        // 1) PKCE flow: ?code=...
        const code = new URLSearchParams(window.location.search).get("code");
        if (code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          if (mounted) {
            setIsValidSession(Boolean(data.session));
            setCheckingSession(false);
          }
          return;
        }

        // 2) Token hash flow: ?token_hash=...&type=recovery
        const { type: queryType, tokenHash } = parseRecoveryFromQuery();
        if (queryType === "recovery" && tokenHash) {
          const { data, error } = await supabase.auth.verifyOtp({
            type: "recovery",
            token_hash: tokenHash,
          });
          if (error) throw error;
          if (mounted) {
            setIsValidSession(Boolean(data.session));
            setCheckingSession(false);
          }
          return;
        }

        // 3) Implicit flow: #access_token=...&refresh_token=...&type=recovery
        const { type, accessToken, refreshToken } = parseRecoveryFromHash();
        if (type === "recovery" && accessToken && refreshToken) {
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
          if (mounted) {
            setIsValidSession(Boolean(data.session));
            setCheckingSession(false);
          }
          return;
        }

        // 3) Fallback: existing session
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;
        setIsValidSession(Boolean(data.session));
        setCheckingSession(false);
      } catch (err: any) {
        if (!mounted) return;
        setIsValidSession(false);
        setCheckingSession(false);
      }
    };

    // Listener helps when the session gets set by the client automatically
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setIsValidSession(Boolean(session));
        setCheckingSession(false);
      }
    });

    init();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error("As senhas não coincidem");
      return;
    }

    if (password.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      toast.success("Senha atualizada com sucesso!");
      await supabase.auth.signOut();
      navigate("/tools/wizzy-flow/auth");
    } catch (error: any) {
      toast.error(error?.message || "Erro ao atualizar senha");
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background p-4">
        <section className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Verificando sessão...</p>
        </section>
      </main>
    );
  }

  if (!isValidSession) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background p-4">
        <section className="w-full max-w-md">
          <Card>
            <CardHeader>
              <CardTitle>Link inválido ou expirado</CardTitle>
              <CardDescription>
                O link de recuperação de senha é inválido ou expirou. Solicite um novo
                link.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => navigate("/tools/wizzy-flow/forgot-password")} className="w-full">
                Solicitar novo link
              </Button>
            </CardContent>
          </Card>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-4">
      <section className="w-full max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>Redefinir senha</CardTitle>
            <CardDescription>Digite sua nova senha</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Nova senha</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmar senha</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Digite a senha novamente"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                />
                {mismatch && (
                  <p className="text-sm text-destructive">As senhas não coincidem</p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={loading || mismatch || password.length < 6}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Atualizando...
                  </>
                ) : (
                  "Atualizar senha"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>
    </main>
  );
};

export default ResetPassword;
