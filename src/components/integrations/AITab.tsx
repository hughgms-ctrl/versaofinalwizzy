import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useIntegrationConfig, useUpsertIntegrationConfig, type IntegrationConfig } from '@/hooks/useIntegrationConfigs';
import { useOpenAIUsageStatus, useUpdateOpenAIUsageSettings } from '@/hooks/useOpenAIUsageStatus';
import { useOrganizationPlan } from '@/hooks/useOrganizationPlan';
import { Brain, CheckCircle, Eye, EyeOff, Loader2, Save, Sparkles, XCircle } from 'lucide-react';

const DEFAULT_CONFIG: Partial<IntegrationConfig> = {
  ai_provider: 'openai',
  default_model: 'gpt-4o-mini',
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
  const { isLoading: isPlanLoading, isWizzyAI, planName, usage } = useOrganizationPlan();
  const { data: openAIUsage, isLoading: isOpenAIUsageLoading } = useOpenAIUsageStatus(!isWizzyAI);
  const upsertConfig = useUpsertIntegrationConfig();
  const updateOpenAIUsage = useUpdateOpenAIUsageSettings();
  const [openaiKey, setOpenaiKey] = useState('');
  const [openaiAdminKey, setOpenaiAdminKey] = useState('');
  const [creditBalance, setCreditBalance] = useState('0');
  const [alertThreshold, setAlertThreshold] = useState('80');
  const [showOpenAIKey, setShowOpenAIKey] = useState(false);
  const [showAdminKey, setShowAdminKey] = useState(false);

  useEffect(() => {
    if (config?.openai_api_key) {
      setOpenaiKey(config.openai_api_key);
    }
  }, [config]);

  useEffect(() => {
    if (!openAIUsage?.settings) return;
    setOpenaiAdminKey(openAIUsage.settings.openai_admin_key_masked || '');
    setCreditBalance(String(openAIUsage.settings.credit_balance_usd ?? 0));
    setAlertThreshold(String(openAIUsage.settings.alert_threshold_percent ?? 80));
  }, [
    openAIUsage?.settings?.openai_admin_key_masked,
    openAIUsage?.settings?.credit_balance_usd,
    openAIUsage?.settings?.alert_threshold_percent,
  ]);

  const openAIUsed = Number(openAIUsage?.usage?.used_usd || 0);
  const openAIRemaining = Number(openAIUsage?.usage?.remaining_usd || 0);
  const openAIPercent = Math.min(Number(openAIUsage?.usage?.usage_percent || 0), 100);
  const openAIHasCredit = Number(openAIUsage?.settings?.credit_balance_usd || 0) > 0;

  const formatCurrency = (value: number) => (
    `US$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  );

  const handleSave = () => {
    if (!openaiKey.trim()) {
      toast({
        title: 'Chave OpenAI obrigatoria',
        description: 'Cole sua API key da OpenAI para ativar os recursos de IA do Wizzy.',
        variant: 'destructive',
      });
      return;
    }

    upsertConfig.mutate({
      ...(config || DEFAULT_CONFIG),
      ai_provider: 'openai',
      default_model: 'gpt-4o-mini',
      openai_api_key: openaiKey.trim(),
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
    });

    updateOpenAIUsage.mutate({
      openai_admin_key: openaiAdminKey,
      credit_balance_usd: Number(creditBalance || 0),
      alert_threshold_percent: Number(alertThreshold || 80),
    });
  };

  if (isLoading || isPlanLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <Card className="border-border bg-card">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2">
              <Brain className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-foreground">{isWizzyAI ? 'Wizzy AI' : 'OpenAI'}</CardTitle>
              <CardDescription>
                {isWizzyAI
                  ? 'Disponivel apenas no plano Max. Todo consumo de IA e por nossa conta.'
                  : 'Informe sua chave de acesso OpenAI para ativar os recursos de IA.'}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {isWizzyAI ? (
            <div className="rounded-md border border-primary/20 bg-primary/5 p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-primary/10 p-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-foreground">Plano {planName || 'Max'} com Wizzy AI</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Voce nao precisa cadastrar chave de API. O consumo e processado pela chave da plataforma.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="rounded-md border bg-muted/30 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-foreground">Saldo OpenAI</p>
                    <p className="text-sm text-muted-foreground">
                      {openAIUsage?.settings?.openai_admin_key_configured
                        ? `Usado ${formatCurrency(openAIUsed)} desde a ultima recarga informada`
                        : 'Informe a Admin Key somente leitura para calcular o consumo real automaticamente.'}
                    </p>
                  </div>
                  {openAIHasCredit && (
                    <Badge variant={openAIPercent >= Number(alertThreshold || 80) ? 'destructive' : 'secondary'}>
                      {formatCurrency(openAIRemaining)} restantes
                    </Badge>
                  )}
                </div>
                {openAIHasCredit && (
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={openAIPercent >= Number(alertThreshold || 80) ? 'h-full rounded-full bg-amber-500' : 'h-full rounded-full bg-primary'}
                      style={{ width: `${openAIPercent}%` }}
                    />
                  </div>
                )}
                <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Saldo informado</p>
                    <p className="font-medium">{formatCurrency(Number(openAIUsage?.settings?.credit_balance_usd || 0))}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Usado</p>
                    <p className="font-medium">{isOpenAIUsageLoading ? 'Atualizando...' : formatCurrency(openAIUsed)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Uso</p>
                    <p className="font-medium">{openAIHasCredit ? `${openAIPercent}%` : '-'}</p>
                  </div>
                </div>
                {openAIUsage?.usage?.costs_error && (
                  <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700">
                    Nao foi possivel consultar a OpenAI: {openAIUsage.usage.costs_error}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label className="font-medium text-foreground">OpenAI API Key</Label>
                    <p className="text-xs text-muted-foreground">Use uma chave criada em platform.openai.com/api-keys.</p>
                  </div>
                  {openaiKey ? (
                    <Badge variant="outline" className="border-green-500/30 bg-green-500/10 text-green-600">
                      <CheckCircle className="mr-1 h-3 w-3" /> Configurada
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-muted text-muted-foreground">
                      <XCircle className="mr-1 h-3 w-3" /> Nao configurada
                    </Badge>
                  )}
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="relative flex-1">
                    <Input
                      type={showOpenAIKey ? 'text' : 'password'}
                      placeholder="sk-..."
                      value={openaiKey}
                      onChange={(event) => setOpenaiKey(event.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowOpenAIKey(!showOpenAIKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label={showOpenAIKey ? 'Ocultar chave' : 'Mostrar chave'}
                    >
                      {showOpenAIKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <Button onClick={handleSave} disabled={upsertConfig.isPending} className="gap-2">
                    {upsertConfig.isPending || updateOpenAIUsage.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Salvar
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 rounded-md border p-4 md:grid-cols-3">
                <div className="space-y-2 md:col-span-3">
                  <Label className="font-medium text-foreground">OpenAI Admin Key somente leitura</Label>
                  <div className="relative">
                    <Input
                      type={showAdminKey ? 'text' : 'password'}
                      placeholder="sk-admin-..."
                      value={openaiAdminKey}
                      onChange={(event) => setOpenaiAdminKey(event.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowAdminKey(!showAdminKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label={showAdminKey ? 'Ocultar chave admin' : 'Mostrar chave admin'}
                    >
                      {showAdminKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Usada apenas para ler custos reais na OpenAI e calcular o saldo restante.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Saldo atual OpenAI (US$)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={creditBalance}
                    onChange={(event) => setCreditBalance(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Avisar em (%)</Label>
                  <Input
                    type="number"
                    min="1"
                    max="100"
                    value={alertThreshold}
                    onChange={(event) => setAlertThreshold(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Ultima recarga</Label>
                  <div className="flex h-10 items-center rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground">
                    {openAIUsage?.settings?.balance_reference_at
                      ? new Date(openAIUsage.settings.balance_reference_at).toLocaleDateString('pt-BR')
                      : '-'}
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
