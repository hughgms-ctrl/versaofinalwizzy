import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, CalendarClock, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { clearSelectedEntryPlan, getSelectedEntryPlan, getStoredEntryAssignment, trackEntryEvent } from "@/lib/entryFlow";
import { trackMetaEvent } from "@/lib/metaPixel";
import wizzyLogo from "@/assets/wizzy-logo.png";

type Plan = {
  id: string;
  name: string;
  slug: string;
  price_monthly: number;
  price_yearly?: number | null;
  trial_days?: number | null;
  features?: any;
};

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://zaobtetbjpuzibjymhzw.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inphb2J0ZXRianB1emlianltaHp3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMzc5MzksImV4cCI6MjA4NzcxMzkzOX0.HBUI1OK1eYq9FE2SzIvuAkxuCG0frApCQZqcjjDx43k";

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

async function fetchPlans(): Promise<Plan[]> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/billing-plans?t=${Date.now()}`, {
    cache: "no-store",
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      "Content-Type": "application/json",
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || "Nao foi possivel carregar os planos.");
  return payload?.plans || [];
}

export default function CheckoutNoticePage() {
  const navigate = useNavigate();
  const [isStartingCheckout, setIsStartingCheckout] = useState(false);
  const assignment = getStoredEntryAssignment();
  const params = new URLSearchParams(window.location.search);
  const selectedPlanSlug = params.get("selected_plan") || getSelectedEntryPlan();
  const trialDaysFromConfig = Number(assignment?.config?.trial_days || 0);

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["checkout-notice-plans"],
    queryFn: fetchPlans,
    staleTime: 0,
  });

  const plan = useMemo(
    () => plans.find((item) => item.slug === selectedPlanSlug) || null,
    [plans, selectedPlanSlug],
  );

  const trialDays = Math.max(0, trialDaysFromConfig || Number(plan?.trial_days || plan?.features?.trial_days || 0));
  const firstChargeDate = addDays(new Date(), trialDays);
  const monthlyPrice = Number(plan?.price_monthly || 0);

  useEffect(() => {
    if (assignment?.flow_type === "trial_auto" && assignment?.config?.require_card !== true) {
      navigate("/dashboard", { replace: true });
    }
  }, [assignment?.flow_type, assignment?.config?.require_card, navigate]);

  const startCheckout = async () => {
    if (!plan) {
      navigate("/plans");
      return;
    }

    setIsStartingCheckout(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const accessToken = session.session?.access_token;
      if (!accessToken) throw new Error("Sessao expirada. Entre novamente para continuar.");

      const response = await fetch(`${SUPABASE_URL}/functions/v1/billing-checkout`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          plan_id: plan.id,
          billing_cycle: "monthly",
          entry_flow_config: assignment?.config || {},
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Nao foi possivel iniciar o checkout.");
      if (!data?.url) throw new Error("O checkout nao retornou uma URL de pagamento.");

      trackMetaEvent("InitiateCheckout", {
        content_ids: plan.id,
        content_name: plan.name,
        content_type: "subscription_plan",
        currency: "BRL",
        value: monthlyPrice,
        billing_cycle: "monthly",
      });

      await trackEntryEvent("checkout_started", {
        plan_id: plan.id,
        plan_slug: plan.slug,
        plan_name: plan.name,
        billing_cycle: "monthly",
        provider: data?.provider || null,
      }).catch(() => undefined);

      clearSelectedEntryPlan();
      window.location.href = data.url;
    } catch (error: any) {
      toast.error(error?.message || "Nao foi possivel iniciar o checkout.");
      setIsStartingCheckout(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f8fb] px-4 py-8 text-slate-950">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl flex-col justify-center">
        <button
          type="button"
          onClick={() => navigate("/plans")}
          className="mb-8 inline-flex w-fit items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar aos planos
        </button>

        <Card className="border-slate-200 bg-white shadow-xl shadow-slate-200/70">
          <CardContent className="p-8 sm:p-10">
            <div className="mb-8 flex items-center gap-3">
              <img src={wizzyLogo} alt="Wizzy" className="h-11 w-11 rounded-xl object-contain" />
              <div>
                <p className="text-sm font-semibold text-slate-500">Checkout seguro</p>
                <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Antes de continuar</h1>
              </div>
            </div>

            {isLoading ? (
              <div className="flex min-h-64 items-center justify-center text-sm text-slate-500">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Carregando informacoes do plano...
              </div>
            ) : (
              <>
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
                    <div>
                      <p className="text-lg font-black text-emerald-950">Voce nao pagara nada agora.</p>
                      <p className="mt-2 leading-7 text-emerald-900">
                        Seu teste gratis dura {trialDays || "alguns"} dia{trialDays === 1 ? "" : "s"}. O plano {plan?.name || "selecionado"} sera cobrado ao fim desse periodo, e voce pode cancelar antes da primeira cobranca.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 p-4">
                    <p className="text-xs font-bold uppercase text-slate-500">Hoje</p>
                    <p className="mt-2 text-2xl font-black">R$ 0,00</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 p-4">
                    <p className="text-xs font-bold uppercase text-slate-500">Primeira cobranca</p>
                    <div className="mt-2 flex items-center gap-2 text-2xl font-black">
                      <CalendarClock className="h-5 w-5 text-slate-500" />
                      {firstChargeDate.toLocaleDateString("pt-BR")}
                    </div>
                    <p className="mt-1 text-sm text-slate-500">{formatCurrency(monthlyPrice)} / mes</p>
                  </div>
                </div>

                <Button
                  onClick={startCheckout}
                  disabled={isStartingCheckout || !plan}
                  className="mt-8 h-13 w-full bg-slate-950 text-base font-bold text-white hover:bg-slate-800"
                >
                  {isStartingCheckout ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Abrindo checkout...
                    </>
                  ) : (
                    <>
                      Continuar para checkout seguro
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </>
                  )}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
