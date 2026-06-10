import React, { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Bot,
  Calendar,
  Check,
  FileSignature,
  HelpCircle,
  LayoutTemplate,
  MessageSquare,
  Quote,
  Scale,
  Sparkles,
  Star,
  Workflow,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { assignEntryFlow, EntryFlowAssignment, getStoredEntryAssignment, setSelectedEntryPlan, trackEntryEvent } from "@/lib/entryFlow";
import { trackMetaCustomEvent, trackMetaEvent } from "@/lib/metaPixel";
import wizzyLogo from "@/assets/wizzy-logo.png";

type Product = {
  icon: React.ElementType;
  name: string;
  emoji: string;
  tag?: string;
  description: string;
  features: string[];
  featured?: boolean;
};

type PlatformPlan = {
  id: string;
  slug: string;
  name: string;
  price_monthly: number;
  price_yearly: number | null;
  trial_days?: number | null;
  allowed_modules: string[] | null;
  max_team_members: number | null;
  max_conversations?: number | null;
  max_ai_requests_month?: number | null;
  storage_limit_bytes: number;
  ai_mode?: string | null;
  is_active: boolean;
  features?: any;
};

const trustStats = [
  ["24/7", "Atendimento automático"],
  ["5 min", "Para ativar o primeiro agente"],
];

const dashboardAgents: Array<[string, string, string, typeof Scale]> = [
  ["Agente de Triagem Trabalhista", "Qualificando leads no WhatsApp agora", "ATIVO", Scale],
  ["Agente de Agendamento", "3 consultas fechadas nas últimas 2h", "ATIVO", Calendar],
  ["Agente de Documentos", "Coletando docs do processo 001/2026", "ATIVO", FileSignature],
];

const pains = [
  "Leads qualificados às 3h da manhã que ninguém respondeu",
  'WhatsApp pessoal invadido por clientes perguntando "como está meu processo?"',
  "Horas perdidas em marcação de consultas e cobrança de documentos",
  "Ferramentas técnicas que precisam de programador para funcionar",
];

const solves = [
  "Agentes treinados com linguagem e ética OAB",
  "Ativo em menos de 5 minutos",
  "Do lead até a assinatura do contrato, automatizado",
  "Sem webhooks, sem Make, sem ChatGPT separado",
  "Funciona 24/7, você foca só em advogar",
];

const products: Product[] = [
  {
    icon: Bot,
    emoji: "AI",
    name: "Wizzy CRM",
    tag: "CARRO-CHEFE",
    featured: true,
    description:
      "O centro de comando do seu escritório. Agentes de IA que captam, qualificam e fecham clientes 24/7 - enquanto você dorme, trabalha, ou está em audiência.",
    features: [
      "Agentes de IA jurídicos prontos para ativar",
      "Pipeline com movimentação automática e notificações",
      "Campanhas e agendamento de mensagens",
      "Follow-ups automáticos e personalizados por área",
      "Fluxos de atendimento do lead ao fechamento",
    ],
  },
  {
    icon: FileSignature,
    emoji: "SG",
    name: "Wizzy Sign",
    description:
      "Assinatura digital integrada. Chega de ZapSign, HelloSign ou qualquer outra ferramenta separada. Assine contratos direto no Wizzy.",
    features: [
      "Assinatura digital com validade jurídica",
      "Envio automático após qualificação do lead",
      "Histórico e auditoria de documentos",
    ],
  },
  {
    icon: Workflow,
    emoji: "FL",
    name: "Wizzy Flow",
    description:
      "Gestão de projetos do escritório. Crie projetos, organize prazos, delegue tarefas e acompanhe tudo em calendário, timeline e kanban.",
    features: [
      "Projetos com prazos, responsáveis e tarefas atribuídas",
      "Colaboração entre advogados, equipe e estagiários",
      "Visualização em calendário, timeline e kanban",
    ],
  },
  {
    icon: HelpCircle,
    emoji: "QZ",
    name: "Wizzy Quest",
    description:
      "Qualifique leads antes mesmo de falar com eles. Quizzes inteligentes que filtram quem tem caso viável - e já segmentam por área do direito.",
    features: [
      "Quizzes personalizados por área jurídica",
      "Qualificação prévia automática",
      "Integração direta com o CRM",
    ],
  },
  {
    icon: LayoutTemplate,
    emoji: "FM",
    name: "Wizzy Forms",
    description:
      "Formulários inteligentes para coleta de dados de clientes e documentos. Chega de planilha do Excel para organizar informações.",
    features: [
      "Formulários customizáveis por tipo de caso",
      "Coleta automática de documentos e dados",
      "Dados direto no pipeline do CRM",
    ],
  },
];

const soonProducts = [
  ["Wizzy Pages", "Landing pages com IA e SEO otimizado para captar clientes"],
  ["Wizzy Carrossel", "Fábrica de carrosséis prontos para Instagram e LinkedIn"],
  ["Wizzy CNIS", "Análise automática de CNIS para previdenciário"],
  ["E muito mais", "Sempre novos módulos para facilitar a vida do advogado"],
];

const agents = [
  [
    "Triagem & Qualificação",
    "Atende o lead no WhatsApp, identifica a área do direito (Trabalhista, Previdenciário, Cível, Família) e filtra automaticamente se há viabilidade jurídica no caso.",
    "Você só fala com clientes que têm casos reais e lucrativos. Fim do desperdício de tempo com leads ruins.",
  ],
  [
    "Agendamento de Consultas",
    'Conversa com o lead qualificado, apresenta seus horários disponíveis e fecha a consulta direto na sua agenda - sem "vai e vem" de mensagens.',
    "Agenda de consultas cheia sem você abrir o WhatsApp uma única vez para marcar horário.",
  ],
  [
    "Coleta de Documentos",
    "Solicita, cobra e organiza os documentos necessários para a análise inicial do caso (RG, comprovante, termos de rescisão, CNIS, etc.).",
    "Processo pronto para análise sem que sua secretária precise cobrar o cliente dez vezes. Zero esforço humano.",
  ],
  [
    "Envio & Assinatura de Contrato",
    "Ao final da qualificação, envia automaticamente o contrato de honorários via Wizzy Sign e acompanha até a assinatura ser concluída.",
    "Do lead ao cliente assinado - tudo automatizado. Você só aparece para advogar de fato.",
  ],
];

const testimonials = [
  [
    "Dr. Carlos Eduardo",
    "Advogado Trabalhista - São Paulo, SP",
    "O Wizzy mudou completamente o patamar do meu escritório. O agente de triagem atende os leads de tráfego pago no WhatsApp de madrugada, qualifica quem realmente tem direito e eu já acordo com as consultas agendadas para o dia. Não precisei mexer em uma única linha de código, não precisei aprender nada técnico.",
  ],
  [
    "Dra. Ana Machado",
    "Advogada Previdenciária - Belo Horizonte, MG",
    "Em 3 meses com o Wizzy, minha captação de clientes previdenciários triplicou. O agente conversa com o lead, identifica sinais de direito a benefício e me manda o resumo. Eu só entro para dar andamento no caso.",
  ],
  [
    "Dr. Rodrigo Ferreira",
    "Advogado de Família - Curitiba, PR",
    "Sempre achei que IA era coisa de startup de tecnologia, não para escritório de advocacia. O Wizzy me provou o contrário. Tudo que eu precisava já estava pronto, só ativei. Em poucos dias meu WhatsApp ficou organizado.",
  ],
];

const extraModuleLabels: Record<string, string> = {
  documents: "Wizzy Sign",
  widgets: "Wizzy Forms",
  quiz: "Wizzy Quest",
  wizzy_flow: "Wizzy Flow",
};

const orderedExtraModules = ["documents", "widgets", "quiz", "wizzy_flow"];
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://zaobtetbjpuzibjymhzw.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inphb2J0ZXRianB1emlianltaHp3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMzc5MzksImV4cCI6MjA4NzcxMzkzOX0.HBUI1OK1eYq9FE2SzIvuAkxuCG0frApCQZqcjjDx43k";

const faqs = [
  [
    "Preciso saber programar ou mexer com tecnologia?",
    "Absolutamente não. O Wizzy foi construído exatamente para isso - para que você não precise aprender nada técnico. Você ativa os agentes em um painel visual simples, sem código, sem prompt engineering, sem configurações de webhook. Se você sabe usar WhatsApp, sabe usar o Wizzy.",
  ],
  [
    "Os agentes respeitam o Código de Ética da OAB?",
    "Sim. Os agentes do Wizzy foram treinados com as diretrizes do Código de Ética e Disciplina da OAB. Eles atuam de forma consultiva e informativa - nunca fazem captação vedada, nunca prometem resultados, e sempre direcionam o cliente para a consulta com o advogado. Você revisa e personaliza o tom de cada agente antes de ativar.",
  ],
  [
    "Em quanto tempo começo a ver resultados?",
    "A maioria dos escritórios começa a ver resultados no primeiro dia - literalmente. Assim que você ativa o agente de triagem e conecta o WhatsApp, ele começa a responder leads automaticamente. Em uma semana você já tem dados concretos de quantos leads foram qualificados, quantas consultas foram agendadas e quanto tempo você economizou.",
  ],
  [
    "O que acontece com os dados dos meus clientes?",
    "Seus dados são seus. O Wizzy opera em total conformidade com a LGPD. Seus dados de clientes são armazenados com criptografia, em servidores seguros, e nunca são compartilhados com terceiros. Você pode exportar tudo a qualquer momento.",
  ],
  [
    "Funciona para qualquer área do direito?",
    "Sim. O Wizzy tem templates prontos para Direito do Trabalho, Previdenciário, Cível, Família, Empresarial e Consumidor. Cada template já traz os agentes configurados com a linguagem e os fluxos específicos daquela área. Você ativa com um clique e personaliza o que quiser.",
  ],
  [
    "Posso cancelar quando quiser?",
    "Sim. Sem fidelidade, sem multa. Se você não estiver satisfeito, cancela em um clique no painel. Não acreditamos em prender clientes com contratos - acreditamos em retê-los com resultado.",
  ],
];

function useInView<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, inView };
}

const Reveal = ({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) => {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-700 ease-out ${inView ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"} ${className}`}
    >
      {children}
    </div>
  );
};

const SectionHeader = ({ tag, title, subtitle }: { tag: string; title: React.ReactNode; subtitle?: string }) => (
  <div className="mx-auto mb-14 max-w-3xl text-center">
    <p className="text-xs font-bold uppercase tracking-[0.24em] text-pink-300">{tag}</p>
    <h2 className="mt-4 text-3xl font-black leading-tight tracking-tight text-white sm:text-5xl">{title}</h2>
    {subtitle && <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-slate-400">{subtitle}</p>}
  </div>
);

const Em = ({ children }: { children: React.ReactNode }) => (
  <span className="font-serif italic font-normal text-pink-300">{children}</span>
);

const formatCurrency = (value: number) => value.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

const formatStorage = (bytes: number) => {
  if (!bytes) return "Armazenamento conforme o plano";
  if (bytes >= 1024 * 1024 * 1024) return `${Math.round(bytes / (1024 * 1024 * 1024))} GB de armazenamento`;
  return `${Math.round(bytes / (1024 * 1024))} MB de armazenamento`;
};

const formatLimit = (value: number | null | undefined, singular: string, plural: string) => {
  if (!value || value <= 0) return `${plural} ilimitados`;
  return value === 1 ? `1 ${singular}` : `${value} ${plural}`;
};

const getPlanAudience = (plan: PlatformPlan) => {
  const slug = plan.slug.toLowerCase();
  if (slug.includes("pro")) return "Para escritórios que querem crescer com IA em todo o funil.";
  if (slug.includes("max") || slug.includes("scale") || slug.includes("escritorio")) return "Para escritórios maiores com múltiplos advogados e alta demanda.";
  return "Para advogados solo que querem automatizar o primeiro contato.";
};

const buildPlanFeatures = (plan: PlatformPlan) => {
  const limits = plan.features?.limits || {};
  const modules = plan.allowed_modules || [];
  const features = [
    "Wizzy CRM completo",
    formatLimit(plan.max_team_members, "membro", "membros"),
    formatLimit(limits.max_workspaces, "workspace", "workspaces"),
    formatLimit(limits.max_whatsapp_numbers, "número WhatsApp", "números WhatsApp"),
    formatStorage(plan.storage_limit_bytes),
    plan.ai_mode === "platform_api" ? "Consumo de IA incluso no plano" : "Controle total do seu consumo de IA conectando sua chave",
  ];

  orderedExtraModules.forEach((module) => {
    if (modules.includes(module)) features.push(extraModuleLabels[module]);
  });

  return features;
};

const buildMutedFeatures = (plan: PlatformPlan) => {
  const modules = plan.allowed_modules || [];
  return orderedExtraModules.filter((module) => !modules.includes(module)).map((module) => extraModuleLabels[module]);
};

const freeTrialCtaFlows = ["trial_auto", "freemium", "access_limited_payment"];

export default function LandingPage() {
  const navigate = useNavigate();
  const [annual, setAnnual] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);
  const [entryAssignment, setEntryAssignment] = useState<EntryFlowAssignment | null>(() => getStoredEntryAssignment());

  const { data: adminPlans = [], isLoading: plansLoading, error: plansError } = useQuery({
    queryKey: ["landing-platform-plans"],
    queryFn: async () => {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/billing-plans`, {
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
          "Content-Type": "application/json",
        },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "Não foi possível carregar os planos.");
      return (payload?.plans || []) as PlatformPlan[];
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    let cancelled = false;
    assignEntryFlow(window.location.pathname)
      .then((assignment) => {
        if (!cancelled) setEntryAssignment(assignment);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const goToAuth = async (selectedPlanSlug?: string) => {
    setSelectedEntryPlan(selectedPlanSlug);
    trackMetaEvent("Lead", {
      content_name: selectedPlanSlug ? `Plano ${selectedPlanSlug}` : "CTA landing",
      content_category: selectedPlanSlug ? "pricing_plan" : "landing_cta",
    });
    trackMetaCustomEvent("LandingCtaClicked", {
      selected_plan: selectedPlanSlug || null,
      path: window.location.pathname,
    });
    try {
      const assignment = await assignEntryFlow(window.location.pathname);
      setEntryAssignment(assignment);
      await trackEntryEvent("landing_cta_clicked", { target: assignment.redirect_path, selected_plan: selectedPlanSlug || null });
      if (assignment.redirect_path.startsWith("http")) {
        window.location.href = assignment.redirect_path;
        return;
      }
      navigate(assignment.redirect_path);
    } catch (error) {
      console.error("entry flow assignment failed", error);
      navigate("/auth");
    }
  };

  const displayedPlans = adminPlans;
  const flowType = entryAssignment?.flow_type || "payment_first";
  const isTrialFlow = freeTrialCtaFlows.includes(flowType);
  const primaryCta = isTrialFlow ? "Testar grátis" : "Começar agora";
  const heroCta = isTrialFlow ? "Testar grátis" : "Ativar meu primeiro agente";
  const finalCta = isTrialFlow ? "Testar grátis" : "Ativar meu escritório agora";
  const trackLandingButtonClick = (label: string, target: string) => {
    trackMetaCustomEvent("LandingButtonClicked", {
      label,
      target,
      path: window.location.pathname,
    });
  };

  return (
    <div className="dark min-h-screen overflow-x-hidden bg-[#0b0b12] text-slate-100 antialiased">
      <style>{`
        @keyframes aurora {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); opacity: .65; }
          50% { transform: translate3d(24px, -18px, 0) scale(1.08); opacity: 1; }
        }
        @keyframes floaty {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-12px); }
        }
        .animate-aurora { animation: aurora 12s ease-in-out infinite; }
        .animate-floaty { animation: floaty 7s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .animate-aurora, .animate-floaty { animation: none; }
        }
      `}</style>

      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0b0b12]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <a href="#hero" className="flex items-center gap-3">
            <img src={wizzyLogo} alt="Wizzy" className="h-10 w-10 rounded-xl object-contain" />
            <span className="text-2xl font-black tracking-tight text-white">Wizzy</span>
          </a>

          <nav className="hidden items-center gap-9 text-sm font-medium text-slate-400 md:flex">
            <a href="#produtos" className="transition hover:text-white">Produtos</a>
            <a href="#agentes" onClick={() => trackLandingButtonClick("Agentes", "agentes")} className="transition hover:text-white">Agentes</a>
            <a href="#planos" onClick={() => trackLandingButtonClick("Planos", "planos")} className="transition hover:text-white">Planos</a>
            <a href="#faq" className="transition hover:text-white">FAQ</a>
          </nav>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                trackLandingButtonClick("Acessar conta", "auth");
                navigate("/auth");
              }}
              className="inline-flex rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-bold text-slate-200 transition hover:bg-white/10 hover:text-white sm:px-5"
            >
              Entrar
            </button>
            <a href="#planos" onClick={() => trackLandingButtonClick(primaryCta, "planos")} className="rounded-xl bg-gradient-to-r from-pink-500 to-orange-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-pink-500/25 transition hover:from-pink-600 hover:to-orange-600">
              {primaryCta}
            </a>
          </div>
        </div>
      </header>

      <main>
        <section id="hero" className="relative overflow-hidden px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_at_center,black_25%,transparent_75%)]" />
          <div className="pointer-events-none absolute -left-32 top-0 h-[560px] w-[760px] rounded-full bg-pink-500/12 blur-[120px]" />
          <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[580px] rounded-full bg-orange-500/12 blur-[120px]" />

          <div className="relative mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[1.02fr_0.98fr]">
            <Reveal>
              <Badge className="mb-8 border border-pink-500/30 bg-pink-500/15 px-4 py-2 text-pink-100 hover:bg-pink-500/15">
                <span className="mr-2 h-1.5 w-1.5 rounded-full bg-pink-300" />
                IA Jurídica Plug'n'Play - para advogados reais
              </Badge>
              <h1 className="max-w-4xl text-5xl font-black leading-[1.03] tracking-tight text-white sm:text-6xl lg:text-7xl">
                A IA no seu escritório trabalhando <Em>24/7</Em>, sem você fazer nada técnico.
              </h1>
              <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300">
                Chega de aprender Claude Code, GPT, Make ou qualquer framework. O Wizzy entrega <strong className="font-semibold text-white">agentes de IA jurídicos prontos</strong> - você ativa, eles trabalham.
              </p>
              <div className="mt-9 flex flex-col gap-4 sm:flex-row">
                <a href="#planos" onClick={() => trackLandingButtonClick(heroCta, "planos")} className="inline-flex h-13 items-center justify-center rounded-xl bg-gradient-to-r from-pink-500 to-orange-500 px-8 py-4 text-base font-bold text-white shadow-xl shadow-pink-500/25 transition hover:-translate-y-0.5 hover:from-pink-600 hover:to-orange-600">
                  {heroCta}
                </a>
                <a href="#agentes" onClick={() => trackLandingButtonClick("Ver como funciona", "agentes")} className="inline-flex h-13 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-8 py-4 text-base font-semibold text-slate-200 transition hover:bg-white/10 hover:text-white">
                  Ver como funciona
                  <ArrowRight className="h-4 w-4" />
                </a>
              </div>
              <div className="mt-16 border-t border-white/10 pt-9">
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">Plugue a IA no seu dia a dia e mude seus resultados</p>
                <div className="mt-5 flex flex-wrap gap-10">
                  {trustStats.map(([value, label]) => (
                    <div key={label}>
                      <p className="text-3xl font-black text-white">{value}</p>
                      <p className="mt-1 text-sm text-slate-400">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>

            <Reveal delay={120} className="relative">
              <div className="absolute -inset-8 animate-aurora rounded-full bg-pink-500/10 blur-3xl" />
              <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035] shadow-2xl shadow-black/40 backdrop-blur">
                <div className="flex items-center gap-2 border-b border-white/10 bg-white/[0.04] px-5 py-4">
                  <span className="h-3 w-3 rounded-full bg-red-400" />
                  <span className="h-3 w-3 rounded-full bg-yellow-400" />
                  <span className="h-3 w-3 rounded-full bg-emerald-400" />
                  <span className="ml-3 truncate text-xs font-medium text-slate-500">Wizzy CRM - Escritório Silva & Associados</span>
                </div>
                <div className="space-y-3 p-5">
                  <div className="rounded-2xl border border-pink-500/30 bg-pink-500/10 p-4">
                    <div className="flex items-center justify-between gap-6">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-pink-200">Leads atendidos hoje</p>
                        <p className="mt-1 text-sm text-slate-400">Enquanto você dormia</p>
                      </div>
                      <p className="text-4xl font-black text-white">47</p>
                    </div>
                  </div>
                  {dashboardAgents.map(([name, desc, status, Icon], index) => (
                    <div
                      key={String(name)}
                      className="animate-floaty rounded-2xl border border-white/10 bg-[#11111b] p-4"
                      style={{ animationDelay: `${index * 0.35}s` }}
                    >
                      <div className="flex items-center gap-4">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-pink-500/15 text-pink-200">
                          {typeof Icon !== "string" && <Icon className="h-5 w-5" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-white">{name}</p>
                          <p className="mt-1 truncate text-xs text-slate-400">{desc}</p>
                        </div>
                        <Badge className={status === "ATIVO" ? "border border-emerald-500/30 bg-emerald-500/15 text-emerald-100" : "border border-orange-500/30 bg-orange-500/15 text-orange-100"}>
                          {status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="bg-[#11111b] px-4 py-24 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-7xl items-start gap-10 lg:grid-cols-[1fr_0.9fr]">
            <Reveal>
              <h2 className="text-4xl font-black leading-tight tracking-tight text-white sm:text-5xl">
                IA existe para todos. Mas advogado <Em>não tem tempo</Em> para aprender.
              </h2>
              <p className="mt-6 text-lg leading-8 text-slate-400">
                ChatGPT, Claude, Make, n8n, Zapier, webhooks, prompts... Você virou advogado para <strong className="text-white">advogar</strong>, não para virar desenvolvedor de automações.
              </p>
              <p className="mt-5 text-lg leading-8 text-slate-400">
                Enquanto isso, leads chegam e somem, clientes ligam perguntando de processos, a agenda fica bagunçada - e o dinheiro fica na mesa.
              </p>
              <div className="mt-8 space-y-3">
                {pains.map((pain) => (
                  <div key={pain} className="flex gap-3 rounded-2xl border border-white/10 bg-[#0b0b12] p-4 text-sm text-slate-300">
                    <X className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                    <span>{pain}</span>
                  </div>
                ))}
              </div>
            </Reveal>

            <Reveal delay={120}>
              <div className="rounded-3xl border border-pink-500/25 bg-gradient-to-b from-pink-500/10 to-white/[0.03] p-7 shadow-2xl shadow-pink-500/10">
                <h3 className="text-4xl font-black leading-tight text-white">
                  Plugou. Ativou. <Em>Cresceu.</Em>
                </h3>
                <p className="mt-5 text-base leading-7 text-slate-400">
                  O Wizzy é o primeiro ecossistema de IA pensado de ponta a ponta para advogados. Sem código, sem configuração técnica, sem dependência de desenvolvedor.
                </p>
                <div className="mt-7 space-y-3">
                  {solves.map((item) => (
                    <div key={item} className="flex gap-3 text-sm font-medium text-slate-200">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        <section id="produtos" className="px-4 py-24 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <SectionHeader
              tag="Ecossistema completo"
              title={<>Tudo que seu escritório precisa, <Em>integrado e pronto</Em></>}
              subtitle="Cada ferramenta foi construída para advogados. Não para engenheiros."
            />
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {products.map((product, index) => (
                <Reveal key={product.name} delay={index * 45} className={product.featured ? "xl:col-span-2" : ""}>
                  <div className={`group h-full rounded-3xl border p-7 transition hover:-translate-y-1 ${product.featured ? "border-pink-500/30 bg-pink-500/[0.07] shadow-2xl shadow-pink-500/10" : "border-white/10 bg-white/[0.035] hover:border-pink-500/30 hover:bg-pink-500/[0.04]"}`}>
                    <div className="flex items-center gap-4">
                      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-500/25 to-orange-500/20 text-xs font-black text-pink-100">
                        {product.emoji}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-2xl font-black text-white">{product.name}</h3>
                          {product.tag && <Badge className="border border-pink-500/30 bg-pink-500/15 text-pink-100">{product.tag}</Badge>}
                        </div>
                      </div>
                    </div>
                    <p className="mt-5 text-sm leading-7 text-slate-400">{product.description}</p>
                    <div className="mt-5 space-y-3">
                      {product.features.map((feature) => (
                        <p key={feature} className="flex items-start gap-2 text-sm text-slate-300">
                          <Check className="mt-1 h-4 w-4 shrink-0 text-emerald-400" />
                          {feature}
                        </p>
                      ))}
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>

            <Reveal className="mt-12">
              <p className="mb-5 text-center text-xs font-bold uppercase tracking-[0.24em] text-slate-500">Em breve no ecossistema</p>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {soonProducts.map(([name, desc]) => (
                  <div key={name} className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
                    <Badge variant="secondary" className="mb-3 bg-white/10 text-slate-300">Em breve</Badge>
                    <h3 className="font-bold text-white">{name}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-500">{desc}</p>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        <section id="agentes" className="bg-[#11111b] px-4 py-24 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <SectionHeader
              tag="Agentes de IA jurídica"
              title={<>Escolha. Ative. <Em>Deixe trabalhar.</Em></>}
              subtitle="Treinados com a linguagem da OAB, cada agente sabe exatamente o que fazer - e quando fazer."
            />
            <Reveal>
              <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#0b0b12]">
                <div className="hidden grid-cols-[1.1fr_1.5fr_1.4fr] border-b border-white/10 bg-white/[0.04] px-6 py-4 text-xs font-bold uppercase tracking-[0.18em] text-slate-500 md:grid">
                  <span>Agente</span>
                  <span>O que ele faz sozinho</span>
                  <span>O resultado para você</span>
                </div>
                {agents.map(([name, action, result], index) => (
                  <div key={name} className="grid gap-4 border-b border-white/10 px-6 py-5 last:border-b-0 md:grid-cols-[1.1fr_1.5fr_1.4fr] md:items-center">
                    <div className="flex items-center gap-3 font-bold text-white">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-pink-500/15 text-pink-200">{index + 1}</span>
                      {name}
                    </div>
                    <p className="text-sm leading-6 text-slate-400">{action}</p>
                    <p className="border-white/10 text-sm font-medium leading-6 text-emerald-200 md:border-l md:pl-6">{result}</p>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        <section id="depoimentos" className="px-4 py-24 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <SectionHeader tag="Depoimentos" title={<>Escritórios que já <Em>pararam de perder tempo</Em></>} />
            <div className="grid gap-5 lg:grid-cols-2">
              {testimonials.map(([name, role, quote], index) => (
                <Reveal key={name} delay={index * 80} className={index === 0 ? "lg:col-span-2" : ""}>
                  <div className={`h-full rounded-3xl border p-7 transition hover:border-pink-500/30 ${index === 0 ? "border-pink-500/25 bg-pink-500/[0.07]" : "border-white/10 bg-white/[0.035]"}`}>
                    <div className="mb-4 flex gap-1 text-amber-300">
                      {[0, 1, 2, 3, 4].map((star) => <Star key={star} className="h-4 w-4 fill-current" />)}
                    </div>
                    <Quote className="mb-4 h-7 w-7 text-pink-300" />
                    <p className="text-lg leading-8 text-slate-200">"{quote}"</p>
                    <div className="mt-7 flex items-center gap-3">
                      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-pink-500 to-orange-500 text-sm font-bold text-white">
                        {name.split(" ").map((part) => part[0]).join("").slice(0, 2)}
                      </span>
                      <div>
                        <p className="font-bold text-white">{name}</p>
                        <p className="text-sm text-slate-500">{role}</p>
                      </div>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section id="planos" className="bg-[#f6f6f4] px-4 py-24 text-slate-900 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto mb-12 max-w-3xl text-center">
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-pink-600">Planos e preços</p>
              <h2 className="mt-4 text-3xl font-black leading-tight tracking-tight sm:text-5xl">
                Invista no crescimento. <span className="font-serif italic font-normal text-pink-600">Não em tecnologia.</span>
              </h2>
              <p className="mt-5 text-base leading-7 text-slate-600">Planos pensados para o tamanho do seu escritório. Cancele quando quiser.</p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <span className="text-sm font-medium text-slate-600">Mensal</span>
                <button
                  type="button"
                  onClick={() => setAnnual((value) => !value)}
                  className={`relative h-8 w-14 rounded-full transition ${annual ? "bg-pink-500" : "bg-slate-300"}`}
                  aria-label="Alternar cobrança anual"
                >
                  <span className={`absolute top-1 h-6 w-6 rounded-full bg-white transition ${annual ? "left-7" : "left-1"}`} />
                </button>
                <span className="text-sm font-medium text-slate-600">Anual</span>
                <Badge className="border border-emerald-500/30 bg-emerald-500/15 text-emerald-700">Economize 20%</Badge>
              </div>
            </div>
            {plansLoading && adminPlans.length === 0 && (
              <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 text-center text-sm text-slate-500">
                Carregando planos configurados no painel admin...
              </div>
            )}
            {plansError && adminPlans.length === 0 && (
              <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-center text-sm text-amber-800">
                Não foi possível carregar os planos do admin agora. Mostrando uma prévia padrão até a conexão responder.
              </div>
            )}
            <div className="grid gap-5 lg:grid-cols-3">
              {displayedPlans.map((plan) => {
                const monthlyPrice = Number(plan.price_monthly || 0);
                const yearlyPrice = Number(plan.price_yearly || monthlyPrice * 10);
                const price = annual ? Math.round(yearlyPrice / 12) : monthlyPrice;
                const isPopular = plan.slug === "pro";
                const planFeatures = buildPlanFeatures(plan);
                const mutedFeatures = buildMutedFeatures(plan);
                const cta = isTrialFlow ? "Testar grátis" : `Escolher ${plan.name}`;

                return (
                  <Reveal key={plan.id || plan.slug}>
                    <div className={`relative flex h-full flex-col rounded-3xl border p-7 shadow-sm transition hover:-translate-y-1 ${isPopular ? "border-pink-400 bg-white shadow-xl shadow-pink-500/10" : "border-slate-200 bg-white"}`}>
                      {isPopular && <Badge className="absolute left-1/2 top-4 -translate-x-1/2 border-0 bg-gradient-to-r from-pink-500 to-orange-500 text-white">Mais escolhido</Badge>}
                      <div className={isPopular ? "pt-8" : ""}>
                        <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">{plan.name}</p>
                        <div className="mt-5 flex items-baseline gap-1">
                          <span className="text-lg font-bold text-slate-500">R$</span>
                          <span className="text-5xl font-black tracking-tight">{formatCurrency(price)}</span>
                          <span className="text-sm text-slate-500">/mês</span>
                        </div>
                        {annual && (
                          <p className="mt-1 text-xs text-slate-500">
                            Cobrança anual de R$ {formatCurrency(yearlyPrice)}
                          </p>
                        )}
                        <p className="mt-4 min-h-[52px] text-sm leading-6 text-slate-600">{getPlanAudience(plan)}</p>
                      </div>
                      <div className="my-6 h-px bg-slate-200" />
                      <ul className="flex-1 space-y-3">
                        {planFeatures.map((feature) => (
                          <li key={feature} className="flex items-start gap-2 text-sm text-slate-700">
                            <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                            {feature}
                          </li>
                        ))}
                        {mutedFeatures.map((feature) => (
                          <li key={feature} className="flex items-start gap-2 text-sm text-slate-400">
                            <X className="mt-0.5 h-4 w-4 shrink-0" />
                            {feature}
                          </li>
                        ))}
                      </ul>

                      <Button className={`mt-5 h-12 w-full ${isPopular ? "border-0 bg-gradient-to-r from-pink-500 to-orange-500 text-white hover:from-pink-600 hover:to-orange-600" : "bg-slate-900 text-white hover:bg-slate-800"}`} onClick={() => goToAuth(plan.slug)}>
                        {cta}
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </div>
                  </Reveal>
                );
              })}
            </div>
            <p className="mt-8 text-center text-sm text-slate-500">
              {isTrialFlow
                ? "A oferta de teste segue a configuração ativa no painel Crescimento."
                : "O checkout sempre usa o plano que o cliente selecionou nesta lista."} Sem fidelidade. Cancele quando quiser.
            </p>
          </div>
        </section>

        <section id="faq" className="px-4 py-24 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl">
            <SectionHeader tag="Dúvidas frequentes" title={<>Perguntas que <Em>todo advogado faz</Em></>} />
            <div className="space-y-3">
              {faqs.map(([question, answer], index) => (
                <Reveal key={question} delay={index * 35}>
                  <button
                    type="button"
                    onClick={() => setOpenFaq((current) => (current === index ? -1 : index))}
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.035] p-5 text-left transition hover:border-pink-500/30"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <h3 className="font-bold text-white">{question}</h3>
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white">{openFaq === index ? "-" : "+"}</span>
                    </div>
                    {openFaq === index && <p className="mt-4 text-sm leading-7 text-slate-400">{answer}</p>}
                  </button>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden px-4 py-28 sm:px-6 lg:px-8">
          <div className="absolute inset-0 bg-[linear-gradient(120deg,#db2777,#f97316,#ec4899,#fb923c)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent,rgba(0,0,0,0.45))]" />
          <div className="relative mx-auto max-w-5xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-white/80">Pronto para começar?</p>
            <h2 className="mt-5 text-4xl font-black leading-[1.05] tracking-tight text-white sm:text-6xl">
              Pare de perder clientes por falta de <span className="font-serif italic font-normal">tempo e tecnologia.</span>
            </h2>
            <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-white/90">
              Enquanto você lê isso, outro advogado está perdendo um lead que poderia ser seu. Ative o Wizzy agora.
            </p>
            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Button size="lg" className="h-14 border-0 bg-white px-10 text-lg font-semibold text-slate-900 shadow-2xl shadow-black/20 hover:bg-white/90" onClick={() => goToAuth()}>
                {finalCta}
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <a href="#planos" onClick={() => trackLandingButtonClick("Falar com consultor", "planos")} className="inline-flex h-14 items-center justify-center gap-2 rounded-xl border border-white/30 bg-white/10 px-10 text-lg font-semibold text-white transition hover:bg-white/20">
                Falar com consultor
                <ArrowRight className="h-5 w-5" />
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 bg-[#0b0b12] px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 text-sm text-slate-500 md:flex-row md:items-center md:justify-between">
          <a href="#hero" className="flex items-center gap-3">
            <img src={wizzyLogo} alt="Wizzy" className="h-9 w-9 rounded-xl object-contain" />
            <span className="text-lg font-bold text-white">Wizzy</span>
          </a>
          <div className="flex flex-wrap gap-5">
            <a href="#" className="hover:text-white">Política de Privacidade</a>
            <a href="#" className="hover:text-white">Termos de Uso</a>
            <a href="#" className="hover:text-white">LGPD</a>
            <a href="#" className="hover:text-white">Contato</a>
          </div>
          <p>© 2026 Wizzy. Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>
  );
}
