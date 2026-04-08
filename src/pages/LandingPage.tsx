import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  MessageSquare, Users, BarChart3, Bot, Zap, FileText,
  Calendar, Send, Shield, Check, X, ArrowRight, Star,
  Sparkles, Globe, Lock
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const features = [
  { icon: MessageSquare, title: "Conversas Inteligentes", description: "Gerencie todas as suas conversas do WhatsApp em um só lugar com organização por status e equipe." },
  { icon: Users, title: "Pipeline Visual", description: "Kanban visual para acompanhar cada lead do primeiro contato até o fechamento." },
  { icon: Zap, title: "Fluxos Automatizados", description: "Crie automações visuais sem código para disparar mensagens, mover leads e executar ações." },
  { icon: FileText, title: "Documentos & Templates", description: "Gere contratos e documentos automaticamente com campos preenchidos pela IA." },
  { icon: Bot, title: "Agentes de IA", description: "Agentes inteligentes que respondem, qualificam e agendam reuniões 24/7." },
  { icon: Calendar, title: "Agenda Integrada", description: "Agendamentos automáticos com Google Calendar diretamente pelo WhatsApp." },
  { icon: Send, title: "Campanhas em Massa", description: "Dispare fluxos para múltiplos contatos com controle de intervalo anti-bloqueio." },
  { icon: BarChart3, title: "Relatórios Avançados", description: "Dashboards com métricas de atendimento, desempenho de agentes e conversões." },
];

const moduleLabels: Record<string, string> = {
  conversations: "Conversas", pipeline: "Pipeline", contacts: "Contatos",
  flows: "Fluxos", documents: "Documentos", agents: "Agentes IA",
  reports: "Relatórios", campaigns: "Campanhas", calendar: "Agenda",
  orchestrator: "Orquestrador", ai: "Inteligência Artificial",
  widgets: "Widgets", settings: "Configurações", team: "Equipe",
  scheduled: "Agendamento", integrations: "Integrações",
};

const visibleModules = [
  "conversations", "pipeline", "contacts", "flows", "documents",
  "agents", "reports", "campaigns", "calendar", "orchestrator", "ai"
];

const LandingPage = () => {
  const [isYearly, setIsYearly] = useState(false);
  const navigate = useNavigate();

  const { data: plans, isLoading: plansLoading } = useQuery({
    queryKey: ['public-plans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_plans')
        .select('*')
        .eq('is_active', true)
        .order('price_monthly', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const formatStorage = (bytes: number) => {
    const gb = bytes / (1024 * 1024 * 1024);
    return gb >= 1 ? `${gb} GB` : `${Math.round(bytes / (1024 * 1024))} MB`;
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-foreground">WizzyAI</span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => navigate("/auth")}>
              Entrar
            </Button>
            <Button onClick={() => navigate("/auth")}>
              Começar grátis
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="py-20 sm:py-32 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <Badge variant="secondary" className="mb-6 px-4 py-1.5 text-sm">
            <Sparkles className="w-3.5 h-3.5 mr-1.5" />
            Plataforma completa de atendimento via WhatsApp
          </Badge>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground tracking-tight leading-tight">
            Transforme seu WhatsApp em uma{" "}
            <span className="text-primary">máquina de vendas</span>
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto">
            Automatize atendimentos, gerencie leads com pipeline visual,
            gere documentos com IA e feche mais negócios — tudo em um só lugar.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" className="text-base px-8" onClick={() => navigate("/auth")}>
              Começar agora — é grátis
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
            <Button size="lg" variant="outline" className="text-base px-8" onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })}>
              Ver planos
            </Button>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4 bg-muted/30">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
              Tudo que você precisa para escalar
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Uma plataforma completa para gerenciar seu atendimento e vendas pelo WhatsApp
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="bg-card rounded-xl p-6 border border-border/50 hover:shadow-lg hover:border-primary/20 transition-all duration-300"
              >
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <feature.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Social proof */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="flex items-center justify-center gap-1 mb-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <Star key={i} className="w-5 h-5 fill-yellow-400 text-yellow-400" />
            ))}
          </div>
          <p className="text-lg text-muted-foreground italic">
            "O WizzyAI revolucionou nosso atendimento. Antes levávamos horas para responder, agora nossos agentes de IA atendem em segundos."
          </p>
          <p className="mt-4 font-medium text-foreground">— Escritório de Advocacia</p>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 px-4 bg-muted/30">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
              Escolha o plano ideal
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Comece pequeno e escale conforme seu crescimento
            </p>
            <div className="flex items-center justify-center gap-3 mt-8">
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
          </div>

          {/* Plan cards - dynamic from DB */}
          {plansLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-[500px] rounded-2xl" />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
              {(plans || []).map((plan: any, idx: number) => {
                const modules: string[] = plan.allowed_modules || [];
                const isPro = plan.slug === 'pro';
                const priceYearly = plan.price_yearly || plan.price_monthly * 10;

                return (
                  <div
                    key={plan.id}
                    className={`relative bg-card rounded-2xl border-2 p-8 flex flex-col ${
                      isPro
                        ? 'border-primary shadow-xl shadow-primary/10 scale-[1.02]'
                        : 'border-border/50'
                    }`}
                  >
                    {isPro && (
                      <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                        <Badge className="bg-primary text-primary-foreground px-4 py-1">
                          Mais popular
                        </Badge>
                      </div>
                    )}
                    <h3 className="text-2xl font-bold text-foreground">{plan.name}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{plan.description || ''}</p>
                    <div className="mt-6">
                      <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-bold text-foreground">
                          R$ {isYearly
                            ? Math.round(priceYearly / 12)
                            : plan.price_monthly}
                        </span>
                        <span className="text-muted-foreground">/mês</span>
                      </div>
                      {isYearly && (
                        <p className="text-sm text-muted-foreground mt-1">
                          Cobrado R$ {priceYearly.toLocaleString('pt-BR')}/ano
                        </p>
                      )}
                    </div>

                    <Button
                      className="mt-6 w-full"
                      variant={isPro ? "default" : "outline"}
                      size="lg"
                      onClick={() => navigate("/auth")}
                    >
                      Começar agora
                    </Button>

                    <div className="mt-8 space-y-1">
                      <p className="text-sm font-medium text-foreground mb-3">Inclui:</p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground py-1.5">
                        <Check className="w-4 h-4 text-green-500 shrink-0" />
                        <span>Até {plan.max_team_members} membros</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground py-1.5">
                        <Check className="w-4 h-4 text-green-500 shrink-0" />
                        <span>{formatStorage(plan.storage_limit_bytes)} de armazenamento</span>
                      </div>
                      {visibleModules.map((mod) => {
                        const has = modules.includes(mod);
                        return (
                          <div key={mod} className={`flex items-center gap-2 text-sm py-1.5 ${has ? 'text-muted-foreground' : 'text-muted-foreground/40'}`}>
                            {has ? (
                              <Check className="w-4 h-4 text-green-500 shrink-0" />
                            ) : (
                              <X className="w-4 h-4 text-muted-foreground/40 shrink-0" />
                            )}
                            <span>{moduleLabels[mod] || mod}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Security */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="flex items-center justify-center gap-4 mb-6">
            <Shield className="w-8 h-8 text-primary" />
            <Lock className="w-8 h-8 text-primary" />
            <Globe className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-2xl font-bold text-foreground">Segurança de nível empresarial</h3>
          <p className="mt-3 text-muted-foreground max-w-xl mx-auto">
            Seus dados são protegidos com criptografia, isolamento multi-tenant e políticas de acesso granular (RLS).
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 bg-primary">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-primary-foreground">
            Pronto para transformar seu atendimento?
          </h2>
          <p className="mt-4 text-lg text-primary-foreground/80">
            Comece agora e veja resultados em minutos.
          </p>
          <Button
            size="lg"
            variant="secondary"
            className="mt-8 text-base px-8"
            onClick={() => navigate("/auth")}
          >
            Criar conta grátis
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-border">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-primary flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-foreground">WizzyAI</span>
          </div>
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} WizzyAI. Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;