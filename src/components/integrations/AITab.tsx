import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  useIntegrationConfig,
  useUpsertIntegrationConfig,
  PROVIDER_LABELS,
  MODELS_BY_PROVIDER,
  type AIProvider,
  type IntegrationConfig,
} from '@/hooks/useIntegrationConfigs';
import {
  Brain,
  Key,
  Eye,
  EyeOff,
  CheckCircle,
  XCircle,
  Loader2,
  Save,
  AlertTriangle,
} from 'lucide-react';


const DEFAULT_CONFIG: Partial<IntegrationConfig> = {
  ai_provider: 'lovable',
  default_model: 'google/gemini-3-flash-preview',
  openai_api_key: null,
  gemini_api_key: null,
  agents_provider: null,
  agents_model: null,
  conversation_summary_provider: null,
  conversation_summary_model: null,
  prompt_generation_provider: null,
  prompt_generation_model: null,
  flow_generation_provider: null,
  flow_generation_model: null,
  transcription_provider: null,
  transcription_model: null,
};

export function AITab() {
  const { toast } = useToast();
  const { data: config, isLoading } = useIntegrationConfig();
  const upsertConfig = useUpsertIntegrationConfig();

  const [formData, setFormData] = useState<Partial<IntegrationConfig>>(DEFAULT_CONFIG);
  const [showOpenAIKey, setShowOpenAIKey] = useState(false);
  const [showGeminiKey, setShowGeminiKey] = useState(false);

  useEffect(() => {
    if (config) {
      setFormData(config);
    }
  }, [config]);

  const handleSave = () => {
    const payload = { ...formData };
    const features: AIFeature[] = ['agents', 'conversation_summary', 'prompt_generation', 'flow_generation', 'transcription'];
    features.forEach((f) => {
      if (!featureOverrides[f]) {
        (payload as any)[`${f}_provider`] = null;
        (payload as any)[`${f}_model`] = null;
      }
    });

    if (payload.ai_provider === 'openai' && !payload.openai_api_key) {
      toast({ title: 'API Key obrigatória', description: 'Configure a chave da OpenAI para usar como provedor padrão.', variant: 'destructive' });
      return;
    }
    if (payload.ai_provider === 'gemini' && !payload.gemini_api_key) {
      toast({ title: 'API Key obrigatória', description: 'Configure a chave do Gemini para usar como provedor padrão.', variant: 'destructive' });
      return;
    }

    upsertConfig.mutate(payload);
  };

  const updateField = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const getProviderStatus = (provider: AIProvider): { connected: boolean; label: string } => {
    if (provider === 'lovable') return { connected: true, label: 'Incluso' };
    if (provider === 'openai') return { connected: !!formData.openai_api_key, label: formData.openai_api_key ? 'Configurado' : 'Não configurado' };
    if (provider === 'gemini') return { connected: !!formData.gemini_api_key, label: formData.gemini_api_key ? 'Configurado' : 'Não configurado' };
    return { connected: false, label: 'Desconhecido' };
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Provider Selection */}
      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Brain className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-foreground">Provedor de IA Padrão</CardTitle>
              <CardDescription>
                Escolha qual provedor alimentará todos os recursos de IA do sistema
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(['lovable', 'openai', 'gemini'] as AIProvider[]).map((provider) => {
              const status = getProviderStatus(provider);
              const isSelected = formData.ai_provider === provider;
              return (
                <button
                  key={provider}
                  onClick={() => {
                    updateField('ai_provider', provider);
                    const models = MODELS_BY_PROVIDER[provider];
                    if (models.length > 0) {
                      updateField('default_model', models[0].value);
                    }
                  }}
                  className={`relative p-4 rounded-xl border-2 transition-all text-left ${isSelected
                      ? 'border-primary bg-primary/5 shadow-md'
                      : 'border-border hover:border-primary/30 bg-card'
                    }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-foreground">{PROVIDER_LABELS[provider]}</span>
                    {isSelected && <CheckCircle className="h-5 w-5 text-primary" />}
                  </div>
                  <div className="flex items-center gap-2">
                    {status.connected ? (
                      <Badge variant="outline" className="text-xs bg-green-500/10 text-green-600 border-green-500/30">
                        {status.label}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/30">
                        {status.label}
                      </Badge>
                    )}
                  </div>
                  {provider === 'lovable' && (
                    <p className="text-xs text-muted-foreground mt-2">Sem necessidade de API Key</p>
                  )}
                </button>
              );
            })}
          </div>

          <div className="space-y-2">
            <Label className="text-foreground">Modelo Padrão</Label>
            <Select
              value={formData.default_model || ''}
              onValueChange={(v) => updateField('default_model', v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o modelo" />
              </SelectTrigger>
              <SelectContent>
                {MODELS_BY_PROVIDER[formData.ai_provider || 'lovable'].map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    <div className="flex flex-col">
                      <span>{m.label}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {m.value.includes('pro') ? 'Ideal para raciocínio complexo' :
                          m.value.includes('flash') ? 'Ideal para velocidade e triagem' :
                            'Equilíbrio entre inteligência e custo'}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* API Keys */}
      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <Key className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <CardTitle className="text-foreground">Chaves de API</CardTitle>
              <CardDescription>
                Configure suas chaves para usar provedores externos
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-foreground font-medium">OpenAI API Key</Label>
                <p className="text-xs text-muted-foreground">Obtenha em platform.openai.com/api-keys</p>
              </div>
              {formData.openai_api_key ? (
                <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">
                  <CheckCircle className="h-3 w-3 mr-1" /> Configurada
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-muted text-muted-foreground">
                  <XCircle className="h-3 w-3 mr-1" /> Não configurada
                </Badge>
              )}
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={showOpenAIKey ? 'text' : 'password'}
                  placeholder="sk-..."
                  value={formData.openai_api_key || ''}
                  onChange={(e) => updateField('openai_api_key', e.target.value || null)}
                />
                <button
                  type="button"
                  onClick={() => setShowOpenAIKey(!showOpenAIKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showOpenAIKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={upsertConfig.isPending}
                className="bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20"
              >
                Confirmar Chave OpenAI
              </Button>
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-foreground font-medium">Google Gemini API Key</Label>
                <p className="text-xs text-muted-foreground">Obtenha em aistudio.google.com/apikey</p>
              </div>
              {formData.gemini_api_key ? (
                <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">
                  <CheckCircle className="h-3 w-3 mr-1" /> Configurada
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-muted text-muted-foreground">
                  <XCircle className="h-3 w-3 mr-1" /> Não configurada
                </Badge>
              )}
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={showGeminiKey ? 'text' : 'password'}
                  placeholder="AIza..."
                  value={formData.gemini_api_key || ''}
                  onChange={(e) => updateField('gemini_api_key', e.target.value || null)}
                />
                <button
                  type="button"
                  onClick={() => setShowGeminiKey(!showGeminiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showGeminiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={upsertConfig.isPending}
                className="bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20"
              >
                Confirmar Chave Gemini
              </Button>
            </div>
          </div>

          {(formData.ai_provider !== 'lovable') && !formData.openai_api_key && !formData.gemini_api_key && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-amber-600">API Key necessária</p>
                <p className="text-muted-foreground">Configure pelo menos uma API Key para usar provedores externos.</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>


      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={upsertConfig.isPending} size="lg">
          {upsertConfig.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Salvar Configurações
        </Button>
      </div>
    </div>
  );
}
