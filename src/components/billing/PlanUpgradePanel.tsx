import React, { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, X, Crown, Sparkles, ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { clearSelectedEntryPlan, getSelectedEntryPlan, getStoredEntryAssignment, trackEntryEvent } from "@/lib/entryFlow";
import { trackMetaEvent } from "@/lib/metaPixel";

const moduleLabels: Record<string, string> = {
  conversations: "Conversas", pipeline: "Pipeline", contacts: "Contatos",
  flows: "Fluxos", documents: "Wizzy Sign (Assinatura eletrônica)", agents: "Agentes IA",
  reports: "Relatórios", campaigns: "Campanhas", calendar: "Agenda",
  orchestrator: "Orquestrador", ai: "Inteligência Artificial",
  widgets: "Wizzy Forms (Formulário de captação)", settings: "Configurações", team: "Equipe",
  scheduled: "Programados", integrations: "Integrações", quiz: "Wizzy Bot (Quizz interativo)",
  wizzy_flow: "Wizzy Flow (Gestão de projetos)",
};

const visibleModules = [
  "documents", "widgets", "quiz", "wizzy_flow"
];

interface Plan {
  id: string;
  name: string;
  slug: string;
  price_monthly: number;
  price_yearly: number;
  trial_days?: number;
  allowed_modules: string[];
  max_team_members: number;
  storage_limit_bytes: number;
  ai_mode?: string;
  is_active: boolean;
  features?: any;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://zaobtetbjpuzibjymhzw.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inphb2J0ZXRianB1emlianltaHp3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMzc5MzksImV4cCI6MjA4NzcxMzkzOX0.HBUI1OK1eYq9FE2SzIvuAkxuCG0frApCQZqcjjDx43k";

const emergencyPublicPlans: Plan[] = [
  {
    id: "ac4f4da9-88a8-43bc-a198-dd8dc73e963f",
    name: "Pro",
    slug: "pro",
    price_monthly: 1,
    price_yearly: 10,
    allowed_modules: ["documents", "widgets", "quiz"],
    max_team_members: 10,
    storage_limit_bytes: 10737418240,
    ai_mode: "own_api",
    is_active: true,
    features: { limits: { max_workspaces: 3, max_whatsapp_numbers: 2 }, trial_days: 7, trial_enabled: false },
  },
  {
    id: "8c96e4e5-7044-424b-b285-6499584be7ac",
    name: "Basic",
    slug: "basic",
    price_monthly: 97,
    price_yearly: 970,
    allowed_modules: ["conversations", "contacts", "reports", "calendar", "ai", "settings", "scheduled", "pipeline", "flows", "agents", "campaigns", "orchestrator", "integrations"],
    max_team_members: 1,
    storage_limit_bytes: 1073741824,
    ai_mode: "own_api",
    is_active: true,
    features: { limits: { max_workspaces: 1, max_whatsapp_numbers: 1 }, trial_days: 0 },
  },
  {
    id: "7199f6b6-de36-4083-af9a-9fd2675ce8a0",
    name: "Scale",
    slug: "enterprise",
    price_monthly: 497,
    price_yearly: 4970,
    allowed_modules: ["conversations", "pipeline", "contacts", "flows", "documents", "widgets", "settings", "team", "agents", "reports", "campaigns", "calendar", "scheduled", "integrations", "orchestrator", "quiz", "wizzy_flow"],
    max_team_members: 50,
    storage_limit_bytes: 53687091200,
    ai_mode: "own_api",
    is_active: true,
    features: { limits: { max_workspaces: 10, max_whatsapp_numbers: 5 }, trial_days: 7, trial_enabled: false },
  },
  {
    id: "0e90591b-7cac-43f0-88f0-e0ea57a3011c",
    name: "Max",
    slug: "max",
    price_monthly: 997,
    price_yearly: 9970,
    allowed_modules: ["documents", "quiz", "widgets", "wizzy_flow"],
    max_team_members: 0,
    storage_limit_bytes: 107374182400,
    ai_mode: "platform_api",
    is_active: true,
    features: { limits: { max_workspaces: 20, max_whatsapp_numbers: 10 }, trial_days: 7, trial_enabled: false },
  },
];

async function fetchPublicPlans(cacheBust = false): Promise<Plan[]> {
  const suffix = cacheBust ? `?t=${Date.now()}` : "";
  const response = await fetch(`${SUPABASE_URL}/functions/v1/billing-plans${suffix}`, {
    cache: "no-store",
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'Nao foi possivel carregar os planos.');
  return (payload?.plans || []) as Plan[];
}

const PlanUpgradePanel = () => {
  const { profile } = useAuth();
  const { selectedWorkspace } = useWorkspaceContext();
  const activeOrganizationId = selectedWorkspace?.organization_id || profile?.organization_id || null;
  const [isYearly, setIsYearly] = useState(false);
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
  const autoCheckoutStarted = useRef(false);

  const { data: plans = [], isLoading: plansLoading, isFetching: plansFetching, error: plansError } = useQuery({
    queryKey: ['billing-plans-public-v2'],
    queryFn: async () => {
      try {
        const functionPlans = await fetchPublicPlans();
        if (functionPlans.length > 0) return functionPlans;

        const freshPlans = await fetchPublicPlans(true);
        if (freshPlans.length > 0) return freshPlans;

        console.warn('billing-plans returned an empty list; using emergency public plans.');
        return emergencyPublicPlans;
      } catch (functionError) {
        console.warn('billing-plans function failed; using emergency public plans.', functionError);
        return emergencyPublicPlans;
      }
    },
    refetchOnMount: 'always',
    staleTime: 0,
  });

  const { data: currentPlan } = useQuery({
    queryKey: ['current-org-plan', activeOrganizationId],
    queryFn: async () => {
      if (!activeOrganizationId) return null;
      const { data, error } = await supabase
        .from('organization_plans')
        .select('*, plan:platform_plans(*)')
        .eq('organization_id', activeOrganizationId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!activeOrganizationId,
  });

  const currentPlanId = currentPlan?.plan_id;
  const entryAssignment = getStoredEntryAssignment();
  const entryConfig = entryAssignment?.flow_type === 'trial_auto' ? entryAssignment.config || {} : {};
  const requiresCardTrial = entryConfig.require_card === true;

  const formatStorage = (bytes: number) => {
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb} GB de armazenamento`;
  };

  const handleUpgrade = async (plan: Plan) => {
    try {
      setLoadingPlanId(plan.id);
      const { data: session } = await supabase.auth.getSession();
      const accessToken = session.session?.access_token;
      if (!accessToken) throw new Error('Sessao expirada. Entre novamente para continuar.');

      const response = await fetch(`${SUPABASE_URL}/functions/v1/billing-checkout`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          plan_id: plan.id,
          billing_cycle: isYearly ? 'yearly' : 'monthly',
          entry_flow_config: entryConfig,
        }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) throw new Error(data?.error || 'Nao foi possivel iniciar o checkout.');
      if (!data?.url) throw new Error('Checkout não retornou uma URL de pagamento.');

      const value = Number(isYearly ? plan.price_yearly || Number(plan.price_monthly || 0) * 10 : plan.price_monthly || 0);
      trackMetaEvent('InitiateCheckout', {
        content_ids: plan.id,
        content_name: plan.name,
        content_type: 'subscription_plan',
        currency: 'BRL',
        value,
        billing_cycle: isYearly ? 'yearly' : 'monthly',
      });

      await trackEntryEvent('checkout_started', {
        plan_id: plan.id,
        plan_slug: plan.slug,
        plan_name: plan.name,
        billing_cycle: isYearly ? 'yearly' : 'monthly',
        provider: data?.provider || null,
      }).catch(() => undefined);

      clearSelectedEntryPlan();
      window.location.href = data.url;
    } catch (error: any) {
      toast.error(error?.message || 'Nao foi possivel iniciar o checkout.');
    } finally {
      setLoadingPlanId(null);
    }
  };

  useEffect(() => {
    if (autoCheckoutStarted.current || !plans?.length || loadingPlanId) return;

    const params = new URLSearchParams(window.location.search);
    const shouldAutoCheckout = params.get('auto_checkout') === '1';
    const selectedPlanSlug = params.get('selected_plan') || getSelectedEntryPlan();
    if (!shouldAutoCheckout || !selectedPlanSlug) return;

    const selectedPlan = plans.find((plan) => plan.slug === selectedPlanSlug);
    if (!selectedPlan || selectedPlan.id === currentPlanId) return;

    autoCheckoutStarted.current = true;
    handleUpgrade(selectedPlan);
  }, [plans, currentPlanId, loadingPlanId]);

  return (
    <div className="space-y-6">
      {/* Current plan info */}
      {currentPlan && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Crown className="w-5 h-5 text-primary" />
              Plano Atual
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xl font-bold text-foreground">
                  {(currentPlan as any).plan?.name || "—"}
                </p>
                <p className="text-sm text-muted-foreground">
                  Status: <Badge variant={currentPlan.status === 'active' ? 'default' : 'secondary'}>
                    {currentPlan.status === 'active' ? 'Ativo' : currentPlan.status}
                  </Badge>
                </p>
              </div>
              {currentPlan.current_period_end && (
                <p className="text-sm text-muted-foreground">
                  Próximo vencimento: {new Date(currentPlan.current_period_end).toLocaleDateString('pt-BR')}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Toggle */}
      <div className="flex items-center justify-center gap-3">
        <span className={`text-sm font-medium ${!isYearly ? 'text-foreground' : 'text-muted-foreground'}`}>
          Mensal
        </span>
        <Switch checked={isYearly} onCheckedChange={setIsYearly} />
        <span className={`text-sm font-medium ${isYearly ? 'text-foreground' : 'text-muted-foreground'}`}>
          Anual
        </span>
        {isYearly && (
          <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
            Economize 2 meses
          </Badge>
        )}
      </div>

      {/* Plans grid */}
      {(plansLoading || plansFetching) && plans.length === 0 && (
        <div className="flex min-h-52 items-center justify-center rounded-lg border bg-card/40">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando planos...
          </div>
        </div>
      )}

      {plansError && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="font-medium text-foreground">Nao foi possivel carregar os planos.</p>
            <p className="mt-1 text-sm text-muted-foreground">{(plansError as Error)?.message}</p>
          </CardContent>
        </Card>
      )}

      {!plansLoading && !plansFetching && !plansError && plans.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="font-medium text-foreground">Nenhum plano ativo encontrado.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              A lista de planos veio vazia. Ative ou crie planos no painel administrativo.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map((plan) => {
          const isCurrent = plan.id === currentPlanId;
          const isPro = plan.slug === 'pro';
          const isWizzyAI = plan.ai_mode === 'platform_api' || plan.slug === 'wizzy-ai' || plan.slug === 'max';
          const modules = (plan.allowed_modules || []) as string[];
          const configuredTrialDays = Number(entryConfig.trial_days || plan.trial_days || plan.features?.trial_days || 0);
          const trialDays = requiresCardTrial ? configuredTrialDays : Number(plan.trial_days || plan.features?.trial_days || 0);
          const trialEnabled = (requiresCardTrial || plan.features?.trial_enabled === true) && trialDays > 0;
          const price = isYearly ? (plan.price_yearly || plan.price_monthly * 10) : plan.price_monthly;

          return (
            <Card
              key={plan.id}
              className={`relative flex flex-col ${
                isPro ? 'border-primary shadow-lg shadow-primary/10' : ''
              } ${isCurrent ? 'ring-2 ring-primary/50' : ''}`}
            >
              {isPro && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-primary text-primary-foreground px-3">
                    <Sparkles className="w-3 h-3 mr-1" />
                    Mais popular
                  </Badge>
                </div>
              )}
              {isCurrent && (
                <div className="absolute -top-3 right-4">
                  <Badge variant="outline" className="bg-card">Atual</Badge>
                </div>
              )}
              <CardHeader className="pt-6">
                <CardTitle className="text-xl">{plan.name}</CardTitle>
                <div className="mt-4">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold text-foreground">
                      R$ {isYearly
                        ? Math.round((plan.price_yearly || plan.price_monthly * 10) / 12)
                        : plan.price_monthly}
                    </span>
                    <span className="text-muted-foreground">/mês</span>
                  </div>
                  {isYearly && (
                    <p className="text-xs text-muted-foreground mt-1">
                      R$ {(plan.price_yearly || plan.price_monthly * 10).toLocaleString('pt-BR')}/ano
                    </p>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center gap-2 text-sm py-1">
                    <Check className="w-4 h-4 text-green-500 shrink-0" />
                    <span className="text-muted-foreground">Wizzy CRM completo</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm py-1">
                    <Check className="w-4 h-4 text-green-500 shrink-0" />
                    <span className="text-muted-foreground">
                      {plan.max_team_members > 0 ? `Até ${plan.max_team_members} membros` : 'Membros ilimitados'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm py-1">
                    <Check className="w-4 h-4 text-green-500 shrink-0" />
                    <span className="text-muted-foreground">{formatStorage(plan.storage_limit_bytes)}</span>
                  </div>
                  {isWizzyAI ? (
                    <>
                      <div className="flex items-center gap-2 text-sm py-1">
                        <Check className="w-4 h-4 text-green-500 shrink-0" />
                        <span className="text-muted-foreground">Consumo de IA incluso no plano</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center gap-2 text-sm py-1">
                      <Check className="w-4 h-4 text-green-500 shrink-0" />
                      <span className="text-muted-foreground">Total controle do consumo de IA</span>
                    </div>
                  )}
                  {visibleModules.map((mod) => {
                    const has = modules.includes(mod);
                    return (
                      <div key={mod} className={`flex items-center gap-2 text-sm py-1 ${has ? '' : 'opacity-40'}`}>
                        {has ? (
                          <Check className="w-4 h-4 text-green-500 shrink-0" />
                        ) : (
                          <X className="w-4 h-4 shrink-0" />
                        )}
                        <span className="text-muted-foreground">{moduleLabels[mod] || mod}</span>
                      </div>
                    );
                  })}
                </div>
                <Button
                  className="w-full mt-6"
                  variant={isCurrent ? "outline" : isPro ? "default" : "outline"}
                  disabled={isCurrent || loadingPlanId === plan.id}
                  onClick={() => handleUpgrade(plan)}
                >
                  {isCurrent ? "Plano atual" : loadingPlanId === plan.id ? "Abrindo checkout..." : "Selecionar plano"}
                  {!isCurrent && <ArrowRight className="w-4 h-4 ml-1" />}
                </Button>
                {trialEnabled && !isCurrent && (
                  <div className="mt-3 rounded-md border bg-muted/30 p-3 text-center text-xs text-muted-foreground">
                    {requiresCardTrial ? (
                      <>
                        <p className="font-medium text-foreground">Paga agora: R$ 0,00</p>
                        <p className="mt-1">
                          Depois de {trialDays} dia{trialDays === 1 ? '' : 's'}: R$ {price.toLocaleString('pt-BR')}{isYearly ? '/ano' : '/mes'}.
                        </p>
                        <p className="mt-1">Pode cancelar antes da primeira cobranca.</p>
                      </>
                    ) : (
                      <p>Teste gratis por {trialDays} dias</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default PlanUpgradePanel;
