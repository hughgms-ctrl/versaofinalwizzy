import React, { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Bot,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  FileSignature,
  Filter,
  HelpCircle,
  LayoutTemplate,
  MessageSquare,
  QrCode,
  Quote,
  Repeat,
  Rocket,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
  Users,
  Workflow,
  X,
  Zap,
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

const practiceAreas = [
  "Trabalhista",
  "Previdenciário",
  "Família",
  "Cível",
  "Consumidor",
  "Bancário",
  "Imobiliário",
  "Empresarial",
  "Tributário",
];

const implementationSteps = [
  {
    icon: QrCode,
    title: "Conecte seu WhatsApp",
    description: "Escaneie o QR Code uma vez e o número fica vinculado à plataforma. Sem complicação, sem programador.",
  },
  {
    icon: LayoutTemplate,
    title: "Escolha o template da sua área",
    description: "Trabalhista, Previdenciário, Família, Cível e mais. O agente já entra treinado com a linguagem daquela área.",
  },
  {
    icon: Zap,
    title: "Agente ativo, 24/7",
    description: "Pronto. A Wizzy já está atendendo, qualificando, agendando e coletando documentos enquanto você advoga.",
  },
];

const agentTemplates: Array<{ area: string; theses: string[]; highlight?: string }> = [
  { area: "Trabalhista", theses: ["Reclamação Trabalhista", "Rescisão Indireta", "Reconhecimento de Vínculo"] },
  {
    area: "Previdenciário",
    theses: ["BPC/LOAS", "Auxílio-Acidente", "Auxílio-Doença", "Salário-Maternidade", "Pensão por Morte", "Aposentadoria"],
    highlight: "Exclusivo Wizzy: leitura automática de CNIS com o Wizzy Prev",
  },
  { area: "Família", theses: ["Pensão e Divórcio", "Guarda e Alimentos"] },
  { area: "Consumidor", theses: ["Desconto Indevido", "Cobrança Abusiva"] },
  { area: "Bancário", theses: ["Superendividamento", "Revisão de Contrato"] },
  { area: "Imobiliário", theses: ["Usucapião", "Distrato Imobiliário"] },
];

const pains = [
  "Leads qualificados às 3h da manhã que ninguém respondeu",
  'WhatsApp pessoal invadido por clientes perguntando "como está meu processo?"',
  "Horas perdidas em marcação de consultas e cobrança de documentos",
  "Ferramentas técnicas que precisam de programador para funcionar",
  "Assinatura, agenda, formulário e quiz espalhados em 4 ferramentas diferentes",
];

const solves = [
  "Agentes treinados com linguagem e ética OAB",
  "Ativo em menos de 5 minutos",
  "Do lead até a assinatura do contrato, automatizado",
  "Sem webhooks, sem Make, sem ChatGPT separado",
  "Assinatura, agenda, formulário e quiz no mesmo login",
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
  ["Wizzy Prev", "Análise automática de CNIS para previdenciário"],
  ["E muito mais", "Sempre novos módulos para facilitar a vida do advogado"],
];

const featureGrid = [
  ["Agentes Especialistas", "IA treinada por área jurídica, pronta para ativar"],
  ["Pipeline & CRM", "Kanban de leads e clientes com movimentação automática"],
  ["Agendamento de Consultas", "Agenda cheia sem trocar uma mensagem manual"],
  ["Wizzy Sign", "Assinatura digital nativa, sem ferramenta externa"],
  ["Wizzy Flow", "Gestão de projetos, prazos e tarefas do escritório"],
  ["Wizzy Quest", "Quizzes que qualificam antes mesmo da conversa"],
  ["Wizzy Forms", "Formulários inteligentes para coletar dados e docs"],
  ["Campanhas & Mensagens", "Disparos e follow-ups agendados em massa"],
  ["Relatórios & Métricas", "Funil, conversão e desempenho em tempo real"],
  ["Equipe & Colaboração", "Vários advogados e estagiários no mesmo painel"],
  ["Integrações", "Conecte com as ferramentas que seu escritório já usa"],
  ["Wizzy Prev (em breve)", "Leitura automática de CNIS para previdenciário"],
];

const differentiators = [
  {
    icon: Sparkles,
    title: "Ecossistema completo, não só um chatbot",
    description:
      "CRM, assinatura digital, gestão de projetos, quiz de qualificação e formulários no mesmo login. Outras soluções de IA jurídica só cuidam do atendimento - você continuaria pagando ZapSign, Trello e Typeform à parte.",
  },
  {
    icon: FileSignature,
    title: "Assinatura nativa com o Wizzy Sign",
    description:
      "O contrato é gerado, enviado e assinado sem sair do Wizzy. Nada de depender de uma ferramenta de assinatura externa integrada por webhook.",
  },
  {
    icon: Workflow,
    title: "Gestão do escritório inteiro",
    description:
      "Com o Wizzy Flow você organiza prazos, tarefas e equipe além do funil de vendas - a maioria das IAs de atendimento para advogados para no fechamento do contrato.",
  },
  {
    icon: ShieldCheck,
    title: "Wizzy Prev: leitura automática de CNIS",
    description:
      "Um diferencial que nenhum chatbot genérico de vendas tem: análise automatizada de CNIS para casos previdenciários, direto no fluxo do escritório.",
  },
];

const agents = [
  {
    step: "Triagem & Qualificação",
    action:
      "Atende o lead no WhatsApp, identifica a área do direito (Trabalhista, Previdenciário, Cível, Família) e filtra automaticamente se há viabilidade jurídica no caso.",
    result: "Você só fala com clientes que têm casos reais e lucrativos. Fim do desperdício de tempo com leads ruins.",
    chat: [
      { from: "lead", text: "Quero entender se eu tenho direito a esse benefício" },
      { from: "agent", text: "Olá! Sou a assistente virtual do escritório. Para começarmos, em qual ano aconteceu o acidente?" },
      { from: "lead", text: "Em 2019" },
      { from: "system", text: "Lead qualificado · Encaminhado ao Agendamento" },
    ],
  },
  {
    step: "Agendamento de Consultas",
    action:
      'Conversa com o lead qualificado, apresenta seus horários disponíveis e fecha a consulta direto na sua agenda - sem "vai e vem" de mensagens.',
    result: "Agenda de consultas cheia sem você abrir o WhatsApp uma única vez para marcar horário.",
    chat: [
      { from: "agent", text: "Tenho horário amanhã às 14h ou quinta às 10h. Qual funciona melhor pra você?" },
      { from: "lead", text: "Quinta às 10h" },
      { from: "system", text: "Consulta agendada · Confirmação enviada" },
    ],
  },
  {
    step: "Coleta de Documentos",
    action:
      "Solicita, cobra e organiza os documentos necessários para a análise inicial do caso (RG, comprovante, termos de rescisão, CNIS, etc.).",
    result: "Processo pronto para análise sem que sua secretária precise cobrar o cliente dez vezes. Zero esforço humano.",
    chat: [
      { from: "agent", text: "Preciso do seu RG, comprovante de residência e do CNIS. Pode me mandar por aqui mesmo." },
      { from: "lead", text: "Já te mando" },
      { from: "system", text: "Documentos recebidos · Processo pronto para análise" },
    ],
  },
  {
    step: "Envio & Assinatura de Contrato",
    action:
      "Ao final da qualificação, gera e envia automaticamente o contrato de honorários pelo Wizzy Sign e acompanha até a assinatura ser concluída.",
    result: "Do lead ao cliente assinado - tudo automatizado, sem depender de outra ferramenta. Você só aparece para advogar de fato.",
    chat: [
      { from: "agent", text: "Segue seu contrato de honorários. Pode assinar direto por aqui, sem precisar baixar nada." },
      { from: "lead", text: "Assinado!" },
      { from: "system", text: "Contrato assinado no Wizzy Sign · Cliente ativo" },
    ],
  },
  {
    step: "Follow-up Inteligente",
    action:
      'Lead sumiu no meio da conversa? Depois de algumas horas, o agente retoma automaticamente com uma mensagem personalizada baseada no histórico.',
    result: 'Nenhum lead é esquecido em nenhuma etapa - mesmo os que "sumiram" no meio do caminho.',
    chat: [
      { from: "agent", text: "Oi! Conseguiu separar os documentos que faltavam para seguirmos com seu caso?" },
      { from: "lead", text: "Foi mal, esqueci! Te mando agora" },
      { from: "system", text: "Lead reativado · Retomando fluxo" },
    ],
  },
];

const journeySteps = [
  { icon: MessageSquare, title: "Captação", description: "Lead chega pelo WhatsApp e é atendido instantaneamente" },
  { icon: Filter, title: "Qualificação", description: "Agente de Triagem analisa a demanda e classifica o caso" },
  { icon: Calendar, title: "Agendamento", description: "Consulta marcada direto na agenda, sem trocar mensagem" },
  { icon: FileSignature, title: "Contrato & Assinatura", description: "Documentos coletados, contrato gerado e assinado no Wizzy Sign" },
  { icon: CheckCircle2, title: "Cliente ativo", description: "Caso entra no pipeline, pronto para o próximo passo" },
];

const costRows = [
  ["01 pessoa", "R$ 3.634 /mês"],
  ["02 pessoas", "R$ 7.268 /mês"],
  ["03 pessoas", "R$ 10.902 /mês"],
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
  carousel: "Wizzy Carrossel",
  cnis: "Wizzy Prev / CNIS",
};

const orderedExtraModules = ["documents", "widgets", "quiz", "wizzy_flow", "carousel", "cnis"];
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
    "Preciso contratar outras ferramentas junto (assinatura, agenda, formulário)?",
    "Não. Diferente de soluções que só cuidam do atendimento, o Wizzy já inclui assinatura digital (Wizzy Sign), gestão de projetos (Wizzy Flow), formulários (Wizzy Forms) e quizzes de qualificação (Wizzy Quest) na mesma plataforma - sem integrar nada por fora.",
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

const ChatBubble = ({ from, text }: { from: "lead" | "agent" | "system"; text: string }) => {
  if (from === "system") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
        {text}
      </div>
    );
  }
  const isLead = from === "lead";
  return (
    <div className={`flex ${isLead ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs leading-5 ${
          isLead ? "bg-white/10 text-slate-200" : "bg-pink-500/20 text-pink-50"
        }`}
      >
        {text}
      </div>
    </div>
  );
};

export default function LandingPageV2() {
  const navigate = useNavigate();
  const [annual, setAnnual] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);
  const [entryAssignment, setEntryAssignment] = useState<EntryFlowAssignment | null>(() => getStoredEntryAssignment());

  const { data: adminPlans = [], isLoading: plansLoading, error: plansError } = useQuery({
    queryKey: ["landing-v2-platform-plans"],
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
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-aurora { animation: aurora 12s ease-in-out infinite; }
        .animate-floaty { animation: floaty 7s ease-in-out infinite; }
        .animate-marquee { animation: marquee 28s linear infinite; }
        @media (prefers-reduced-motion: reduce) {
          .animate-aurora, .animate-floaty, .animate-marquee { animation: none; }
        }
      `}</style>

      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0b0b12]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <a href="#hero" className="flex items-center gap-3">
            <img src={wizzyLogo} alt="Wizzy" className="h-10 w-10 rounded-xl object-contain" />
            <span className="text-2xl font-black tracking-tight text-white">Wizzy</span>
          </a>

          <nav className="hidden items-center gap-8 text-sm font-medium text-slate-400 md:flex">
            <a href="#produtos" className="transition hover:text-white">Produtos</a>
            <a href="#agentes" onClick={() => trackLandingButtonClick("Agentes", "agentes")} className="transition hover:text-white">Agentes</a>
            <a href="#diferenciais" className="transition hover:text-white">Diferenciais</a>
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
        {/* HERO */}
        <section id="hero" className="relative overflow-hidden px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_at_center,black_25%,transparent_75%)]" />
          <div className="pointer-events-none absolute -left-32 top-0 h-[560px] w-[760px] rounded-full bg-pink-500/12 blur-[120px]" />
          <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[580px] rounded-full bg-orange-500/12 blur-[120px]" />

          <div className="relative mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[1.02fr_0.98fr]">
            <Reveal>
              <Badge className="mb-8 border border-pink-500/30 bg-pink-500/15 px-4 py-2 text-pink-100 hover:bg-pink-500/15">
                <span className="mr-2 h-1.5 w-1.5 rounded-full bg-pink-300" />
                Usado por escritórios em todo o Brasil
              </Badge>
              <h1 className="max-w-4xl text-5xl font-black leading-[1.03] tracking-tight text-white sm:text-6xl lg:text-7xl">
                Seu escritório captando e fechando clientes <Em>24 horas por dia.</Em>
              </h1>
              <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300">
                Enquanto você advoga, os agentes da Wizzy atendem seus leads no WhatsApp, agendam consultas, cobram documentos e enviam o contrato pra assinatura. <strong className="font-semibold text-white">Sem hora extra, sem lead perdido, sem depender de ferramenta separada.</strong>
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
              <div className="mt-9 flex flex-wrap gap-x-6 gap-y-3 text-sm font-medium text-slate-300">
                <span className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400" /> API oficial do WhatsApp</span>
                <span className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400" /> Atendimento 24/7</span>
                <span className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400" /> Ecossistema completo: CRM + Assinatura + Gestão</span>
              </div>
              <div className="mt-12 border-t border-white/10 pt-9">
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
                <div className="flex items-center gap-3 border-b border-white/10 bg-white/[0.04] px-5 py-4">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-pink-500 to-orange-500 text-xs font-black text-white">W</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-white">Wizzy · Agente de Triagem</p>
                    <p className="text-xs text-emerald-300">● Online agora</p>
                  </div>
                </div>
                <div className="space-y-3 p-5">
                  <p className="text-center text-[11px] font-medium text-slate-500">via Tráfego Pago · Campanha Previdenciário</p>
                  <ChatBubble from="lead" text="Quero entender se eu tenho direito a esse benefício" />
                  <ChatBubble from="agent" text="Olá! Sou a assistente virtual do escritório Silva & Associados. Para começarmos, em qual ano aconteceu o acidente?" />
                  <ChatBubble from="lead" text="Em 2019" />
                  <ChatBubble from="agent" text="Entendi. Ele deixou alguma sequela ou limitação até hoje?" />
                  <ChatBubble from="system" text="Lead qualificado · Encaminhado ao Agendamento" />
                  <div className="mt-2 rounded-2xl border border-pink-500/30 bg-pink-500/10 p-4">
                    <div className="flex items-center justify-between gap-6">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-pink-200">Leads atendidos hoje</p>
                        <p className="mt-1 text-sm text-slate-400">Enquanto você dormia</p>
                      </div>
                      <p className="text-4xl font-black text-white">47</p>
                    </div>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* PRACTICE AREAS MARQUEE */}
        <section className="border-y border-white/10 bg-[#0b0b12] py-8">
          <p className="mb-5 text-center text-xs font-bold uppercase tracking-[0.24em] text-slate-500">Agentes prontos para qualquer área do direito</p>
          <div className="relative overflow-hidden">
            <div className="flex w-max animate-marquee gap-4 px-4">
              {[...practiceAreas, ...practiceAreas].map((area, index) => (
                <span key={`${area}-${index}`} className="whitespace-nowrap rounded-full border border-white/10 bg-white/[0.03] px-5 py-2 text-sm font-semibold text-slate-300">
                  {area}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* PAIN / SOLUTION */}
        <section className="bg-[#11111b] px-4 py-24 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-7xl items-start gap-10 lg:grid-cols-[1fr_0.9fr]">
            <Reveal>
              <h2 className="text-4xl font-black leading-tight tracking-tight text-white sm:text-5xl">
                IA existe para todos. Mas nem todo advogado <Em>tem tempo</Em> para aprender. E está tudo bem!
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

        {/* IMPLEMENTATION */}
        <section className="px-4 py-24 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <SectionHeader
              tag="Implementação"
              title={<>Fácil e rápida. <Em>Sem programador.</Em></>}
              subtitle="Conecte seu WhatsApp, escolha um template e pronto. A Wizzy já começa a atender suas leads automaticamente."
            />
            <div className="grid gap-5 md:grid-cols-3">
              {implementationSteps.map((step, index) => (
                <Reveal key={step.title} delay={index * 80}>
                  <div className="h-full rounded-3xl border border-white/10 bg-white/[0.035] p-7">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-pink-500/15 text-pink-200">
                      <step.icon className="h-6 w-6" />
                    </span>
                    <p className="mt-5 text-xs font-bold uppercase tracking-[0.2em] text-pink-300">Passo {index + 1}</p>
                    <h3 className="mt-2 text-xl font-black text-white">{step.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-slate-400">{step.description}</p>
                  </div>
                </Reveal>
              ))}
            </div>
            <p className="mt-8 text-center text-sm font-semibold text-slate-400">Tempo médio de ativação: <span className="text-white">5 minutos</span></p>
          </div>
        </section>

        {/* AGENT TEMPLATES BY AREA */}
        <section id="produtos" className="bg-[#11111b] px-4 py-24 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <SectionHeader
              tag="Agentes prontos"
              title={<>IA especializada para a sua <Em>tese jurídica</Em></>}
              subtitle="Agentes treinados e prontos para uso. Escolha a área, personalize e ative no seu WhatsApp."
            />
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {agentTemplates.map((template, index) => (
                <Reveal key={template.area} delay={index * 45}>
                  <div className="h-full rounded-3xl border border-white/10 bg-white/[0.035] p-6">
                    <h3 className="text-lg font-black text-white">{template.area}</h3>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {template.theses.map((thesis) => (
                        <span key={thesis} className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs font-medium text-slate-300">
                          {thesis}
                        </span>
                      ))}
                    </div>
                    {template.highlight && (
                      <p className="mt-4 flex items-start gap-2 text-xs font-semibold leading-5 text-emerald-300">
                        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        {template.highlight}
                      </p>
                    )}
                  </div>
                </Reveal>
              ))}
              <Reveal delay={agentTemplates.length * 45}>
                <div className="flex h-full flex-col items-center justify-center rounded-3xl border border-dashed border-white/15 bg-white/[0.02] p-6 text-center">
                  <Rocket className="h-6 w-6 text-pink-300" />
                  <p className="mt-3 text-sm font-bold text-white">+ Personalizado para sua tese</p>
                  <p className="mt-1 text-xs text-slate-400">Não achou sua área? A gente monta com você.</p>
                </div>
              </Reveal>
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-sm font-semibold text-slate-300">
              <span className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400" /> Sem cobrança por lead recebido</span>
              <span className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400" /> Você paga pelo plano, não por atendimento</span>
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

        {/* AGENT SET DEEP DIVE */}
        <section id="agentes" className="px-4 py-24 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <SectionHeader
              tag="Conjunto de agentes IA"
              title={<>Agentes trabalhando <Em>simultaneamente</Em></>}
              subtitle="Do primeiro contato ao contrato assinado, cada etapa é conduzida por um agente especializado."
            />
            <div className="space-y-6">
              {agents.map((agent, index) => (
                <Reveal key={agent.step} delay={index * 60}>
                  <div className="grid gap-6 rounded-3xl border border-white/10 bg-white/[0.035] p-7 lg:grid-cols-[auto_1fr_1fr]">
                    <div className="flex items-start gap-4 lg:flex-col lg:items-start">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-pink-500/15 text-sm font-black text-pink-200">
                        {index + 1}
                      </span>
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Etapa {index + 1}</p>
                        <h3 className="mt-1 text-lg font-black text-white">{agent.step}</h3>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm leading-6 text-slate-400">{agent.action}</p>
                      <p className="mt-3 border-l-2 border-emerald-500/40 pl-3 text-sm font-medium leading-6 text-emerald-200">{agent.result}</p>
                    </div>
                    <div className="space-y-2 rounded-2xl border border-white/10 bg-[#0b0b12] p-4">
                      {agent.chat.map((message, messageIndex) => (
                        <ChatBubble key={messageIndex} from={message.from as "lead" | "agent" | "system"} text={message.text} />
                      ))}
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* FEATURE GRID */}
        <section className="bg-[#11111b] px-4 py-24 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <SectionHeader
              tag="Funcionalidades"
              title={<>Tudo que seu escritório precisa <Em>pra vender mais</Em></>}
              subtitle="Um ecossistema de ferramentas que trabalham por você enquanto você advoga."
            />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {featureGrid.map(([name, desc]) => (
                <div key={name} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                  <h3 className="text-sm font-black text-white">{name}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-400">{desc}</p>
                </div>
              ))}
            </div>

            <Reveal className="mt-6">
              <div className="grid items-center gap-8 rounded-3xl border border-pink-500/25 bg-gradient-to-b from-pink-500/10 to-white/[0.03] p-8 lg:grid-cols-2">
                <div>
                  <Badge className="mb-4 border border-pink-500/30 bg-pink-500/15 text-pink-100">Funcionalidade</Badge>
                  <h3 className="text-2xl font-black text-white">Atendimento IA 24/7</h3>
                  <p className="mt-4 text-sm leading-7 text-slate-400">
                    IA treinada por área jurídica que atende pelo WhatsApp, qualifica leads, agenda consultas e conduz toda a conversa de forma autônoma - mesmo de madrugada.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-[#0b0b12] p-5">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
                    <Clock className="h-4 w-4" /> ATENDIMENTO ÀS 3H DA MANHÃ
                  </div>
                  <div className="mt-4 space-y-2">
                    <ChatBubble from="lead" text="Boa noite, vi o anúncio de vocês agora" />
                    <ChatBubble from="agent" text="Boa noite! Consigo te ajudar agora mesmo, sem problema. Qual sua dúvida?" />
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* DIFFERENTIATORS */}
        <section id="diferenciais" className="px-4 py-24 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <SectionHeader
              tag="Por que Wizzy"
              title={<>O que a Wizzy tem que <Em>chatbot nenhum</Em> tem</>}
              subtitle="A maioria das IAs jurídicas do mercado resolve só o atendimento. A Wizzy resolve o escritório inteiro."
            />
            <div className="grid gap-5 md:grid-cols-2">
              {differentiators.map((item, index) => (
                <Reveal key={item.title} delay={index * 60}>
                  <div className="flex h-full gap-4 rounded-3xl border border-white/10 bg-white/[0.035] p-7">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-pink-500/25 to-orange-500/20 text-pink-100">
                      <item.icon className="h-5 w-5" />
                    </span>
                    <div>
                      <h3 className="font-black text-white">{item.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-400">{item.description}</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* COST CALCULATOR */}
        <section className="bg-[#11111b] px-4 py-24 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <SectionHeader
              tag="Economias imediatas"
              title={<>Quanto custa <Em>não automatizar?</Em></>}
              subtitle="Uma equipe de atendimento fechando o mesmo volume de contratos custa uma fortuna todo mês. A Wizzy faz o primeiro atendimento por uma fração disso - sem faltar, sem férias, sem hora extra."
            />
            <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
              <Reveal>
                <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
                  <div className="grid grid-cols-2 border-b border-white/10 bg-white/[0.04] px-6 py-4 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                    <span>Equipe de atendimento</span>
                    <span className="text-right">Custo estimado /mês</span>
                  </div>
                  {costRows.map(([team, cost]) => (
                    <div key={team} className="grid grid-cols-2 border-b border-white/10 px-6 py-4 text-sm last:border-b-0">
                      <span className="font-medium text-slate-300">{team}</span>
                      <span className="text-right font-black text-white">{cost}</span>
                    </div>
                  ))}
                  <p className="px-6 py-3 text-xs text-slate-500">Estimativa com salário + comissão + encargos + VT/VA. Valores ilustrativos, referência de mercado.</p>
                </div>
              </Reveal>
              <Reveal delay={100}>
                <div className="flex h-full flex-col justify-center rounded-3xl border border-pink-500/25 bg-gradient-to-b from-pink-500/10 to-white/[0.03] p-7 text-center">
                  <TrendingUp className="mx-auto h-8 w-8 text-pink-300" />
                  <p className="mt-4 text-lg font-black text-white">Wizzy atende 24/7, sem encargos, sem férias, com escala ilimitada</p>
                  <p className="mt-3 text-sm leading-6 text-slate-400">Você paga um plano fixo - não uma folha de pagamento por atendente.</p>
                  <a href="#planos" onClick={() => trackLandingButtonClick("Ver planos", "planos")} className="mt-6 inline-flex h-12 items-center justify-center rounded-xl bg-gradient-to-r from-pink-500 to-orange-500 px-6 text-sm font-bold text-white shadow-lg shadow-pink-500/25 transition hover:from-pink-600 hover:to-orange-600">
                    Ver planos e preços
                  </a>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* JOURNEY */}
        <section className="px-4 py-24 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <SectionHeader
              tag="Jornada do cliente"
              title={<>Do primeiro contato ao <Em>contrato assinado</Em></>}
              subtitle="Cada etapa conduzida pela IA, sem intervenção manual."
            />
            <div className="grid gap-4 md:grid-cols-5">
              {journeySteps.map((step, index) => (
                <Reveal key={step.title} delay={index * 60}>
                  <div className="relative h-full rounded-3xl border border-white/10 bg-white/[0.035] p-6 text-center">
                    <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-pink-500/15 text-pink-200">
                      <step.icon className="h-6 w-6" />
                    </span>
                    <h3 className="mt-4 font-black text-white">{step.title}</h3>
                    <p className="mt-2 text-xs leading-5 text-slate-400">{step.description}</p>
                    {index < journeySteps.length - 1 && (
                      <ArrowRight className="absolute -right-3 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-slate-600 md:block" />
                    )}
                  </div>
                </Reveal>
              ))}
            </div>
            <p className="mt-8 text-center text-sm font-semibold text-slate-400">Processo 100% automatizado, do início ao fim</p>
          </div>
        </section>

        {/* TESTIMONIALS */}
        <section id="depoimentos" className="bg-[#11111b] px-4 py-24 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <SectionHeader tag="Depoimentos" title={<>Escritórios que já <Em>pararam de perder tempo</Em></>} />
            <div className="grid gap-5 lg:grid-cols-3">
              {testimonials.map(([name, role, quote], index) => (
                <Reveal key={name} delay={index * 80}>
                  <div className="h-full rounded-3xl border border-white/10 bg-white/[0.035] p-7 transition hover:border-pink-500/30">
                    <div className="mb-4 flex gap-1 text-amber-300">
                      {[0, 1, 2, 3, 4].map((star) => <Star key={star} className="h-4 w-4 fill-current" />)}
                    </div>
                    <Quote className="mb-4 h-7 w-7 text-pink-300" />
                    <p className="text-sm leading-7 text-slate-200">"{quote}"</p>
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

        {/* PRICING */}
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

        {/* FAQ */}
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

        {/* FINAL CTA */}
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
            <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm font-semibold text-white/85">
              <span className="inline-flex items-center gap-2"><Zap className="h-4 w-4" /> Ativação em 5 minutos</span>
              <span className="inline-flex items-center gap-2"><Users className="h-4 w-4" /> Suporte dedicado</span>
              <span className="inline-flex items-center gap-2"><Repeat className="h-4 w-4" /> Sem fidelidade, cancele quando quiser</span>
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
            <a href="/privacidade" className="hover:text-white">Política de Privacidade</a>
            <a href="/termos" className="hover:text-white">Termos de Uso</a>
            <a href="/exclusao-de-dados" className="hover:text-white">Exclusão de Dados</a>
            <a href="mailto:contato@wizzy.app" className="hover:text-white">Contato</a>
          </div>
          <p className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-400" /> Dados protegidos com criptografia · LGPD</p>
        </div>
        <p className="mx-auto mt-6 max-w-7xl text-xs text-slate-600">© 2026 Wizzy. Todos os direitos reservados.</p>
      </footer>
    </div>
  );
}
