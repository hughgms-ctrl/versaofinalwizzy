import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { assignEntryFlow, setSelectedEntryPlan, trackEntryEvent } from "@/lib/entryFlow";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Bell,
  Bot,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  FileSignature,
  FileText,
  LayoutGrid,
  Lock,
  MessageSquare,
  Quote,
  Scale,
  Shield,
  Sparkles,
  Star,
  Tag,
  Users,
  Workflow,
  X,
  Zap,
} from "lucide-react";

const areas = [
  "Trabalhista",
  "Família",
  "Cível",
  "Empresarial",
  "Previdenciário",
  "Tributário",
  "Criminal",
  "Consumidor",
];

const pains = [
  {
    icon: MessageSquare,
    title: "Lead que some no WhatsApp",
    text: "Cliente manda mensagem, a conversa desce na lista, vai para o arquivado e o honorário escorre pelo dedo.",
  },
  {
    icon: Clock,
    title: "Resposta fora de hora",
    text: "Cliente em pânico procura advogado às 22h de domingo. Quem responde primeiro costuma fechar o caso.",
  },
  {
    icon: LayoutGrid,
    title: "Casos no caos",
    text: "Prospects em triagem, proposta e contrato ficam espalhados. Achismo ocupa o lugar da gestão.",
  },
  {
    icon: FileText,
    title: "Contrato de honorários no Word",
    text: "Editar, exportar PDF, mandar por e-mail, imprimir, escanear e devolver. Uma novela para cada cliente.",
  },
  {
    icon: BarChart3,
    title: "Sem visão de captação",
    text: "Sem saber qual canal traz clientes, qual área converte mais ou o ticket médio real do escritório.",
  },
  {
    icon: Users,
    title: "Time desencontrado",
    text: "Estagiário responde uma coisa, sócio responde outra e ninguém sabe quem ficou com o follow-up.",
  },
];

const steps = [
  {
    number: "01",
    icon: MessageSquare,
    title: "Capte o lead de onde ele vier",
    text: "WhatsApp, site, Google Ads, indicacao, Instagram ou formulario. Todo lead entra no Wizzy com origem identificada.",
  },
  {
    number: "02",
    icon: Bot,
    title: "Triagem com IA jurídica 24/7",
    text: "A IA atende na hora, identifica a área, qualifica o cliente, coleta dados iniciais e separa caso real de curiosidade.",
  },
  {
    number: "03",
    icon: LayoutGrid,
    title: "Organize no pipeline por área",
    text: "Funil visual em Kanban: Triagem, Análise, Proposta, Contrato e Cliente ativo. Cada área com suas etapas.",
  },
  {
    number: "04",
    icon: FileSignature,
    title: "Envie o contrato em 1 clique",
    text: "Template de honorários, PDF automático, link pelo WhatsApp e assinatura eletrônica avançada com OTP.",
  },
  {
    number: "05",
    icon: Calendar,
    title: "Agende sem ping-pong",
    text: "Página pública integrada ao Google Calendar e Meet. O cliente escolhe o horário e recebe o link automaticamente.",
  },
  {
    number: "06",
    icon: BarChart3,
    title: "Meça e escale",
    text: "Dashboards de conversão por área, ticket médio, origem dos casos, desempenho do time e tempo de resposta.",
  },
];

const features = [
  {
    icon: MessageSquare,
    title: "Atendimento jurídico centralizado",
    text: "Todas as conversas do WhatsApp em uma única caixa, com múltiplos advogados, notas internas, responsáveis e tags por área.",
    badge: "DESTAQUE",
  },
  {
    icon: Bot,
    title: "Agente jurídico de IA",
    text: "Treinado por você, com a voz do escritório, critérios de qualificação, áreas de atuação e tom de acolhimento do seu nicho.",
    badge: "IA",
  },
  {
    icon: Scale,
    title: "Pacotes por área do Direito",
    text: "Pipeline, fluxos, prompts da IA e templates de contrato configurados para trabalhista, família, cível, previdenciário e mais.",
  },
  {
    icon: LayoutGrid,
    title: "Pipeline visual em Kanban",
    text: "Cada caso vira um card. Mova etapas com clareza e receba notificações a cada movimentação importante.",
  },
  {
    icon: FileSignature,
    title: "Contratos com assinatura digital",
    text: "Honorários, procuração, contrato de êxito e mandato com PDF automático, OTP, carimbo de tempo e recibo de auditoria.",
  },
  {
    icon: Calendar,
    title: "Agendamento com Calendar e Meet",
    text: "Link público de agenda, verificação automática de disponibilidade e reunião criada sem troca infinita de mensagens.",
  },
  {
    icon: Workflow,
    title: "Automações sem código",
    text: "Crie fluxos de triagem, follow-up, lembrete de assinatura pendente e boas-vindas para cliente novo.",
  },
  {
    icon: Zap,
    title: "Campanhas para a base",
    text: "Comunique mudanças de lei, oportunidades, conteúdos e ações coletivas para clientes e ex-clientes.",
  },
  {
    icon: Bell,
    title: "Notificações em tempo real",
    text: "Push no navegador para novo lead, mensagem nova, contrato assinado e consulta confirmada.",
  },
  {
    icon: Users,
    title: "Equipe e permissões",
    text: "Sócios, associados, estagiários e secretárias com permissões por área, módulo e responsabilidade.",
  },
  {
    icon: BarChart3,
    title: "Dashboards do escritório",
    text: "Conversão por área, ticket médio, origem dos casos, tempo de fechamento e desempenho por captador.",
    badge: "PRO",
  },
  {
    icon: Tag,
    title: "Tags e segmentação",
    text: "Organize contatos por área, status processual, valor da causa, fase do processo ou critério interno.",
  },
];

const packs = [
  ["Trabalhista", "Triagem de rescisão, cálculo preliminar de verbas, contrato ad exitum e follow-up de proposta."],
  ["Família & Sucessões", "Acolhimento sensível, triagem de divórcio, guarda, pensão, coleta inicial e agendamento."],
  ["Cível & Consumidor", "Identificação da demanda, pré-análise de viabilidade, contrato, procuração e acompanhamento."],
  ["Previdenciário", "Triagem de aposentadoria e benefícios, coleta de CNIS, assinatura digital e lembretes automáticos."],
  ["Empresarial", "Demandas societárias, contratos recorrentes, assessoria mensal e propostas de avença."],
  ["Tributário", "Execuções fiscais, revisão tributária, planejamento e follow-up de prazos."],
];

const comparison = [
  ["Casos perdidos no WhatsApp arquivado", "Pipeline visual: nenhum lead some"],
  ["Resposta manual e fora de hora", "Agente de IA jurídica respondendo 24/7"],
  ["Contratos de honorários no Word", "Templates com assinatura digital"],
  ["Agendamento por troca de mensagem", "Página pública + Calendar + Meet"],
  ["Sem visão da captação", "Dashboards de funil, ticket e conversão"],
  ["Equipe respondendo o mesmo cliente", "Caixa centralizada com responsável por caso"],
  ["Cliente assina só depois de imprimir", "Assinatura pelo WhatsApp em minutos"],
];

const testimonials = [
  ["Dra. Marina Costa", "Advogada Trabalhista, São Paulo/SP", "A IA do Wizzy faz a triagem inicial dos casos. Eu só entro quando o lead já está pronto. Triplicou meu fechamento de honorários."],
  ["Dr. Rafael Oliveira", "Direito de Família, Belo Horizonte/MG", "O acolhimento sensível dos casos de família, feito pela IA 24/7, mudou meu escritório. Cliente chega à consulta já confiando."],
  ["Dra. Juliana Santos", "Direito Cível, Curitiba/PR", "Antes eu perdia clientes por demora. Agora a IA atende, qualifica e me passa só os casos viáveis, com documentos anexados."],
  ["Dr. Lucas Ferreira", "Previdenciário, Porto Alegre/RS", "Os contratos de honorários com assinatura digital fecham em minutos, não em dias. Pagou a ferramenta na primeira semana."],
  ["Dra. Carla Mendes", "Direito Empresarial, Rio de Janeiro/RJ", "Cadastrei as áreas de atuação na base de conhecimento e a IA responde dúvidas com a voz do escritório."],
  ["Dr. Pedro Almeida", "Sócio de banca, Brasília/DF", "Gerencio 6 advogados e 2 estagiários com permissões separadas. Cada área tem seu pipeline e seus relatórios."],
];

const security = [
  "Sigilo profissional preservado com isolamento de dados por escritório.",
  "Criptografia nas conversas do WhatsApp.",
  "Assinatura eletrônica avançada conforme Lei 14.063/2020.",
  "LGPD-friendly, com consentimento e exportação de dados quando solicitado.",
  "Backup automático no Google Drive.",
  "Logs e auditoria para rastrear quem fez o que.",
];

const plans = [
  {
    name: "Basic",
    slug: "basic",
    audience: "Para advogado solo profissionalizar a captação",
    description: "WhatsApp centralizado, pipeline visual básico e templates de contrato. Sem agente de IA.",
    cta: "Selecionar plano",
  },
  {
    name: "Pro",
    slug: "pro",
    audience: "Para escritórios que querem escalar",
    description: "Tudo do Basic + agente de IA jurídica, automações, assinatura digital e agendamento.",
    cta: "Selecionar plano",
    featured: true,
  },
  {
    name: "Scale",
    slug: "scale",
    audience: "Para bancas com múltiplas áreas",
    description: "Tudo do Pro + campanhas, dashboards completos, múltiplos pipelines e relatórios por advogado.",
    cta: "Selecionar plano",
  },
  {
    name: "Max",
    slug: "max",
    audience: "Para escritórios que querem a IA pronta para usar",
    description: "Tudo do Scale + Wizzy AI inclusa via API da plataforma, limites máximos e suporte prioritário.",
    cta: "Quero o Max",
  },
];

const faqs = [
  ["Preciso instalar alguma coisa?", "Não. O Wizzy é 100% web. A conexão do WhatsApp funciona por QR Code, como no WhatsApp Web."],
  ["Funciona com meu número atual do escritório?", "Sim. O Wizzy conecta mantendo o número que seus clientes já conhecem."],
  ["A assinatura digital tem validade jurídica?", "Sim. Usamos assinatura eletrônica avançada com OTP, carimbo de tempo e recibo de auditoria, em conformidade com a Lei 14.063/2020."],
  ["Como fica o sigilo profissional?", "Os dados ficam isolados por escritório. Apenas você e quem você autorizar tem acesso."],
  ["A IA pode dar consultoria jurídica?", "Não. O agente faz triagem, qualificação, coleta de dados e agendamento. Ele não substitui o advogado nem opina sobre o mérito do caso."],
  ["Posso ter pipeline separado por área?", "Sim. Cada área pode ter seu próprio pipeline, com etapas e regras próprias."],
  ["Posso cancelar quando quiser?", "Sim. Sem multa, sem letra miúda."],
];

const integrations = ["WhatsApp", "Google Calendar", "Google Meet", "Google Drive", "Asaas", "OpenAI"];

// ---------------------------------------------------------------------------
// Infra: reveal-on-scroll (IntersectionObserver, sem dependências externas)
// ---------------------------------------------------------------------------
function useInView<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          obs.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
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

type Tone = "dark" | "light";

const SectionHeading = ({
  eyebrow,
  title,
  description,
  tone = "dark",
  center = false,
  eyebrowClass,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  tone?: Tone;
  center?: boolean;
  eyebrowClass?: string;
}) => {
  const light = tone === "light";
  return (
    <div className={center ? "mx-auto max-w-3xl text-center" : "max-w-3xl"}>
      <p className={`text-sm font-semibold uppercase tracking-[0.22em] ${eyebrowClass ?? (light ? "text-slate-400" : "text-slate-500")}`}>{eyebrow}</p>
      <h2 className={`mt-4 text-3xl font-bold leading-tight sm:text-5xl ${light ? "text-slate-900" : "text-white"}`}>{title}</h2>
      {description && <p className={`mt-5 text-lg leading-8 ${light ? "text-slate-600" : "text-slate-400"}`}>{description}</p>}
    </div>
  );
};

const LandingPage = () => {
  const navigate = useNavigate();

  const goToAuth = async (selectedPlanSlug?: string) => {
    setSelectedEntryPlan(selectedPlanSlug);
    try {
      const assignment = await assignEntryFlow(window.location.pathname);
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
  const scrollToPricing = () => document.getElementById("planos")?.scrollIntoView({ behavior: "smooth" });

  return (
    <div className="dark min-h-screen overflow-x-hidden bg-[#0b0b12] text-slate-100 antialiased">
      <style>{`
        @keyframes marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        @keyframes aurora {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); opacity: .65; }
          50% { transform: translate3d(24px, -18px, 0) scale(1.08); opacity: 1; }
        }
        @keyframes gradient-shift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes spin-slow { to { transform: rotate(360deg); } }
        @keyframes floaty {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-12px); }
        }
        .animate-marquee { animation: marquee 32s linear infinite; }
        .animate-aurora { animation: aurora 12s ease-in-out infinite; }
        .animate-gradient-shift { background-size: 220% 220%; animation: gradient-shift 16s ease infinite; }
        .animate-spin-slow { animation: spin-slow 48s linear infinite; }
        .animate-floaty { animation: floaty 7s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .animate-marquee, .animate-aurora, .animate-gradient-shift, .animate-spin-slow, .animate-floaty { animation: none; }
        }
      `}</style>

      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0b0b12]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-pink-500 to-orange-500 shadow-lg shadow-pink-500/25">
              <Sparkles className="h-5 w-5 text-white" />
            </span>
            <span className="text-2xl font-bold tracking-tight">Wizzy</span>
          </button>

          <nav className="hidden items-center gap-9 text-base font-medium text-slate-400 md:flex">
            <a href="#solucao" className="transition hover:text-white">Solução</a>
            <a href="#funciona" className="transition hover:text-white">Como funciona</a>
            <a href="#recursos" className="transition hover:text-white">Recursos</a>
            <a href="#planos" className="transition hover:text-white">Planos</a>
          </nav>

          <div className="flex items-center gap-3">
            <Button variant="ghost" className="hidden h-11 px-5 text-base text-slate-300 hover:bg-white/5 hover:text-white sm:inline-flex" onClick={() => goToAuth()}>
              Entrar
            </Button>
            <Button className="h-11 border border-white/15 bg-white/10 px-5 text-base text-white hover:bg-white/15" onClick={() => goToAuth()}>
              Começar grátis
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main>
        {/* 2 — HERO (escuro, âncora, assimétrico) */}
        <section className="relative overflow-hidden px-4 pb-24 pt-16 sm:px-6 sm:pb-28 sm:pt-24 lg:px-8">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />
          <div className="pointer-events-none absolute -left-24 top-0 h-[520px] w-[820px] rounded-full bg-pink-500/10 blur-[120px]" />
          <div className="pointer-events-none absolute bottom-0 right-0 h-[440px] w-[540px] rounded-full bg-orange-500/10 blur-[120px]" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
            <Reveal className="max-w-xl">
              <Badge className="mb-6 border border-white/10 bg-white/5 px-3 py-1 text-slate-300 hover:bg-white/5">
                <Scale className="mr-2 h-3.5 w-3.5 text-pink-300" />
                Plataforma de captação para escritórios de advocacia
              </Badge>
              <h1 className="text-5xl font-bold leading-[1] tracking-tight text-white sm:text-6xl lg:text-7xl">
                Transforme o WhatsApp do seu escritório em uma{" "}
                <span className="bg-gradient-to-r from-pink-400 to-orange-400 bg-clip-text text-transparent">
                  máquina de fechar honorários
                </span>
                .
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-slate-300">
                Atenda 24/7 com IA jurídica, organize cada caso em um pipeline visual, envie contratos com assinatura digital de validade jurídica e acompanhe a captação em tempo real, tudo em um login só.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button size="lg" className="h-12 border-0 bg-gradient-to-r from-pink-500 to-orange-500 px-7 text-base text-white shadow-xl shadow-pink-500/25 hover:from-pink-600 hover:to-orange-600" onClick={() => goToAuth()}>
                  Começar agora, é grátis
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
                <Button size="lg" variant="outline" className="h-12 border-white/15 bg-white/5 px-7 text-base text-slate-100 hover:bg-white/10 hover:text-white" onClick={scrollToPricing}>
                  Ver planos
                </Button>
              </div>
              <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-400">
                {["7 dias grátis", "Sem cartão de crédito", "Cancele quando quiser"].map((item) => (
                  <span key={item} className="inline-flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    {item}
                  </span>
                ))}
              </div>
            </Reveal>

            <Reveal delay={150} className="[perspective:2200px]">
              <div className="transition-transform duration-700 will-change-transform lg:[transform:perspective(2200px)_rotateY(-9deg)_rotateX(3deg)] lg:hover:[transform:perspective(2200px)_rotateY(0deg)_rotateX(0deg)]">
                <HeroVisual />
              </div>
            </Reveal>
          </div>
        </section>

        {/* 2.5 — VÍDEO: Veja o Wizzy em ação */}
        <section id="video" className="relative overflow-hidden bg-[#0b0b12] px-4 py-24 sm:px-6 lg:px-8">
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-[420px] w-[820px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-pink-500/[0.07] blur-[120px]" />
          <div className="relative mx-auto max-w-5xl">
            <Reveal className="mx-auto mb-10 max-w-2xl text-center">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-500">Demonstração</p>
              <h2 className="mt-4 text-3xl font-bold leading-tight text-white sm:text-5xl">Veja o Wizzy em ação.</h2>
              <p className="mt-5 text-lg leading-8 text-slate-400">Do primeiro contato no WhatsApp ao contrato assinado, em poucos minutos.</p>
            </Reveal>
            <Reveal delay={120}>
              <div className="relative">
                <div className="pointer-events-none absolute -inset-4 bg-gradient-to-tr from-pink-500/20 via-orange-500/10 to-pink-500/20 blur-3xl" />
                <div className="relative overflow-hidden rounded-2xl border border-white/15 bg-[#0d0d14] shadow-2xl shadow-pink-500/10">
                  <div className="flex h-10 items-center gap-2 border-b border-white/10 bg-black/40 px-4">
                    <span className="h-3 w-3 rounded-full bg-rose-500" />
                    <span className="h-3 w-3 rounded-full bg-amber-400" />
                    <span className="h-3 w-3 rounded-full bg-emerald-400" />
                    <div className="ml-3 hidden h-6 max-w-md flex-1 items-center rounded-md bg-white/5 px-3 text-xs text-slate-500 sm:flex">app.wizzy.com.br</div>
                  </div>
                  <video
                    className="aspect-video w-full bg-black object-cover"
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    poster="/demo-wizzy-poster.jpg"
                  >
                    <source src="/demo-wizzy.webm" type="video/webm" />
                    <source src="/demo-wizzy.mp4" type="video/mp4" />
                    Seu navegador não suporta vídeo HTML5.
                  </video>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* 3 — Marquee de áreas */}
        <AreaMarquee />

        {/* 4 — DOR (escuro tenso, rose) */}
        <PainSection />

        {/* 5 — SOLUÇÃO (bloco de marca, reveal) */}
        <SolutionSection />

        {/* 6 — COMO FUNCIONA (claro/arejado) */}
        <TimelineSection />

        {/* 7 — RECURSOS (bento escuro diversificado) */}
        <BentoFeatures />

        {/* 8 — PACOTES POR ÁREA (escuro, acento laranja) */}
        <PracticePacksSection />

        {/* 9 — COMPARAÇÃO (split literal) */}
        <ComparisonSection />

        {/* 10 — INTEGRAÇÕES (orbit escuro) */}
        <OrbitIntegrationsSection />

        {/* 11 — DEPOIMENTOS (claro, prova social) */}
        <TestimonialsSection />

        {/* 12 — SEGURANÇA (escuro emerald) */}
        <SecuritySection />

        {/* 13 — PLANOS (claro/neutro) */}
        <section id="planos" className="bg-white px-4 py-24 text-slate-900 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <Reveal className="mb-12">
              <SectionHeading
                tone="light"
                eyebrow="Planos"
                title="Comece pequeno e escale conforme o escritório cresce."
                description="Teste grátis de 7 dias. Sem cartão. Cancele quando quiser."
              />
            </Reveal>
            <Reveal delay={80}>
              <PricingCards goToAuth={goToAuth} />
            </Reveal>
          </div>
        </section>

        {/* 14 — FAQ (escuro calmo) */}
        <section className="bg-[#0b0b12] px-4 py-24 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <Reveal className="mb-10">
              <SectionHeading
                eyebrow="FAQ"
                title="Dúvidas comuns antes de começar."
                description="Respostas diretas para os pontos que normalmente travam a decisão."
              />
            </Reveal>
            <div className="mx-auto grid max-w-5xl gap-3 md:grid-cols-2">
              {faqs.map(([question, answer], index) => (
                <details key={question} className="group rounded-xl border border-white/10 bg-white/[0.035] p-5 transition hover:border-white/20 hover:bg-white/[0.05]">
                  <summary className="cursor-pointer list-none font-semibold text-white marker:hidden">
                    <span className="flex items-center justify-between gap-4">
                      <span className="flex items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-300">
                          {index % 3 === 0 ? <Shield className="h-4 w-4" /> : index % 3 === 1 ? <MessageSquare className="h-4 w-4" /> : <FileSignature className="h-4 w-4" />}
                        </span>
                        {question}
                      </span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-slate-500 transition group-open:rotate-90" />
                    </span>
                  </summary>
                  <p className="mt-3 text-sm leading-6 text-slate-400">{answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* 15 — CTA FINAL (bloco de marca, crescendo) */}
        <FinalCTA goToAuth={goToAuth} />
      </main>

      <footer className="border-t border-white/10 px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="flex items-center gap-2 text-white">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-pink-500 to-orange-500">
                  <Sparkles className="h-5 w-5 text-white" />
                </span>
                <span className="text-lg font-bold">Wizzy</span>
              </div>
              <p className="mt-3 max-w-xs text-xs text-slate-500">Plataforma de captação de clientes para escritórios de advocacia.</p>
            </div>
            <div>
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Produto</h4>
              <ul className="space-y-2 text-sm text-slate-500">
                <li><a href="#recursos" className="transition hover:text-white">Recursos</a></li>
                <li><a href="#planos" className="transition hover:text-white">Planos</a></li>
                <li><a href="#funciona" className="transition hover:text-white">Como funciona</a></li>
              </ul>
            </div>
            <div>
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Legal</h4>
              <ul className="space-y-2 text-sm text-slate-500">
                <li><a href="/termos" className="transition hover:text-white">Termos de Uso</a></li>
                <li><a href="/privacidade" className="transition hover:text-white">Política de Privacidade</a></li>
                <li><a href="/lgpd" className="transition hover:text-white">LGPD</a></li>
              </ul>
            </div>
            <div>
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Contato</h4>
              <ul className="space-y-2 text-sm text-slate-500">
                <li>contato@wizzy.com.br</li>
                <li>Suporte 24/7</li>
              </ul>
            </div>
          </div>
          <p className="mt-10 border-t border-white/10 pt-6 text-center text-xs text-slate-600">
            © {new Date().getFullYear()} Wizzy. Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
};

// ===========================================================================
// MOCKUPS (reaproveitados)
// ===========================================================================

const leadCards = [
  { name: "Maria Oliveira", case: "Divórcio consensual", value: "R$ 3.500", tag: "Família" },
  { name: "Carla Dias", case: "Pensão alimentícia", value: "R$ 2.800", tag: "Família" },
];

const dashboardColumns = [
  { title: "Triagem", count: 4, cards: leadCards },
  { title: "Análise", count: 3, cards: [{ name: "João Santos", case: "Inventário", value: "R$ 8.000", tag: "Sucessões" }] },
  { title: "Proposta", count: 2, cards: [{ name: "Ana Costa", case: "Guarda compartilhada", value: "R$ 5.200", tag: "Família", highlight: true }] },
  { title: "Contrato", count: 1, cards: [{ name: "Pedro Lima", case: "Divórcio litigioso", value: "R$ 12.000", tag: "Família", signed: true }] },
];

const DashboardScreen = () => (
  <div className="overflow-hidden rounded-lg bg-[#0d0d14]">
    <div className="flex h-9 items-center gap-2 border-b border-white/10 bg-black/40 px-3 sm:h-11 sm:px-4">
      <span className="h-2.5 w-2.5 rounded-full bg-rose-500 sm:h-3 sm:w-3" />
      <span className="h-2.5 w-2.5 rounded-full bg-amber-400 sm:h-3 sm:w-3" />
      <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 sm:h-3 sm:w-3" />
      <div className="ml-3 hidden h-6 max-w-md flex-1 items-center rounded-md bg-white/5 px-3 text-xs text-slate-500 sm:flex">
        app.wizzy.com.br/pipeline
      </div>
    </div>
    <div className="grid lg:grid-cols-[200px_1fr]">
      <aside className="hidden space-y-1 border-r border-white/10 bg-black/20 p-4 lg:block">
        <div className="mb-4 flex items-center gap-2 px-2 py-1.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-pink-500 to-orange-500">
            <Sparkles className="h-3.5 w-3.5 text-white" />
          </span>
          <span className="text-sm font-bold text-white">Wizzy</span>
        </div>
        {[
          { icon: MessageSquare, label: "Conversas", count: 12 },
          { icon: LayoutGrid, label: "Pipeline", active: true },
          { icon: FileSignature, label: "Contratos", count: 3 },
          { icon: Calendar, label: "Agenda" },
          { icon: BarChart3, label: "Relatórios" },
          { icon: Users, label: "Equipe" },
        ].map((item) => (
          <div key={item.label} className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm ${item.active ? "bg-pink-500/15 text-pink-100" : "text-slate-400"}`}>
            <item.icon className="h-4 w-4" />
            <span className="flex-1">{item.label}</span>
            {item.count && <span className="rounded-full bg-white/10 px-1.5 text-[10px] text-slate-400">{item.count}</span>}
          </div>
        ))}
      </aside>
      <div className="p-4 sm:p-6">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">Pipeline · Família</h3>
            <p className="text-xs text-slate-500">R$ 47.500 em propostas ativas</p>
          </div>
          <div className="flex gap-2">
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300">Filtrar</div>
            <div className="rounded-lg bg-gradient-to-r from-pink-500 to-orange-500 px-3 py-1.5 text-xs font-medium text-white">+ Novo caso</div>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {dashboardColumns.map((col) => (
            <div key={col.title} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300">{col.title}</span>
                <span className="rounded-md bg-white/5 px-1.5 text-[10px] text-slate-400">{col.count}</span>
              </div>
              <div className="space-y-2">
                {col.cards.map((card) => (
                  <div key={card.name} className={`rounded-lg border p-2.5 ${card.highlight ? "border-pink-500/40 bg-pink-500/10" : card.signed ? "border-emerald-500/30 bg-emerald-500/5" : "border-white/10 bg-white/[0.03]"}`}>
                    <div className="mb-1.5 flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-pink-500 to-orange-500 text-[9px] font-bold text-white">
                        {card.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                      </span>
                      <span className="truncate text-[11px] font-medium text-white">{card.name}</span>
                    </div>
                    <p className="mb-1.5 text-[10px] text-slate-400">{card.case}</p>
                    <div className="flex items-center justify-between">
                      <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-[9px] text-slate-400">{card.tag}</span>
                      <span className={`text-[10px] font-bold ${card.highlight ? "text-pink-300" : card.signed ? "text-emerald-300" : "text-white"}`}>{card.value}</span>
                    </div>
                    {card.signed && (
                      <div className="mt-2 flex items-center gap-1 text-[9px] text-emerald-300">
                        <BadgeCheck className="h-3 w-3" /> Assinado via OTP
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

const HeroVisual = () => (
  <div className="relative mx-auto w-full max-w-2xl lg:mx-0 lg:w-[44rem] lg:max-w-none">
    <div className="pointer-events-none absolute -inset-4 bg-gradient-to-tr from-pink-500/25 via-orange-500/10 to-pink-500/20 blur-3xl" />
    <div className="relative overflow-hidden rounded-2xl border border-white/15 bg-[#0d0d14]/95 shadow-2xl shadow-pink-500/10 backdrop-blur-xl">
      <DashboardScreen />
    </div>
    <div className="pointer-events-none absolute -bottom-16 left-1/2 h-20 w-3/4 -translate-x-1/2 rounded-full bg-pink-500/10 blur-3xl" />
  </div>
);

const AreaMarquee = () => (
  <section className="relative overflow-hidden border-y border-white/5 bg-[#0b0b12] py-12">
    <div className="mx-auto max-w-7xl px-4">
      <p className="mb-6 text-center text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
        Áreas configuradas e prontas para usar
      </p>
    </div>
    <div className="absolute inset-y-0 left-0 z-10 w-32 bg-gradient-to-r from-[#0b0b12] to-transparent" />
    <div className="absolute inset-y-0 right-0 z-10 w-32 bg-gradient-to-l from-[#0b0b12] to-transparent" />
    <div className="flex w-max animate-marquee gap-3 whitespace-nowrap px-3">
      {[...areas, ...areas, ...areas, ...areas].map((area, index) => (
        <span key={`${area}-${index}`} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-5 py-2.5 text-sm text-slate-300">
          <Scale className="h-3.5 w-3.5 text-pink-300/70" />
          {area}
        </span>
      ))}
    </div>
  </section>
);

const WhatsAppChaos = () => (
  <div className="rounded-[2rem] border border-rose-500/25 bg-rose-500/5 p-3 shadow-2xl shadow-rose-950/30">
    <div className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-[#101018]">
      <div className="flex items-center justify-between border-b border-white/10 bg-[#202c33] px-4 py-3">
        <div className="flex items-center gap-3">
          <MessageSquare className="h-5 w-5 text-emerald-400" />
          <div>
            <p className="text-sm font-semibold text-white">WhatsApp Web</p>
            <p className="text-[11px] text-rose-300">18 conversas sem resposta</p>
          </div>
        </div>
        <Badge className="border border-rose-500/40 bg-rose-500/20 text-[10px] text-rose-100">caos total</Badge>
      </div>
      <div className="max-h-[480px] divide-y divide-white/5 overflow-hidden">
        {[
          ["Maria O.", "Boa noite doutor, preciso muito falar sobre meu divórcio", "23:47", 3, true],
          ["Cliente desconhecido", "Doutor, achei seu número numa indicação...", "22:12", 1, true],
          ["João Santos", "Já consegui os documentos que pediu", "ontem", 2, false],
          ["Carla", "Posso te ligar agora?", "ontem", 5, true],
          ["Ana Costa", "E aquela proposta que mandou?", "2 dias", 1, false],
          ["Pedro", "Audiência foi remarcada?", "3 dias", 1, false],
          ["Lucas F.", "Boa tarde, sou cliente novo, vi seu Instagram...", "3 dias", 2, true],
        ].map(([name, msg, time, unread, urgent], index) => (
          <div key={String(name)} className={`flex items-start gap-3 p-3 hover:bg-white/5 ${urgent && index < 3 ? "bg-rose-500/[0.04]" : ""}`}>
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold ${urgent ? "bg-rose-500/20 text-rose-200" : "bg-white/10 text-slate-300"}`}>
              {String(name).split(" ").map((part) => part[0]).join("").slice(0, 2)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-0.5 flex items-center justify-between">
                <p className="truncate text-sm font-medium text-white">{String(name)}</p>
                <p className={`text-[10px] ${urgent && index < 2 ? "text-rose-300" : "text-slate-500"}`}>{String(time)}</p>
              </div>
              <p className="truncate text-xs text-slate-400">{String(msg)}</p>
            </div>
            <span className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${urgent ? "bg-rose-500 text-white" : "bg-emerald-500 text-white"}`}>
              {Number(unread)}
            </span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 border-t border-rose-500/30 bg-rose-500/10 p-3">
        <Clock className="h-4 w-4 text-rose-300" />
        <p className="text-xs text-rose-200">Tempo médio de resposta: <span className="font-bold">4h 32min</span></p>
      </div>
    </div>
  </div>
);

const StepPreview = ({ number }: { number: string }) => {
  if (number === "01") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          {["WhatsApp", "Site", "Instagram"].map((source) => (
            <div key={source} className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] text-slate-300">{source}</div>
          ))}
        </div>
        <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
          <ArrowRight className="h-4 w-4 text-pink-300" />
          <span className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 font-bold text-white">Wizzy</span>
        </div>
      </div>
    );
  }
  if (number === "02") {
    return (
      <div className="space-y-3">
        <div className="w-4/5 rounded-xl rounded-bl-sm bg-white/[0.06] p-3 text-xs text-slate-200">Doutor, preciso de orientação sobre divórcio</div>
        <div className="ml-auto w-4/5 rounded-xl rounded-br-sm bg-emerald-500/10 p-3 text-xs text-emerald-100">Olá! Vou te ajudar e coletar os dados iniciais.</div>
      </div>
    );
  }
  if (number === "03") return <MiniKanban />;
  if (number === "04") {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <FileSignature className="mb-3 h-6 w-6 text-pink-300" />
        <div className="mb-2 h-2 rounded bg-white/10" />
        <div className="mb-4 h-2 w-2/3 rounded bg-white/10" />
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">OTP verificado</div>
      </div>
    );
  }
  if (number === "05") {
    return (
      <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
        {["09:00", "10:30", "14:00", "15:30", "17:00", "Meet"].map((slot, index) => (
          <div key={slot} className={`rounded-lg border px-2 py-3 ${index < 5 ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-200" : "border-white/10 bg-white/[0.04] text-slate-300"}`}>{slot}</div>
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex h-24 items-end gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
        {[40, 62, 48, 80, 70].map((height) => <div key={height} className="flex-1 rounded-t bg-white/20" style={{ height: `${height}%` }} />)}
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-white/[0.04] p-2 text-white">+34% conv.</div>
        <div className="rounded-lg bg-white/[0.04] p-2 text-white">R$ 5,8k</div>
      </div>
    </div>
  );
};

const MiniKanban = () => (
  <div className="grid grid-cols-3 gap-2">
    {["Triagem", "Proposta", "Contrato"].map((label, index) => (
      <div key={label} className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
        <p className="mb-2 text-[10px] font-semibold text-slate-400">{label}</p>
        <div className={`h-10 rounded-md border ${index === 1 ? "border-pink-500/30 bg-pink-500/10" : "border-white/10 bg-white/[0.04]"}`} />
      </div>
    ))}
  </div>
);

const SolutionFlowVisual = () => (
  <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#0d0d14] p-5 shadow-2xl shadow-black/40">
    <div className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-pink-500/10 blur-3xl" />
    <div className="pointer-events-none absolute -bottom-24 left-8 h-56 w-56 rounded-full bg-orange-500/10 blur-3xl" />
    <div className="relative grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
      <div className="space-y-3">
        {[
          ["Entrada", "WhatsApp, site e indicações", MessageSquare],
          ["Triagem IA", "Qualificação e coleta inicial", Bot],
          ["Fechamento", "Contrato, agenda e follow-up", FileSignature],
        ].map(([title, text, Icon], index) => (
          <div key={String(title)} className={`rounded-2xl border p-4 ${index === 1 ? "border-pink-500/30 bg-pink-500/10" : "border-white/10 bg-black/20"}`}>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.06]">
                <Icon className="h-5 w-5 text-pink-300" />
              </span>
              <div>
                <p className="font-semibold text-white">{String(title)}</p>
                <p className="text-xs text-slate-400">{String(text)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-white/10 bg-[#0a0a10] p-4">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-semibold text-white">Operação do escritório</p>
          <Badge className="border border-emerald-500/30 bg-emerald-500/10 text-emerald-200">ao vivo</Badge>
        </div>
        <div className="space-y-3">
          {[
            ["Lead novo", "respondido em 4s", "text-emerald-300"],
            ["Proposta enviada", "R$ 5.200", "text-pink-300"],
            ["Contrato assinado", "OTP validado", "text-emerald-300"],
            ["Consulta marcada", "Google Meet", "text-orange-300"],
          ].map(([title, value, color]) => (
            <div key={String(title)} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3">
              <span className="text-sm text-slate-300">{String(title)}</span>
              <span className={`text-xs font-semibold ${String(color)}`}>{String(value)}</span>
            </div>
          ))}
        </div>
        <div className="mt-5 grid grid-cols-3 gap-2">
          {[72, 48, 88].map((height) => (
            <div key={height} className="flex h-24 items-end rounded-xl border border-white/10 bg-white/[0.025] p-2">
              <div className="w-full rounded-t-lg bg-gradient-to-t from-pink-500/60 to-orange-400/60" style={{ height: `${height}%` }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

const FeatureVisual = ({ index }: { index: number }) => {
  if (index === 0) {
    return (
      <div className="mt-6 space-y-3 rounded-xl border border-white/10 bg-black/30 p-4">
        <div className="flex items-start gap-2">
          <div className="h-7 w-7 rounded-full bg-gradient-to-br from-pink-500 to-orange-500" />
          <div className="max-w-[70%] rounded-lg rounded-tl-none bg-white/5 px-3 py-2">
            <p className="text-xs text-white">Boa noite doutor, preciso falar sobre meu caso</p>
          </div>
        </div>
        <div className="flex flex-row-reverse items-start gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/20">
            <Bot className="h-3.5 w-3.5 text-emerald-300" />
          </div>
          <div className="max-w-[70%] rounded-lg rounded-tr-none bg-emerald-500/10 px-3 py-2">
            <p className="text-xs text-white">Olá! Vou te ajudar agora.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
          <BadgeCheck className="h-3.5 w-3.5 text-emerald-300" />
          <p className="text-[10px] text-emerald-200">Lead qualificado e movido para Triagem</p>
        </div>
      </div>
    );
  }
  if (index === 1) return <div className="mt-6"><StepPreview number="02" /></div>;
  if (index === 3) return <div className="mt-6"><MiniKanban /></div>;
  if (index === 10) return <div className="mt-6"><StepPreview number="06" /></div>;
  return null;
};

const SecurityVisual = () => (
  <div className="relative flex min-h-[480px] items-center justify-center overflow-hidden rounded-[2rem] border border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.08] to-transparent">
    <div className="animate-spin-slow absolute h-80 w-80 rounded-full border border-emerald-400/10" />
    <div className="absolute h-64 w-64 rounded-full border border-emerald-400/15" />
    <div className="animate-spin-slow absolute h-48 w-48 rounded-full border border-emerald-400/20" style={{ animationDirection: "reverse" }} />
    <div className="absolute h-32 w-32 rounded-full border border-emerald-400/30" />
    <div className="relative flex h-24 w-24 items-center justify-center rounded-3xl border border-emerald-400/40 bg-emerald-500/20 shadow-2xl shadow-emerald-500/30">
      <Shield className="h-12 w-12 text-emerald-300" />
    </div>
    {[
      ["Criptografia E2E", Lock, "top-12 left-1/2 -translate-x-1/2", "emerald"],
      ["LGPD", BadgeCheck, "bottom-12 left-1/2 -translate-x-1/2", "pink"],
      ["Lei 14.063", Scale, "left-8 top-1/2 -translate-y-1/2", "orange"],
      ["Multi-tenant RLS", Shield, "right-8 top-1/2 -translate-y-1/2", "emerald"],
    ].map(([label, Icon, position, tone]) => (
      <div key={String(label)} className={`absolute ${position} flex items-center gap-1.5 rounded-full border border-white/10 bg-[#0d0d14] px-3 py-1.5 shadow-xl`}>
        <Icon className={`h-3.5 w-3.5 ${tone === "pink" ? "text-pink-300" : tone === "orange" ? "text-orange-300" : "text-emerald-300"}`} />
        <span className="text-xs font-medium text-white">{String(label)}</span>
      </div>
    ))}
  </div>
);

const AreaMap = () => (
  <div className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-3">
    {packs.map(([title]) => (
      <div key={title} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-center text-xs font-semibold text-slate-200">
        {title}
      </div>
    ))}
  </div>
);

// ===========================================================================
// SEÇÕES (com ritmo multi-clima)
// ===========================================================================

const PainSection = () => (
  <section className="relative overflow-hidden bg-[#08080d] px-4 py-24 sm:px-6 lg:px-8">
    <div className="pointer-events-none absolute -left-32 top-1/4 h-[440px] w-[440px] rounded-full bg-rose-600/10 blur-[120px]" />
    <div className="pointer-events-none absolute bottom-0 right-0 h-[380px] w-[380px] rounded-full bg-rose-900/20 blur-[120px]" />
    <div className="relative mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
      <Reveal className="lg:[transform:perspective(2000px)_rotateY(2deg)]">
        <WhatsAppChaos />
      </Reveal>

      <Reveal delay={120}>
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-rose-300">A dor</p>
        <h2 className="mt-4 max-w-xl text-3xl font-bold leading-tight text-white sm:text-5xl">
          Advogados perdem honorários quando a captação fica espalhada.
        </h2>
        <p className="mt-5 max-w-xl text-lg leading-8 text-slate-300">
          O problema não é só responder mensagem. É saber quem chegou, qual caso vale atenção, quem ficou responsável e o que precisa acontecer para o contrato voltar assinado.
        </p>
        <div className="mt-8 space-y-2.5">
          {pains.map((pain) => (
            <div key={pain.title} className="flex items-start gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5 transition hover:border-rose-500/30 hover:bg-rose-500/[0.04]">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-500/10 text-rose-300">
                <pain.icon className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold text-white">{pain.title}</p>
                <p className="mt-0.5 text-xs leading-5 text-slate-400">{pain.text}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-2xl border border-rose-500/25 bg-gradient-to-r from-rose-500/10 to-transparent p-5">
          <p className="text-sm font-semibold text-white">Captar no improviso custa caro.</p>
          <p className="mt-1 text-sm leading-6 text-slate-300">O Wizzy organiza a captação inteira do seu escritório em um só lugar.</p>
        </div>
      </Reveal>
    </div>
  </section>
);

const SolutionSection = () => (
  <section id="solucao" className="relative overflow-hidden px-4 py-28 sm:px-6 lg:px-8">
    <div className="absolute inset-0 animate-gradient-shift bg-[linear-gradient(120deg,#db2777,#f97316,#ec4899,#fb923c)]" />
    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_30%,transparent,rgba(0,0,0,0.4))]" />
    <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.05)_1px,transparent_1px)] bg-[size:56px_56px] opacity-40 [mask-image:radial-gradient(ellipse_at_center,black,transparent_80%)]" />
    <div className="relative mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-2">
      <Reveal>
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-white/70">A solução</p>
        <h2 className="mt-4 text-5xl font-bold leading-[0.95] tracking-tight text-white sm:text-7xl">Conheça o Wizzy.</h2>
        <p className="mt-6 max-w-lg text-lg leading-8 text-white/90">
          A plataforma de IA, atendimento, CRM e contratos feita para a realidade de quem advoga no Brasil.
        </p>
        <div className="mt-8 space-y-3">
          {["WhatsApp + IA jurídica", "Pipeline visual por área", "Contrato com assinatura digital", "Agenda e relatórios"].map((item) => (
            <div key={item} className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur">
                <Check className="h-4 w-4" />
              </span>
              <span className="text-base font-medium text-white">{item}</span>
            </div>
          ))}
        </div>
      </Reveal>

      <Reveal delay={120} className="animate-floaty">
        <SolutionFlowVisual />
      </Reveal>
    </div>
  </section>
);

const TimelineSection = () => (
  <section id="funciona" className="bg-[#f6f6f4] px-4 py-24 text-slate-900 sm:px-6 lg:px-8">
    <div className="mx-auto max-w-7xl">
      <Reveal className="mb-12 max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-400">Como funciona</p>
        <h2 className="mt-4 text-3xl font-bold leading-tight text-slate-900 sm:text-5xl">Da primeira mensagem ao contrato assinado.</h2>
      </Reveal>
      <div className="relative">
        <div className="absolute left-7 top-0 hidden h-full w-px bg-gradient-to-b from-pink-500 via-orange-400 to-transparent lg:block" />
        <div className="grid gap-5">
          {steps.map((step, i) => (
            <Reveal key={step.number} delay={i * 60}>
              <div className="group grid items-stretch gap-5 lg:grid-cols-[90px_minmax(0,1fr)_minmax(0,0.8fr)]">
                <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-500 to-orange-500 text-lg font-bold text-white shadow-lg shadow-pink-500/25 transition group-hover:scale-105">
                  {step.number}
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition group-hover:border-pink-200 group-hover:shadow-md">
                  <step.icon className="mb-4 h-6 w-6 text-orange-500" />
                  <h3 className="text-xl font-semibold text-slate-900">{step.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{step.text}</p>
                </div>
                <div className="hidden rounded-2xl border border-slate-800/40 bg-[#0a0a10] p-4 shadow-sm lg:block">
                  <StepPreview number={step.number} />
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </div>
  </section>
);

const bentoStyle = (i: number) => {
  if (i === 0) return "lg:col-span-2 lg:row-span-2 border-white/10 bg-white/[0.04]";
  if (i === 1) return "lg:col-span-2 border-white/10 bg-white/[0.06]";
  if (i === 3) return "lg:col-span-2 border-white/15 bg-transparent";
  if (i === 10) return "lg:col-span-2 border-pink-500/30 bg-gradient-to-br from-pink-500/15 to-orange-500/10";
  return i % 2 === 0 ? "border-white/10 bg-white/[0.05]" : "border-white/[0.12] bg-transparent";
};

const BentoFeatures = () => (
  <section id="recursos" className="bg-[#0f0f16] px-4 py-24 sm:px-6 lg:px-8">
    <div className="mx-auto max-w-7xl">
      <Reveal className="mb-12 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-500">Tudo que o escritório precisa</p>
          <h2 className="mt-4 text-3xl font-bold leading-tight text-white sm:text-5xl">Uma operação completa de captação jurídica.</h2>
        </div>
        <p className="max-w-md text-sm leading-6 text-slate-400">Atendimento, IA, pipeline, documentos, agenda, campanhas e relatórios no mesmo fluxo.</p>
      </Reveal>
      <div className="grid auto-rows-[minmax(190px,auto)] gap-4 lg:grid-cols-4">
        {features.map((feature, index) => (
          <Reveal key={feature.title} className={bentoStyle(index)}>
            <div className="group relative h-full overflow-hidden rounded-2xl border border-inherit bg-inherit p-6 transition hover:border-white/25 hover:bg-white/[0.07]">
              <div className="absolute -right-20 -top-20 h-40 w-40 rounded-full bg-pink-500/10 opacity-0 blur-3xl transition group-hover:opacity-100" />
              <feature.icon className={`relative mb-5 h-7 w-7 ${index === 10 ? "text-orange-200" : "text-pink-300"}`} />
              <div className="relative">
                {feature.badge && <Badge className="mb-3 border border-white/10 bg-white/[0.05] text-slate-300">{feature.badge}</Badge>}
                <h3 className="text-xl font-semibold text-white">{feature.title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-400">{feature.text}</p>
                <FeatureVisual index={index} />
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </div>
  </section>
);

const PracticePacksSection = () => (
  <section className="bg-[#0b0b12] px-4 py-24 sm:px-6 lg:px-8">
    <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.95fr_1.05fr]">
      <Reveal className="rounded-[2rem] border border-orange-500/25 bg-orange-500/5 p-6 shadow-2xl shadow-orange-500/10">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-orange-300/80">Pacotes por área</p>
        <h2 className="mt-4 text-3xl font-bold text-white sm:text-5xl">Ative em 1 clique.</h2>
        <p className="mt-5 text-sm leading-6 text-slate-300">Pipeline, fluxos, prompts da IA e templates de contrato já nascem adaptados para a rotina de cada área.</p>
        <div className="mt-8 rounded-3xl border border-white/10 bg-[#0d0d14] p-4">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Setup selecionado</p>
              <p className="mt-1 text-lg font-semibold text-white">Escritorio multidisciplinar</p>
            </div>
            <Badge className="border border-emerald-500/30 bg-emerald-500/15 text-emerald-100">pronto</Badge>
          </div>
          <div className="space-y-4">
            {[
              ["Pipeline", "85%"],
              ["IA juridica", "72%"],
              ["Contratos", "64%"],
            ].map(([label, width]) => (
              <div key={label}>
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-300">{label}</span>
                  <span className="text-slate-500">{width}</span>
                </div>
                <div className="h-2 rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-gradient-to-r from-pink-500 to-orange-400" style={{ width }} />
                </div>
              </div>
            ))}
          </div>
          <AreaMap />
        </div>
      </Reveal>
      <Reveal delay={100} className="relative rounded-[2rem] border border-white/10 bg-white/[0.025] p-5 sm:p-6">
        <div className="absolute bottom-8 left-8 top-8 hidden w-px bg-gradient-to-b from-orange-500/50 via-white/10 to-pink-500/40 sm:block" />
        {packs.map(([title, text], index) => (
          <div key={title} className="relative mb-4 last:mb-0 sm:pl-10">
            <span className={`absolute left-0 top-5 hidden h-4 w-4 rounded-full border sm:block ${index === 0 ? "border-orange-300 bg-orange-400 shadow-lg shadow-orange-500/30" : "border-white/20 bg-[#0d0d14]"}`} />
            <div className={`rounded-2xl border p-5 ${index === 0 ? "border-orange-500/35 bg-orange-500/10" : "border-white/10 bg-white/[0.035]"}`}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="font-semibold text-white">{title}</h3>
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  {String(index + 1).padStart(2, "0")}
                </span>
              </div>
              <p className="text-sm leading-6 text-slate-400">{text}</p>
            </div>
          </div>
        ))}
      </Reveal>
    </div>
  </section>
);

const ComparisonSection = () => (
  <section className="bg-[#0b0b12] px-4 py-24 sm:px-6 lg:px-8">
    <div className="mx-auto max-w-7xl">
      <Reveal className="mb-10 max-w-3xl">
        <SectionHeading eyebrow="WhatsApp solto vs Wizzy" title="O mesmo canal, com estrutura de escritório." />
      </Reveal>
      <Reveal>
        <div className="relative grid overflow-hidden rounded-3xl border border-white/10 md:grid-cols-2">
          {/* selo VS central */}
          <div className="absolute left-1/2 top-1/2 z-20 hidden h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-gradient-to-br from-pink-500 to-orange-500 text-xs font-black text-white shadow-xl shadow-pink-500/30 md:flex">
            VS
          </div>

          {/* ANTES — escuro + rose */}
          <div className="bg-[#0d0a0c] p-6 sm:p-8">
            <div className="mb-6 flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-500/15 text-rose-300">
                <X className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-lg font-bold text-rose-100">Como faz hoje</h3>
                <p className="text-xs text-rose-200/60">WhatsApp solto e improviso</p>
              </div>
            </div>
            <div className="divide-y divide-white/5">
              {comparison.map(([before]) => (
                <div key={before} className="flex min-h-[64px] items-center gap-3 py-3.5">
                  <X className="h-4 w-4 shrink-0 text-rose-400" />
                  <p className="text-sm text-slate-300">{before}</p>
                </div>
              ))}
            </div>
          </div>

          {/* DEPOIS — claro + emerald */}
          <div className="bg-[#f1f7f3] p-6 text-slate-900 sm:p-8">
            <div className="mb-6 flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600">
                <Check className="h-5 w-5" />
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-bold text-emerald-900">Com o Wizzy</h3>
                <Badge className="border border-emerald-500/30 bg-emerald-500/15 text-[10px] text-emerald-700">recomendado</Badge>
              </div>
            </div>
            <p className="-mt-4 mb-2 text-xs text-emerald-700/70">Operação estruturada de captação</p>
            <div className="divide-y divide-emerald-900/10">
              {comparison.map(([, after]) => (
                <div key={after} className="flex min-h-[64px] items-center gap-3 py-3.5">
                  <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                  <p className="text-sm font-medium text-slate-700">{after}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Reveal>
    </div>
  </section>
);

const OrbitIntegrationsSection = () => (
  <section className="overflow-hidden border-y border-white/5 bg-[#0b0b12] px-4 py-24 sm:px-6 lg:px-8">
    <div className="mx-auto max-w-7xl">
      <Reveal className="mx-auto mb-12 max-w-2xl text-center">
        <SectionHeading center eyebrow="Integrações nativas" title="Conecte com as ferramentas que você já usa." />
      </Reveal>
      <Reveal className="relative mx-auto h-[480px] w-full max-w-[600px]">
        <div className="absolute inset-0 animate-spin-slow">
          <div className="absolute inset-0 rounded-full border border-white/[0.04]" />
          <div className="absolute inset-12 rounded-full border border-white/[0.06]" />
          <div className="absolute inset-24 rounded-full border border-white/[0.08]" />
        </div>
        <div className="absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full bg-pink-500/20 blur-3xl" />
        <div className="absolute left-1/2 top-1/2 z-10 flex h-28 w-28 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-3xl bg-gradient-to-br from-pink-500 to-orange-500 text-white shadow-2xl shadow-pink-500/30">
          <Sparkles className="h-10 w-10" />
        </div>
        {integrations.map((item, index) => {
          const positions = [["10%", "50%"], ["30%", "85%"], ["70%", "85%"], ["90%", "50%"], ["70%", "15%"], ["30%", "15%"]];
          return (
            <div key={item} className="absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/15 bg-[#0d0d14] px-5 py-3 text-sm font-semibold text-white shadow-xl backdrop-blur" style={{ top: positions[index][0], left: positions[index][1] }}>
              {item}
            </div>
          );
        })}
      </Reveal>
    </div>
  </section>
);

const TestimonialsSection = () => (
  <section className="bg-[#f6f6f4] px-4 py-24 text-slate-900 sm:px-6 lg:px-8">
    <div className="mx-auto max-w-7xl">
      <Reveal className="mb-16 grid gap-8 md:grid-cols-3">
        {[
          ["2.400+", "advogados ativos na plataforma"],
          ["+340%", "aumento médio em fechamento de honorários"],
          ["4.9", "avaliação média dos usuários"],
        ].map(([value, label]) => (
          <div key={label} className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-pink-500/10 blur-2xl" />
            <p className="relative bg-gradient-to-r from-pink-500 to-orange-500 bg-clip-text text-6xl font-black text-transparent">{value}</p>
            <p className="relative mt-3 text-sm text-slate-500">{label}</p>
          </div>
        ))}
      </Reveal>

      <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
        <Reveal className="relative flex flex-col justify-between overflow-hidden rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-orange-500/10 blur-3xl" />
          <Quote className="relative h-10 w-10 text-pink-400" />
          <p className="relative mt-6 text-2xl font-semibold leading-10 text-slate-900">"{testimonials[0][2]}"</p>
          <div className="relative mt-8">
            <div className="mb-4 flex gap-1">
              {[0, 1, 2, 3, 4].map((s) => (
                <Star key={s} className="h-4 w-4 fill-amber-400 text-amber-400" />
              ))}
            </div>
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-pink-500 to-orange-500 text-sm font-bold text-white">
                {testimonials[0][0].split(" ").map((part) => part[0]).join("").slice(0, 2)}
              </span>
              <div>
                <p className="font-semibold text-slate-900">{testimonials[0][0]}</p>
                <p className="text-xs text-slate-500">{testimonials[0][1]}</p>
              </div>
            </div>
            <div className="mt-8 flex flex-wrap gap-2">
              {["OAB-friendly", "LGPD", "Top 100 escritorios", "Suporte humano"].map((item) => (
                <span key={item} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
                  {item}
                </span>
              ))}
            </div>
          </div>
        </Reveal>

        <div className="grid gap-4 sm:grid-cols-2">
          {testimonials.slice(1).map(([name, role, quote], i) => (
            <Reveal key={name} delay={i * 60} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
              <p className="text-sm leading-6 text-slate-600">"{quote}"</p>
              <div className="mt-5 flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-pink-500/20 to-orange-500/20 text-sm font-bold text-pink-600">
                  {name.split(" ").map((part) => part[0]).join("").slice(0, 2)}
                </span>
                <div>
                  <p className="font-semibold text-slate-900">{name}</p>
                  <p className="text-xs text-slate-500">{role}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </div>
  </section>
);

const SecuritySection = () => (
  <section className="relative overflow-hidden bg-[#0b0b12] px-4 py-24 sm:px-6 lg:px-8">
    <div className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[700px] -translate-x-1/2 rounded-full bg-emerald-500/[0.07] blur-[120px]" />
    <div className="relative mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[0.9fr_1.1fr]">
      <Reveal>
        <SecurityVisual />
      </Reveal>

      <Reveal delay={100}>
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-emerald-300">Segurança e compliance</p>
        <h2 className="mt-4 text-3xl font-bold leading-tight text-white sm:text-5xl">A advocacia tem dever de sigilo. Seu sistema também.</h2>
        <div className="mt-8 space-y-3">
          {security.map((item) => (
            <div key={item} className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.035] p-4 transition hover:border-emerald-500/30 hover:bg-emerald-500/[0.04]">
              <Shield className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
              <span className="text-sm leading-6 text-slate-300">{item}</span>
            </div>
          ))}
        </div>
      </Reveal>
    </div>
  </section>
);

const PricingCards = ({ goToAuth }: { goToAuth: (selectedPlanSlug?: string) => void }) => {
  const prices = ["R$ 97", "R$ 197", "R$ 397", "R$ 797"];
  const planFeatures = [
    ["WhatsApp centralizado", "Pipeline básico", "Templates de contrato", "Até 2 usuários"],
    ["Tudo do Basic", "Agente de IA jurídica", "Assinatura digital", "Automações ilimitadas", "Até 5 usuários"],
    ["Tudo do Pro", "Campanhas", "Dashboards completos", "Múltiplos pipelines", "Até 15 usuários"],
    ["Tudo do Scale", "Wizzy AI inclusa", "Suporte prioritário 24/7", "Usuários ilimitados", "Manager dedicado"],
  ];

  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
      {plans.map((plan, index) => (
        <div
          key={plan.name}
          className={`group relative flex min-h-[520px] flex-col overflow-hidden rounded-2xl border p-7 transition duration-300 hover:-translate-y-1 ${
            plan.featured
              ? "border-pink-400 bg-gradient-to-b from-pink-50 via-orange-50/50 to-white shadow-xl shadow-pink-500/10"
              : "border-slate-200 bg-white shadow-sm hover:border-slate-300 hover:shadow-md"
          }`}
        >
          {plan.featured && (
            <>
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-pink-500 to-orange-500" />
              <Badge className="absolute left-1/2 top-4 -translate-x-1/2 border-0 bg-gradient-to-r from-pink-500 to-orange-500 text-white shadow-lg shadow-pink-500/30">
                Mais escolhido
              </Badge>
            </>
          )}
          <div className={plan.featured ? "pt-8" : ""}>
            <h3 className="text-2xl font-bold uppercase tracking-wide text-slate-900">{plan.name}</h3>
            <p className="mt-3 min-h-[52px] text-sm leading-6 text-slate-600">{plan.audience}</p>
          </div>
          <div className="my-6">
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-black text-slate-900">{prices[index]}</span>
              <span className="text-sm text-slate-500">/mês</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">Cobrado mensalmente</p>
          </div>
          <div className="mb-6 h-px bg-slate-200" />
          <ul className="flex-1 space-y-3">
            {planFeatures[index].map((feature) => (
              <li key={feature} className="flex items-start gap-2 text-sm text-slate-700">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                {feature}
              </li>
            ))}
          </ul>
          <Button
            className={`mt-8 h-12 w-full ${
              plan.featured
                ? "border-0 bg-gradient-to-r from-pink-500 to-orange-500 text-white shadow-lg shadow-pink-500/25 hover:from-pink-600 hover:to-orange-600"
                : "bg-slate-900 text-white hover:bg-slate-800"
            }`}
            onClick={() => goToAuth(plan.slug)}
          >
            {plan.cta}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      ))}
    </div>
  );
};

const FinalCTA = ({ goToAuth }: { goToAuth: () => void }) => (
  <section className="relative overflow-hidden px-4 py-32 sm:px-6 lg:px-8">
    <div className="absolute inset-0 animate-gradient-shift bg-[linear-gradient(120deg,#db2777,#f97316,#ec4899,#fb923c)]" />
    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent,rgba(0,0,0,0.45))]" />
    <div className="absolute left-1/2 top-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 animate-aurora rounded-full bg-white/10 blur-3xl" />
    <div className="relative mx-auto max-w-5xl text-center">
      <Badge className="mb-6 border border-white/30 bg-white/15 text-white backdrop-blur">
        <Sparkles className="mr-2 h-3.5 w-3.5" />
        Comece hoje
      </Badge>
      <h2 className="text-4xl font-bold leading-[1.05] tracking-tight text-white sm:text-6xl lg:text-7xl">
        Pronto para parar de perder honorários no{" "}
        <span className="underline decoration-white/40 decoration-4 underline-offset-8">WhatsApp arquivado</span>?
      </h2>
      <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-white/90">
        A diferença entre o escritório que fecha 5 casos por mês e o que fecha 25 não é talento jurídico. É estrutura de captação.
      </p>
      <div className="mt-10 flex flex-col items-center gap-4">
        <Button size="lg" className="h-14 border-0 bg-white px-10 text-lg font-semibold text-slate-900 shadow-2xl shadow-black/20 transition hover:scale-105 hover:bg-white/90" onClick={() => goToAuth()}>
          Começar agora, é grátis
          <ArrowRight className="ml-2 h-5 w-5" />
        </Button>
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2">
            {["MC", "RO", "JS", "LF", "CM"].map((initials) => (
              <div key={initials} className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white/40 bg-white/20 text-[10px] font-bold text-white backdrop-blur">
                {initials}
              </div>
            ))}
          </div>
          <p className="text-sm text-white/90"><span className="font-bold text-white">2.400+</span> advogados já usam</p>
        </div>
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-white/80">
          {["7 dias grátis", "Sem cartão", "Cancele quando quiser"].map((item) => (
            <span key={item} className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-white" />
              {item}
            </span>
          ))}
        </div>
      </div>
    </div>
  </section>
);

export default LandingPage;
