import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, X, Crown, Sparkles, ArrowRight } from "lucide-react";
import { toast } from "sonner";

const moduleLabels: Record<string, string> = {
  conversations: "Conversas", pipeline: "Pipeline", contacts: "Contatos",
  flows: "Fluxos", documents: "Wizzy Sign", agents: "Agentes IA",
  reports: "Relatórios", campaigns: "Campanhas", calendar: "Agenda",
  orchestrator: "Orquestrador", ai: "Inteligência Artificial",
  widgets: "Wizzy Forms", settings: "Configurações", team: "Equipe",
  scheduled: "Programados", integrations: "Integrações",
};

const visibleModules = [
  "documents", "widgets", "quiz"
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
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

const PlanUpgradePanel = () => {
  const { profile } = useAuth();
  const [isYearly, setIsYearly] = useState(false);
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);

  const { data: plans } = useQuery({
    queryKey: ['platform-plans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_plans')
        .select('*')
        .eq('is_active', true)
        .order('price_monthly', { ascending: true });
      if (error) throw error;
      return (data || []) as Plan[];
    },
  });

  const { data: currentPlan } = useQuery({
    queryKey: ['current-org-plan', profile?.organization_id],
    queryFn: async () => {
      if (!profile?.organization_id) return null;
      const { data, error } = await supabase
        .from('organization_plans')
        .select('*, plan:platform_plans(*)')
        .eq('organization_id', profile.organization_id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.organization_id,
  });

  const currentPlanId = currentPlan?.plan_id;

  const formatStorage = (bytes: number) => {
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb} GB`;
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
        }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) throw new Error(data?.error || 'Nao foi possivel iniciar o checkout.');
      if (!data?.url) throw new Error('Checkout não retornou uma URL de pagamento.');

      window.location.href = data.url;
    } catch (error: any) {
      toast.error(error?.message || 'Nao foi possivel iniciar o checkout.');
    } finally {
      setLoadingPlanId(null);
    }
  };

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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans?.map((plan) => {
          const isCurrent = plan.id === currentPlanId;
          const isPro = plan.slug === 'pro';
          const isWizzyAI = plan.ai_mode === 'platform_api' || plan.slug === 'wizzy-ai' || plan.slug === 'max';
          const modules = (plan.allowed_modules || []) as string[];
          const trialDays = Number(plan.trial_days || plan.features?.trial_days || 0);
          const trialEnabled = plan.features?.trial_enabled === true && trialDays > 0;

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
                    <span className="text-muted-foreground">Até {plan.max_team_members} membros</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm py-1">
                    <Check className="w-4 h-4 text-green-500 shrink-0" />
                    <span className="text-muted-foreground">{formatStorage(plan.storage_limit_bytes)}</span>
                  </div>
                  {isWizzyAI ? (
                    <>
                      <div className="flex items-center gap-2 text-sm py-1">
                        <Check className="w-4 h-4 text-green-500 shrink-0" />
                        <span className="text-muted-foreground">Wizzy AI disponivel apenas no plano Max</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm py-1">
                        <Check className="w-4 h-4 text-green-500 shrink-0" />
                        <span className="text-muted-foreground">Todo consumo de IA por nossa conta</span>
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
                  <p className="mt-2 text-center text-xs text-muted-foreground">
                    Teste gratis por {trialDays} dias
                  </p>
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
