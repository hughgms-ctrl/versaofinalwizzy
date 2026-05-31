import { useState, useEffect } from "react";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";
import { useAuth } from "@/fluzz/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/fluzz/components/ui/card";
import { Button } from "@/fluzz/components/ui/button";
import { Input } from "@/fluzz/components/ui/input";
import { Label } from "@/fluzz/components/ui/label";
import { Switch } from "@/fluzz/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/fluzz/components/ui/select";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

type Provider = "lovable" | "openai" | "anthropic" | "gemini";

const PROVIDER_MODELS: Record<Provider, { value: string; label: string }[]> = {
  lovable: [
    { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash (recomendado)" },
    { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    { value: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
    { value: "openai/gpt-5", label: "GPT-5" },
    { value: "openai/gpt-5-mini", label: "GPT-5 Mini" },
    { value: "openai/gpt-5-nano", label: "GPT-5 Nano" },
  ],
  openai: [
    { value: "gpt-5", label: "GPT-5" },
    { value: "gpt-5-mini", label: "GPT-5 Mini" },
    { value: "gpt-5-nano", label: "GPT-5 Nano" },
    { value: "gpt-4o", label: "GPT-4o" },
    { value: "gpt-4o-mini", label: "GPT-4o Mini" },
  ],
  anthropic: [
    { value: "claude-opus-4-20250514", label: "Claude Opus 4" },
    { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
    { value: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet" },
    { value: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku" },
  ],
  gemini: [
    { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
    { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
  ],
};

const PROVIDER_LABELS: Record<Provider, string> = {
  lovable: "Lovable AI (padrão, sem chave)",
  openai: "OpenAI",
  anthropic: "Anthropic (Claude)",
  gemini: "Google Gemini",
};

const PROVIDER_HELP: Record<Provider, string> = {
  lovable: "Use a IA integrada do Fluzz, sem precisar de chave própria.",
  openai: "Obtenha sua chave em https://platform.openai.com/api-keys",
  anthropic: "Obtenha sua chave em https://console.anthropic.com/settings/keys",
  gemini: "Obtenha sua chave em https://aistudio.google.com/apikey",
};

export function AIConfigPanel() {
  const { workspace, isAdmin } = useWorkspace();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [provider, setProvider] = useState<Provider>("lovable");
  const [model, setModel] = useState("google/gemini-2.5-flash");
  const [apiKey, setApiKey] = useState("");
  const [useOwnKey, setUseOwnKey] = useState(false);
  const [testing, setTesting] = useState(false);

  const { data: config } = useQuery({
    queryKey: ["ai-config", workspace?.id],
    queryFn: async () => {
      if (!workspace) return null;
      const { data, error } = await supabase
        .from("ai_workspace_config")
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
      setProvider((config.provider as Provider) || "lovable");
      setModel(config.model || "google/gemini-2.5-flash");
      setUseOwnKey(config.use_own_key || false);
      setApiKey("");
    }
  }, [config]);

  useEffect(() => {
    const models = PROVIDER_MODELS[provider];
    if (models.length > 0 && !models.find((m) => m.value === model)) {
      setModel(models[0].value);
    }
  }, [provider]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!workspace || !user) return;

      if (useOwnKey && provider !== "lovable" && !apiKey.trim() && !config?.api_key) {
        throw new Error("Informe a chave de API para usar seu provedor próprio");
      }

      const payload: any = {
        workspace_id: workspace.id,
        provider,
        model,
        use_own_key: useOwnKey,
        is_active: true,
        created_by: user.id,
        updated_at: new Date().toISOString(),
      };

      if (apiKey.trim()) {
        payload.api_key = apiKey.trim();
      }

      if (config) {
        const { error } = await supabase
          .from("ai_workspace_config")
          .update(payload)
          .eq("id", config.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("ai_workspace_config").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-config"] });
      toast.success("Configuração salva!");
      setApiKey("");
    },
    onError: (e: Error) => toast.error(e.message || "Erro ao salvar configuração"),
  });

  const testConnection = async () => {
    if (!workspace) return;
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("test-ai-connection", {
        body: {
          workspace_id: workspace.id,
          provider,
          model,
          api_key: apiKey.trim() || undefined,
          use_own_key: useOwnKey,
        },
      });
      if (error) throw error;
      if (data?.success) {
        toast.success("Conexão bem-sucedida!");
      } else {
        toast.error(data?.error || "Falha ao conectar");
      }
    } catch (e: any) {
      toast.error(e.message || "Erro ao testar conexão");
    } finally {
      setTesting(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">
          Apenas administradores podem configurar a IA do workspace.
        </p>
      </div>
    );
  }

  const showApiKeyField = useOwnKey && provider !== "lovable";

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Provedor e modelo
          </CardTitle>
          <CardDescription>
            Por padrão usamos a Lovable AI (incluída). Você pode usar sua própria conta
            OpenAI, Anthropic ou Google Gemini.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label>Usar minha própria chave de IA</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Ao ativar, escolha o provedor e cole sua chave
              </p>
            </div>
            <Switch checked={useOwnKey} onCheckedChange={setUseOwnKey} />
          </div>

          <div>
            <Label>Provedor</Label>
            <Select
              value={provider}
              onValueChange={(v) => setProvider(v as Provider)}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PROVIDER_LABELS) as Provider[])
                  .filter((p) => useOwnKey || p === "lovable")
                  .map((p) => (
                    <SelectItem key={p} value={p}>
                      {PROVIDER_LABELS[p]}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">{PROVIDER_HELP[provider]}</p>
          </div>

          <div>
            <Label>Modelo</Label>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDER_MODELS[provider].map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {showApiKeyField && (
            <div>
              <Label>Chave de API</Label>
              <Input
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={
                  config?.api_key
                    ? "•••••••••••• (deixe em branco para manter)"
                    : "Cole sua chave aqui"
                }
                type="password"
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Sua chave fica protegida e visível apenas para administradores.
              </p>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={testConnection} disabled={testing}>
              {testing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Testar Conexão
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
