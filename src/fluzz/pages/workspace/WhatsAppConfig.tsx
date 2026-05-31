import { useState, useEffect } from "react";
import { AppLayout } from "@/fluzz/components/layout/AppLayout";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";
import { useAuth } from "@/fluzz/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/fluzz/components/ui/card";
import { Button } from "@/fluzz/components/ui/button";
import { Input } from "@/fluzz/components/ui/input";
import { Label } from "@/fluzz/components/ui/label";
import { Switch } from "@/fluzz/components/ui/switch";
import { Badge } from "@/fluzz/components/ui/badge";
import { MessageCircle, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function WhatsAppConfig() {
  const { workspace, isAdmin } = useWorkspace();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [subdomain, setSubdomain] = useState("");
  const [token, setToken] = useState("");
  const [isActive, setIsActive] = useState(false);
  const [testing, setTesting] = useState(false);

  const { data: config, isLoading } = useQuery({
    queryKey: ["whatsapp-config", workspace?.id],
    queryFn: async () => {
      if (!workspace) return null;
      const { data, error } = await supabase
        .from("whatsapp_config")
        .select("*")
        .eq("workspace_id", workspace.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!workspace,
  });

  useEffect(() => {
    if (config) {
      setSubdomain(config.instance_subdomain || "");
      setToken(config.instance_token || "");
      setIsActive(config.is_active || false);
    }
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!workspace || !user) return;
      const payload = {
        workspace_id: workspace.id,
        instance_subdomain: subdomain.trim(),
        instance_token: token.trim(),
        is_active: isActive,
        created_by: user.id,
        updated_at: new Date().toISOString(),
      };

      if (config) {
        const { error } = await supabase
          .from("whatsapp_config")
          .update(payload)
          .eq("id", config.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("whatsapp_config").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-config"] });
      toast.success("Configuração salva!");
    },
    onError: () => toast.error("Erro ao salvar configuração"),
  });

  const testConnection = async () => {
    if (!subdomain.trim() || !token.trim()) {
      toast.error("Preencha o subdomínio e o token");
      return;
    }
    setTesting(true);
    try {
      const res = await fetch(`https://${subdomain.trim()}.uazapi.com/status`, {
        method: "GET",
        headers: { token: token.trim() },
      });
      if (res.ok) {
        toast.success("Conexão bem-sucedida!");
      } else {
        toast.error(`Erro na conexão: ${res.status}`);
      }
    } catch {
      toast.error("Não foi possível conectar à API UAZapi");
    } finally {
      setTesting(false);
    }
  };

  if (!isAdmin) {
    return (
      <AppLayout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Apenas administradores podem configurar o WhatsApp.</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2">
            <MessageCircle className="h-7 w-7 text-green-500" />
            Integração WhatsApp
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure a API UAZapi para enviar notificações via WhatsApp
          </p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Configuração UAZapi</CardTitle>
                <CardDescription>Credenciais da sua instância</CardDescription>
              </div>
              <Badge variant={config?.is_active ? "default" : "secondary"}>
                {config?.is_active ? (
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Ativo
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <XCircle className="h-3 w-3" /> Inativo
                  </span>
                )}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Subdomínio da instância</Label>
              <div className="flex items-center gap-2 mt-1">
                <Input
                  value={subdomain}
                  onChange={(e) => setSubdomain(e.target.value)}
                  placeholder="minha-instancia"
                />
                <span className="text-sm text-muted-foreground whitespace-nowrap">.uazapi.com</span>
              </div>
            </div>
            <div>
              <Label>Token da instância</Label>
              <Input
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Seu token de autenticação"
                type="password"
                className="mt-1"
              />
            </div>
            <div className="flex items-center justify-between py-2">
              <div>
                <Label>Ativar notificações</Label>
                <p className="text-xs text-muted-foreground">
                  Enviar mensagens automáticas aos participantes
                </p>
              </div>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={testConnection} disabled={testing}>
                {testing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Testar Conexão
              </Button>
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
