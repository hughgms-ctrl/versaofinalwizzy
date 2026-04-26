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
  Sparkles, Globe, Lock, Workflow, Bell, Tag, Headphones,
  Briefcase, Stethoscope, Home, Scissors, GraduationCap,
  Building2, Quote, TrendingUp, Clock, Target, LayoutGrid,
  PhoneCall, Mic, Image as ImageIcon, BarChart, Link2,
  CheckCircle2, Filter, BookOpen, Megaphone
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

/* ============================================================
 * Wizzy — Landing Page (dark, gradientes magenta/coral)
 * Foco: prestadores de serviço (advogados, clínicas,
 * imobiliárias, estética, educação, agências…)
 * ============================================================ */

const niches = [
  { icon: Briefcase, label: "Advocacia" },
  { icon: Stethoscope, label: "Clínicas & Saúde" },
  { icon: Home, label: "Imobiliárias" },
  { icon: Scissors, label: "Estética" },
  { icon: GraduationCap, label: "Educação" },
  { icon: Building2, label: "Agências" },
];

const pains = [
  { icon: MessageSquare, title: "Leads perdidos no WhatsApp", desc: "Conversas espalhadas, sem follow-up, esfriando dia após dia." },
  { icon: Clock, title: "Resposta lenta demais", desc: "Cliente pergunta às 22h, você responde no dia seguinte — e ele já fechou com o concorrente." },
  { icon: LayoutGrid, title: "Pipeline na cabeça", desc: "Você não sabe quantos leads tem, em qual etapa, nem quem precisa de retorno hoje." },
  { icon: FileText, title: "Contratos manuais", desc: "Word, Drive, e-mail, assinatura física — uma novela para cada cliente novo." },
  { icon: BarChart, title: "Sem dados, sem decisão", desc: "Você não sabe qual canal traz mais clientes nem quanto vale cada lead." },
];

const flowSteps = [
  { n: "01", icon: Link2, title: "Capture leads", desc: "WhatsApp, formulários, quiz, link na bio — tudo entra direto no Wizzy.", color: "from-pink-500 to-rose-500" },
  { n: "02", icon: Filter, title: "Qualifique com IA", desc: "Agentes de IA atendem 24/7, qualificam o lead e organizam no pipeline certo.", color: "from-violet-500 to-purple-500" },
  { n: "03", icon: LayoutGrid, title: "Organize no funil", desc: "Kanban visual com etapas customizadas para sua área de atuação.", color: "from-blue-500 to-cyan-500" },
  { n: "04", icon: FileText, title: "Envie proposta/contrato", desc: "Documentos gerados automaticamente, com assinatura eletrônica nativa.", color: "from-emerald-500 to-teal-500" },
  { n: "05", icon: Calendar, title: "Agende e atenda", desc: "Agenda integrada ao Google Calendar e Meet — agendamento pelo WhatsApp.", color: "from-amber-500 to-orange-500" },
  { n: "06", icon: TrendingUp, title: "Meça e escale", desc: "Dashboards com conversão, receita por canal e desempenho de cada agente.", color: "from-fuchsia-500 to-pink-500" },
];

const features = [
  { icon: MessageSquare, title: "Atendimento centralizado", desc: "Todas as conversas do WhatsApp em uma única caixa de entrada, com fila, equipe e tags.", highlight: "DESTAQUE" },
  { icon: Bot, title: "Agentes de IA", desc: "Atendentes virtuais que respondem, qualificam, agendam e transferem para humano quando preciso.", highlight: "IA" },
  { icon: Workflow, title: "Fluxos automatizados", desc: "Construa automações visuais sem código — gatilhos, condições, mensagens, ações." },
  { icon: LayoutGrid, title: "Pipeline visual (CRM)", desc: "Funis ilimitados com colunas customizáveis. Mova leads com drag-and-drop." },
  { icon: FileText, title: "Documentos & Assinatura", desc: "Templates, packs, preenchimento por formulário e assinatura eletrônica avançada (Lei 14.063)." },
  { icon: Calendar, title: "Agendamento online", desc: "Página pública de agendamento com Google Calendar e link automático do Meet." },
  { icon: Megaphone, title: "Campanhas em massa", desc: "Disparos por tag ou seleção, com intervalo anti-bloqueio e mídia personalizada." },
  { icon: BookOpen, title: "Base de conhecimento", desc: "Cadastre informações da sua empresa para a IA puxar respostas precisas." },
  { icon: Bell, title: "Notificações em tempo real", desc: "Push no navegador para novos leads, pagamentos e tarefas — sem abrir o app." },
  { icon: Users, title: "Equipe & permissões", desc: "Múltiplos workspaces, papéis e permissões granulares por módulo." },
  { icon: BarChart3, title: "Dashboards completos", desc: "Conversão por etapa, receita por canal, desempenho por atendente, em tempo real.", highlight: "PRO" },
  { icon: Tag, title: "Tags & segmentação", desc: "Organize contatos com tags ilimitadas e dispare ações por segmento." },
];

const verticalPacks = [
  { icon: Briefcase, title: "Advocacia", items: ["Captação de leads jurídicos", "Triagem por área (cível, trabalhista, etc.)", "Contratos de honorários", "LGPD-friendly"] },
  { icon: Stethoscope, title: "Clínicas & Saúde", items: ["Pré-agendamento de consultas", "Confirmação automática", "Anamnese por formulário", "Lembretes 24h antes"] },
  { icon: Home, title: "Imobiliárias", items: ["Qualificação de comprador/locador", "Agendamento de visitas", "Envio de fichas de imóveis", "Proposta digital"] },
  { icon: Scissors, title: "Estética & Beleza", items: ["Agenda integrada", "Confirmação de horários", "Pacotes e fidelidade", "Recuperação de inativos"] },
];

const integrations = [
  { name: "WhatsApp", color: "from-green-500 to-emerald-500", initial: "W" },
  { name: "Google Calendar", color: "from-blue-500 to-cyan-500", initial: "G" },
  { name: "Google Meet", color: "from-emerald-500 to-teal-500", initial: "M" },
  { name: "Google Drive", color: "from-yellow-500 to-amber-500", initial: "D" },
  { name: "Asaas", color: "from-sky-500 to-blue-500", initial: "A" },
  { name: "OpenAI", color: "from-violet-500 to-purple-500", initial: "AI" },
];

const testimonials = [
  { name: "Dra. Marina Costa", role: "Advogada Trabalhista", initials: "MC", quote: "A IA do Wizzy faz a triagem inicial dos casos. Eu só entro na conversa quando o lead já está pronto. Triplicou meu fechamento.", color: "from-pink-500 to-rose-500" },
  { name: "Dr. Rafael Oliveira", role: "Clínica Odontológica", initials: "RO", quote: "Reduzi 70% das faltas com a confirmação automática. O agendamento pelo WhatsApp virou o coração da clínica.", color: "from-blue-500 to-cyan-500" },
  { name: "Juliana Santos", role: "Corretora de Imóveis", initials: "JS", quote: "Antes eu perdia visitas por não responder a tempo. Agora a IA agenda, confirma e me passa o lead já qualificado.", color: "from-violet-500 to-purple-500" },
  { name: "Lucas Ferreira", role: "Estúdio de Estética", initials: "LF", quote: "Os contratos com assinatura digital e a recuperação de clientes inativos pagaram a ferramenta no primeiro mês.", color: "from-emerald-500 to-teal-500" },
  { name: "Carla Mendes", role: "Escola de Idiomas", initials: "CM", quote: "Cadastrei as informações da escola na base de conhecimento e a IA responde dúvidas como se fosse um atendente treinado.", color: "from-amber-500 to-orange-500" },
  { name: "Pedro Almeida", role: "Agência de Marketing", initials: "PA", quote: "Gerencio 4 contas de clientes em workspaces separados. Cada uma com pipeline, equipe e relatórios próprios.", color: "from-fuchsia-500 to-pink-500" },
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
  "agents", "reports", "campaigns", "calendar", "ai"
];

const LandingPage = () => {
  const [isYearly, setIsYearly] = useState(false);
  const [activeMockup, setActiveMockup] = useState<"pipeline" | "chat" | "doc">("pipeline");
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
    // dark forçado nesta página, independente do tema do app
    <div className="dark min-h-screen bg-[#0b0b12] text-slate-100 antialiased overflow-x-hidden">
      {/* Decorative gradient blobs */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-pink-500/10 blur-3xl" />
        <div className="absolute top-1/3 -right-40 w-[600px] h-[600px] rounded-full bg-violet-500/10 blur-3xl" />
        <div className="absolute bottom-0 left-1/4 w-[600px] h-[600px] rounded-full bg-orange-500/5 blur-3xl" />
      </div>

      {/* ===================== HEADER ===================== */}
      <header className="border-b border-white/5 bg-[#0b0b12]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center shadow-lg shadow-pink-500/30">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight">Wizzy</span>
          </div>
          <nav className="hidden md:flex items-center gap-7 text-sm text-slate-400">
            <a href="#features" className="hover:text-white transition-colors">Funcionalidades</a>
            <a href="#fluxo" className="hover:text-white transition-colors">Como funciona</a>
            <a href="#nichos" className="hover:text-white transition-colors">Para quem</a>
            <a href="#pricing" className="hover:text-white transition-colors">Planos</a>
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" className="text-slate-300 hover:text-white hover:bg-white/5" onClick={() => navigate("/auth")}>
              Entrar
            </Button>
            <Button
              className="bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white shadow-lg shadow-pink-500/30 border-0"
              onClick={() => navigate("/auth")}
            >
              Começar grátis
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      </header>

      {/* ===================== HERO ===================== */}
      <section className="relative pt-20 sm:pt-28 pb-16 px-4">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-pink-500/30 bg-pink-500/10 text-pink-300 text-xs font-medium mb-7">
            <Sparkles className="w-3.5 h-3.5" />
            Plataforma completa de atendimento, CRM e IA para WhatsApp
          </div>

          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.05]">
            Transforme seu WhatsApp em uma{" "}
            <span className="bg-gradient-to-r from-pink-400 via-rose-400 to-orange-400 bg-clip-text text-transparent">
              máquina de fechar clientes
            </span>
          </h1>

          <p className="mt-7 text-lg sm:text-xl text-slate-400 max-w-3xl mx-auto leading-relaxed">
            Atenda 24/7 com IA, organize leads em um pipeline visual, gere contratos com assinatura digital
            e meça tudo em tempo real — feito para advogados, clínicas, imobiliárias, estética e quem vive
            de prestar serviço.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              size="lg"
              className="text-base px-8 h-12 bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white shadow-xl shadow-pink-500/30 border-0"
              onClick={() => navigate("/auth")}
            >
              Começar agora — é grátis
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="text-base px-8 h-12 border-white/15 bg-white/5 text-slate-200 hover:bg-white/10 hover:text-white"
              onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })}
            >
              Ver planos
            </Button>
          </div>

          <div className="mt-6 flex items-center justify-center gap-6 text-xs text-slate-500">
            <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> 7 dias grátis</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Sem cartão</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Cancela quando quiser</span>
          </div>

          {/* ============== Mockup tabs ============== */}
          <div className="mt-16">
            <div className="inline-flex items-center gap-2 p-1.5 rounded-full bg-white/5 border border-white/10">
              {[
                { k: "pipeline", icon: LayoutGrid, label: "Pipeline" },
                { k: "chat", icon: MessageSquare, label: "Atendimento + IA" },
                { k: "doc", icon: FileText, label: "Documentos" },
              ].map((t) => (
                <button
                  key={t.k}
                  onClick={() => setActiveMockup(t.k as typeof activeMockup)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                    activeMockup === t.k
                      ? "bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-lg shadow-pink-500/30"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <t.icon className="w-4 h-4" />
                  {t.label}
                </button>
              ))}
            </div>

            <div className="mt-8 max-w-6xl mx-auto rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] shadow-2xl shadow-black/40 overflow-hidden">
              {/* fake window chrome */}
              <div className="flex items-center gap-2 px-4 h-10 border-b border-white/5 bg-white/[0.02]">
                <span className="w-3 h-3 rounded-full bg-rose-500/80" />
                <span className="w-3 h-3 rounded-full bg-amber-400/80" />
                <span className="w-3 h-3 rounded-full bg-emerald-500/80" />
                <span className="ml-3 text-xs text-slate-500">Wizzy — {activeMockup === "pipeline" ? "Pipeline" : activeMockup === "chat" ? "Conversas" : "Documentos"}</span>
              </div>

              {activeMockup === "pipeline" && <PipelineMockup />}
              {activeMockup === "chat" && <ChatMockup />}
              {activeMockup === "doc" && <DocMockup />}
            </div>
          </div>
        </div>
      </section>

      {/* ===================== NICHOS ===================== */}
      <section id="nichos" className="py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <p className="text-center text-xs uppercase tracking-[0.2em] text-slate-500 mb-6">
            Feito para prestadores de serviço
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {niches.map((n) => (
              <div
                key={n.label}
                className="flex flex-col items-center justify-center gap-2 py-5 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] hover:border-pink-500/20 transition-all"
              >
                <n.icon className="w-6 h-6 text-pink-400" />
                <span className="text-sm text-slate-300">{n.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== DOR ===================== */}
      <section className="py-24 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-3xl mx-auto">
            <h2 className="text-3xl sm:text-5xl font-bold leading-tight">
              Profissionais perdem clientes <br className="hidden sm:block" />
              por <span className="text-rose-400">falta de organização</span>
            </h2>
            <p className="mt-5 text-slate-400 text-lg">
              Se você presta serviços, provavelmente já passou por isso:
            </p>
          </div>

          <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {pains.map((p) => (
              <div
                key={p.title}
                className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 hover:border-rose-500/20 hover:bg-white/[0.04] transition-all"
              >
                <div className="w-11 h-11 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mb-4">
                  <p.icon className="w-5 h-5 text-rose-400" />
                </div>
                <h3 className="font-semibold text-white text-sm">{p.title}</h3>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>

          <p className="mt-12 text-center text-slate-300">
            Gerenciar tudo no improviso custa caro. <span className="text-white font-semibold">O Wizzy centraliza tudo em um só sistema.</span>
          </p>
        </div>
      </section>

      {/* ===================== FLUXO 6 PASSOS ===================== */}
      <section id="fluxo" className="py-24 px-4 border-y border-white/5 bg-white/[0.015]">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl sm:text-5xl font-bold leading-tight">
              Um fluxo simples para gerenciar{" "}
              <span className="bg-gradient-to-r from-pink-400 via-violet-400 to-emerald-400 bg-clip-text text-transparent">
                todo o seu negócio
              </span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
            {flowSteps.map((s) => (
              <div key={s.n} className="relative group">
                <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 h-full hover:border-white/15 transition-all">
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${s.color} flex items-center justify-center mb-4 shadow-lg`}>
                    <s.icon className="w-7 h-7 text-white" />
                  </div>
                  <span className="text-xs text-slate-500 font-mono">PASSO {s.n}</span>
                  <h3 className="font-semibold text-white mt-1">{s.title}</h3>
                  <p className="text-sm text-slate-400 mt-2 leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== FEATURES GRID ===================== */}
      <section id="features" className="py-24 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <Badge className="mb-5 bg-pink-500/10 text-pink-300 border border-pink-500/30 hover:bg-pink-500/15">
              POR QUE ESCOLHER O WIZZY?
            </Badge>
            <h2 className="text-3xl sm:text-5xl font-bold leading-tight">
              Tudo para gerenciar seu negócio,{" "}
              <span className="bg-gradient-to-r from-pink-400 to-rose-400 bg-clip-text text-transparent">
                em um só lugar
              </span>
            </h2>
            <p className="mt-5 text-slate-400 text-lg">
              12 funcionalidades que mudam a forma como você atende e vende
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((f, i) => (
              <div
                key={f.title}
                className={`relative rounded-2xl border p-6 transition-all hover:-translate-y-0.5 ${
                  i === 0
                    ? "border-emerald-500/30 bg-gradient-to-br from-emerald-500/[0.07] to-transparent hover:border-emerald-500/50"
                    : i === 1
                    ? "border-violet-500/30 bg-gradient-to-br from-violet-500/[0.07] to-transparent hover:border-violet-500/50"
                    : "border-white/5 bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]"
                }`}
              >
                {f.highlight && (
                  <span className={`absolute top-4 right-4 text-[10px] font-bold px-2 py-1 rounded-full ${
                    f.highlight === "DESTAQUE" ? "bg-emerald-500 text-emerald-950" :
                    f.highlight === "IA" ? "bg-violet-500 text-violet-950" :
                    "bg-amber-500 text-amber-950"
                  }`}>
                    {f.highlight}
                  </span>
                )}
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 ${
                  i === 0 ? "bg-gradient-to-br from-emerald-500 to-teal-500" :
                  i === 1 ? "bg-gradient-to-br from-violet-500 to-purple-500" :
                  "bg-gradient-to-br from-pink-500 to-rose-500"
                }`}>
                  <f.icon className="w-5 h-5 text-white" />
                </div>
                <h3 className="font-semibold text-white">{f.title}</h3>
                <p className="text-sm text-slate-400 mt-2 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== PACOTES VERTICAIS ===================== */}
      <section className="py-24 px-4 border-y border-white/5 bg-white/[0.015]">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <h2 className="text-3xl sm:text-5xl font-bold leading-tight">
              Pacotes prontos para{" "}
              <span className="bg-gradient-to-r from-pink-400 to-orange-400 bg-clip-text text-transparent">
                sua área de atuação
              </span>
            </h2>
            <p className="mt-5 text-slate-400 text-lg">
              Ative em 1 clique. Pipeline, fluxos, agentes de IA e templates já configurados.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {verticalPacks.map((p) => (
              <div key={p.title} className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-6">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center mb-4">
                  <p.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="font-semibold text-white text-lg">{p.title}</h3>
                <ul className="mt-4 space-y-2">
                  {p.items.map((it) => (
                    <li key={it} className="flex items-start gap-2 text-sm text-slate-400">
                      <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{it}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== COMPARATIVO ===================== */}
      <section className="py-24 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl sm:text-5xl font-bold text-center leading-tight">
            <span className="text-slate-300">Planilhas & WhatsApp solto</span>{" "}
            <span className="text-rose-400">vs</span>{" "}
            <span className="bg-gradient-to-r from-pink-400 to-rose-400 bg-clip-text text-transparent">Wizzy</span>
          </h2>

          <div className="mt-12 rounded-2xl border border-white/10 overflow-hidden">
            <div className="grid grid-cols-2">
              <div className="px-6 py-4 bg-white/[0.03] border-r border-white/10 text-slate-400 font-medium">
                Como você faz hoje
              </div>
              <div className="px-6 py-4 bg-gradient-to-r from-pink-500/10 to-rose-500/10 font-medium text-pink-300">
                ⚡ Com Wizzy
              </div>
            </div>
            {[
              ["Leads perdidos no WhatsApp", "Pipeline organizado com etapas claras"],
              ["Resposta manual e lenta", "IA respondendo 24/7, com sua voz"],
              ["Contratos por e-mail e Word", "Documentos com assinatura digital nativa"],
              ["Agendamento por mensagem", "Página pública + Google Calendar/Meet"],
              ["Sem visão de conversão", "Dashboards de funil e desempenho"],
              ["Relatórios manuais no fim do mês", "Métricas em tempo real, automatizadas"],
            ].map(([before, after], i) => (
              <div key={i} className="grid grid-cols-2 border-t border-white/5">
                <div className="px-6 py-4 border-r border-white/5 flex items-center gap-2 text-slate-400">
                  <X className="w-4 h-4 text-rose-400 shrink-0" />
                  <span className="text-sm">{before}</span>
                </div>
                <div className="px-6 py-4 flex items-center gap-2 text-slate-200">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-sm">{after}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== INTEGRAÇÕES ===================== */}
      <section className="py-24 px-4 border-y border-white/5 bg-white/[0.015]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <Badge className="mb-5 bg-pink-500/10 text-pink-300 border border-pink-500/30 hover:bg-pink-500/15">
              ● Integrações disponíveis
            </Badge>
            <h2 className="text-3xl sm:text-5xl font-bold leading-tight">
              Conecte com suas{" "}
              <span className="bg-gradient-to-r from-pink-400 to-rose-400 bg-clip-text text-transparent">
                ferramentas favoritas
              </span>
            </h2>
            <p className="mt-5 text-slate-400 text-lg">
              Automatize processos e economize tempo com integrações nativas
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {integrations.map((i) => (
              <div
                key={i.name}
                className="flex flex-col items-center gap-3 py-6 rounded-2xl border border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05] transition-all"
              >
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${i.color} flex items-center justify-center text-white font-bold`}>
                  {i.initial}
                </div>
                <span className="text-sm text-slate-300 text-center">{i.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== NOTIFICAÇÕES ===================== */}
      <section className="py-24 px-4">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <Badge className="mb-5 bg-pink-500/10 text-pink-300 border border-pink-500/30 hover:bg-pink-500/15">
              <Bell className="w-3 h-3 mr-1.5" />
              Notificações em tempo real
            </Badge>
            <h2 className="text-3xl sm:text-5xl font-bold leading-tight">
              Fique por dentro de{" "}
              <span className="bg-gradient-to-r from-pink-400 to-rose-400 bg-clip-text text-transparent">
                tudo que acontece
              </span>
            </h2>
            <p className="mt-5 text-slate-400 text-lg leading-relaxed">
              Receba alertas instantâneos sobre novos leads, mensagens, agendamentos e tarefas
              — direto no navegador, sem precisar abrir o app.
            </p>
            <ul className="mt-7 space-y-3">
              {[
                "Push no navegador",
                "Alertas de novos leads em tempo real",
                "Avisos de mensagens não lidas",
                "Lembretes de agendamentos e tarefas",
              ].map((it) => (
                <li key={it} className="flex items-center gap-3 text-slate-300">
                  <CheckCircle2 className="w-5 h-5 text-pink-400 shrink-0" />
                  <span>{it}</span>
                </li>
              ))}
            </ul>
          </div>

          <NotificationsMockup />
        </div>
      </section>

      {/* ===================== DEPOIMENTOS ===================== */}
      <section className="py-24 px-4 border-y border-white/5 bg-white/[0.015]">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <Badge className="mb-5 bg-pink-500/10 text-pink-300 border border-pink-500/30 hover:bg-pink-500/15">
              <Star className="w-3 h-3 mr-1.5 fill-current" />
              Amado por profissionais
            </Badge>
            <h2 className="text-3xl sm:text-5xl font-bold leading-tight">
              Quem usa,{" "}
              <span className="bg-gradient-to-r from-pink-400 to-rose-400 bg-clip-text text-transparent">
                recomenda
              </span>
            </h2>
            <p className="mt-5 text-slate-400 text-lg">
              Veja o que advogados, clínicas, corretores e agências estão dizendo sobre o Wizzy
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {testimonials.map((t) => (
              <div key={t.name} className="relative rounded-2xl border border-white/10 bg-white/[0.03] p-6 hover:bg-white/[0.05] transition-all">
                <Quote className="absolute top-5 right-5 w-5 h-5 text-pink-500/40" />
                <div className="flex items-center gap-1 mb-4">
                  {[1,2,3,4,5].map((i) => (
                    <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="text-slate-300 text-sm leading-relaxed">"{t.quote}"</p>
                <div className="mt-5 flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${t.color} flex items-center justify-center text-white text-xs font-bold`}>
                    {t.initials}
                  </div>
                  <div>
                    <p className="font-semibold text-white text-sm">{t.name}</p>
                    <p className="text-xs text-slate-500">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-14 grid grid-cols-3 gap-6 max-w-2xl mx-auto text-center">
            <div>
              <p className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-pink-400 to-rose-400 bg-clip-text text-transparent">2.400+</p>
              <p className="text-xs text-slate-500 mt-1">Profissionais ativos</p>
            </div>
            <div>
              <p className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">+340%</p>
              <p className="text-xs text-slate-500 mt-1">Aumento médio de fechamento</p>
            </div>
            <div>
              <p className="text-3xl sm:text-4xl font-bold text-white">4.9/5</p>
              <p className="text-xs text-slate-500 mt-1">Avaliação média</p>
            </div>
          </div>
        </div>
      </section>

      {/* ===================== PRICING ===================== */}
      <section id="pricing" className="py-24 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <h2 className="text-3xl sm:text-5xl font-bold leading-tight">
              Escolha o plano{" "}
              <span className="bg-gradient-to-r from-pink-400 to-rose-400 bg-clip-text text-transparent">
                ideal para você
              </span>
            </h2>
            <p className="mt-5 text-slate-400 text-lg">
              Comece pequeno e escale conforme seu crescimento
            </p>
            <div className="flex items-center justify-center gap-3 mt-8">
              <span className={`text-sm font-medium ${!isYearly ? 'text-white' : 'text-slate-500'}`}>Mensal</span>
              <Switch checked={isYearly} onCheckedChange={setIsYearly} />
              <span className={`text-sm font-medium ${isYearly ? 'text-white' : 'text-slate-500'}`}>Anual</span>
              {isYearly && (
                <Badge className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  Economize 2 meses
                </Badge>
              )}
            </div>
          </div>

          {plansLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-[500px] rounded-2xl bg-white/5" />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
              {(plans || []).map((plan: any) => {
                const modules: string[] = plan.allowed_modules || [];
                const isPro = plan.slug === 'pro';
                const priceYearly = plan.price_yearly || plan.price_monthly * 10;

                return (
                  <div
                    key={plan.id}
                    className={`relative rounded-2xl p-8 flex flex-col ${
                      isPro
                        ? 'bg-gradient-to-b from-pink-500/[0.12] to-rose-500/[0.04] border-2 border-pink-500/40 shadow-2xl shadow-pink-500/20 lg:scale-[1.03]'
                        : 'bg-white/[0.03] border border-white/10'
                    }`}
                  >
                    {isPro && (
                      <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                        <Badge className="bg-gradient-to-r from-pink-500 to-rose-500 text-white px-4 py-1 border-0 shadow-lg shadow-pink-500/30">
                          ⭐ Mais popular
                        </Badge>
                      </div>
                    )}
                    <h3 className="text-2xl font-bold text-white">{plan.name}</h3>
                    <p className="text-sm text-slate-400 mt-1 min-h-[20px]">{plan.description || ''}</p>
                    <div className="mt-6">
                      <div className="flex items-baseline gap-1">
                        <span className="text-5xl font-bold text-white">
                          R$ {isYearly ? Math.round(priceYearly / 12) : plan.price_monthly}
                        </span>
                        <span className="text-slate-500">/mês</span>
                      </div>
                      {isYearly && (
                        <p className="text-xs text-slate-500 mt-1">
                          Cobrado R$ {priceYearly.toLocaleString('pt-BR')}/ano
                        </p>
                      )}
                    </div>

                    <Button
                      className={`mt-6 w-full h-11 ${
                        isPro
                          ? "bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white border-0 shadow-lg shadow-pink-500/30"
                          : "bg-white/10 hover:bg-white/15 text-white border border-white/15"
                      }`}
                      onClick={() => navigate("/auth")}
                    >
                      Começar agora
                    </Button>

                    <div className="mt-8 space-y-1">
                      <p className="text-sm font-medium text-slate-300 mb-3">Inclui:</p>
                      <div className="flex items-center gap-2 text-sm text-slate-300 py-1.5">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>Até {plan.max_team_members} membros</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-slate-300 py-1.5">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>{formatStorage(plan.storage_limit_bytes)} de armazenamento</span>
                      </div>
                      {visibleModules.map((mod) => {
                        const has = modules.includes(mod);
                        return (
                          <div key={mod} className={`flex items-center gap-2 text-sm py-1.5 ${has ? 'text-slate-300' : 'text-slate-600'}`}>
                            {has ? <Check className="w-4 h-4 text-emerald-400 shrink-0" /> : <X className="w-4 h-4 shrink-0" />}
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

      {/* ===================== SEGURANÇA ===================== */}
      <section className="py-20 px-4 border-y border-white/5 bg-white/[0.015]">
        <div className="max-w-4xl mx-auto text-center">
          <div className="flex items-center justify-center gap-4 mb-6">
            <div className="w-12 h-12 rounded-xl bg-pink-500/10 border border-pink-500/30 flex items-center justify-center">
              <Shield className="w-6 h-6 text-pink-400" />
            </div>
            <div className="w-12 h-12 rounded-xl bg-pink-500/10 border border-pink-500/30 flex items-center justify-center">
              <Lock className="w-6 h-6 text-pink-400" />
            </div>
            <div className="w-12 h-12 rounded-xl bg-pink-500/10 border border-pink-500/30 flex items-center justify-center">
              <Globe className="w-6 h-6 text-pink-400" />
            </div>
          </div>
          <h3 className="text-2xl sm:text-3xl font-bold text-white">Segurança de nível empresarial</h3>
          <p className="mt-4 text-slate-400 max-w-xl mx-auto">
            Criptografia ponta-a-ponta, isolamento multi-tenant, RLS no banco e LGPD-friendly.
            Seus dados e os dos seus clientes, em segurança.
          </p>
        </div>
      </section>

      {/* ===================== CTA FINAL ===================== */}
      <section className="py-28 px-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-pink-500/20 via-rose-500/10 to-orange-500/20" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(236,72,153,0.15),transparent_70%)]" />
        <div className="relative max-w-3xl mx-auto text-center">
          <h2 className="text-3xl sm:text-5xl font-bold text-white leading-tight">
            Pronto para parar de perder clientes?
          </h2>
          <p className="mt-5 text-slate-300 text-lg">
            Crie sua conta em menos de 2 minutos. Sem cartão. Sem compromisso.
          </p>
          <Button
            size="lg"
            className="mt-9 h-14 text-base px-10 bg-white text-slate-900 hover:bg-slate-100 border-0 shadow-2xl"
            onClick={() => navigate("/auth")}
          >
            Começar agora — é grátis
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
          <p className="mt-5 text-xs text-slate-400">
            7 dias grátis • Cancele quando quiser
          </p>
        </div>
      </section>

      {/* ===================== FOOTER ===================== */}
      <footer className="py-10 px-4 border-t border-white/5">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-white">Wizzy</span>
          </div>
          <p className="text-sm text-slate-500">
            © {new Date().getFullYear()} Wizzy. Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
};

/* ============================================================
 * MOCKUPS — pequenos componentes ilustrativos da UI do produto
 * ============================================================ */

const PipelineMockup = () => {
  const cols = [
    { name: "Novo Lead", color: "bg-pink-500", count: 2, cards: [
      { name: "Maria Oliveira", sub: "Divórcio consensual", tag: "Cível", price: "R$ 3.500" },
      { name: "Carla Dias", sub: "Consulta inicial", tag: "Trabalhista", price: "R$ 4.500" },
    ]},
    { name: "Em Contato", color: "bg-orange-400", count: 2, cards: [
      { name: "João Santos", sub: "Inventário", tag: "Família", price: "R$ 8.000" },
      { name: "Lucas Ferreira", sub: "Revisão de contrato", tag: "Empresarial", price: "R$ 5.000" },
    ]},
    { name: "Proposta Enviada", color: "bg-cyan-400", count: 1, cards: [
      { name: "Ana Costa", sub: "Assessoria mensal", tag: "Recorrente", price: "R$ 2.200/mês" },
    ]},
    { name: "Fechado", color: "bg-emerald-500", count: 1, cards: [
      { name: "Pedro Lima", sub: "Contrato assinado", tag: "Premium", price: "R$ 12.000" },
    ]},
  ];
  return (
    <div className="p-5 text-left">
      <div className="flex items-center gap-4 text-xs text-emerald-400 mb-4">
        <span className="flex items-center gap-1.5"><Bell className="w-3.5 h-3.5" /> Novo lead — Maria Oliveira</span>
        <span className="flex items-center gap-1.5"><MessageSquare className="w-3.5 h-3.5" /> WhatsApp enviado</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {cols.map((c) => (
          <div key={c.name}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${c.color}`} />
                <span className="text-xs font-semibold text-slate-200">{c.name}</span>
              </div>
              <span className="text-[10px] text-slate-500 bg-white/5 px-1.5 py-0.5 rounded-full">{c.count}</span>
            </div>
            <div className="space-y-2">
              {c.cards.map((card) => (
                <div key={card.name} className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
                  <p className="text-xs font-semibold text-white">{card.name}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{card.sub}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[11px] font-semibold text-pink-400">{card.price}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-pink-500/15 text-pink-300">{card.tag}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const ChatMockup = () => (
  <div className="p-5 text-left grid sm:grid-cols-3 gap-4 h-[420px]">
    <div className="hidden sm:block rounded-xl border border-white/10 bg-white/[0.02] p-3 overflow-hidden">
      <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Conversas</p>
      {["Maria Oliveira","João Santos","Ana Costa","Pedro Lima","Carla Dias"].map((n,i) => (
        <div key={n} className={`flex items-center gap-2 p-2 rounded-lg ${i===0?"bg-pink-500/10 border border-pink-500/20":""}`}>
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 text-[10px] flex items-center justify-center text-white font-bold">{n.split(' ').map(x=>x[0]).join('')}</div>
          <div className="min-w-0">
            <p className="text-xs text-white truncate">{n}</p>
            <p className="text-[10px] text-slate-500 truncate">{i===0?"Quero saber sobre…":"Obrigado!"}</p>
          </div>
        </div>
      ))}
    </div>
    <div className="sm:col-span-2 rounded-xl border border-white/10 bg-white/[0.02] p-4 flex flex-col">
      <div className="flex items-center gap-2 pb-3 border-b border-white/5">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 text-xs flex items-center justify-center text-white font-bold">MO</div>
        <div>
          <p className="text-sm font-semibold text-white">Maria Oliveira</p>
          <p className="text-[10px] text-emerald-400 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />online</p>
        </div>
        <Badge className="ml-auto bg-violet-500/15 text-violet-300 border border-violet-500/30 text-[10px]">
          <Bot className="w-3 h-3 mr-1" /> IA atendendo
        </Badge>
      </div>
      <div className="flex-1 overflow-y-auto py-3 space-y-2 text-sm">
        <div className="max-w-[75%] rounded-2xl rounded-bl-sm bg-white/[0.06] px-3 py-2 text-slate-200">
          Olá! Preciso de ajuda com um divórcio consensual.
        </div>
        <div className="ml-auto max-w-[75%] rounded-2xl rounded-br-sm bg-gradient-to-br from-pink-500 to-rose-500 px-3 py-2 text-white">
          Olá Maria! Que bom ter você aqui. Posso te ajudar a marcar uma consulta inicial. Vocês já estão de acordo sobre os termos?
        </div>
        <div className="max-w-[75%] rounded-2xl rounded-bl-sm bg-white/[0.06] px-3 py-2 text-slate-200">
          Sim, já temos acordo verbal. Quero formalizar.
        </div>
        <div className="ml-auto max-w-[75%] rounded-2xl rounded-br-sm bg-gradient-to-br from-pink-500 to-rose-500 px-3 py-2 text-white">
          Perfeito! Tenho horário amanhã às 14h ou 16h. Qual prefere?
        </div>
      </div>
      <div className="rounded-xl bg-white/5 px-3 py-2 text-xs text-slate-500">Digite uma mensagem…</div>
    </div>
  </div>
);

const DocMockup = () => (
  <div className="p-5 text-left grid sm:grid-cols-2 gap-4">
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
      <div className="flex items-center gap-2 mb-4">
        <FileText className="w-5 h-5 text-pink-400" />
        <p className="text-sm font-semibold text-white">Contrato de Honorários</p>
        <Badge className="ml-auto bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px]">Aguardando assinatura</Badge>
      </div>
      <div className="space-y-2 text-xs text-slate-400">
        <div className="h-2 rounded bg-white/10 w-full" />
        <div className="h-2 rounded bg-white/10 w-11/12" />
        <div className="h-2 rounded bg-white/10 w-10/12" />
        <div className="h-2 rounded bg-white/10 w-full" />
        <div className="h-2 rounded bg-white/10 w-9/12" />
        <div className="h-2 rounded bg-white/10 w-11/12" />
      </div>
      <div className="mt-5 p-3 rounded-lg border border-dashed border-pink-500/30 bg-pink-500/5 text-center">
        <p className="text-[11px] text-pink-300">✍️ Assinar com OTP via WhatsApp</p>
      </div>
    </div>
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
      <p className="text-xs uppercase tracking-wider text-slate-500 mb-3">Status do envio</p>
      {[
        { label: "Documento gerado", done: true },
        { label: "Enviado para o cliente", done: true },
        { label: "Cliente abriu o link", done: true },
        { label: "OTP confirmado", done: false },
        { label: "Assinado e arquivado", done: false },
      ].map((s) => (
        <div key={s.label} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
          {s.done ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          ) : (
            <div className="w-4 h-4 rounded-full border border-slate-600" />
          )}
          <span className={`text-xs ${s.done ? "text-slate-200" : "text-slate-500"}`}>{s.label}</span>
        </div>
      ))}
      <div className="mt-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 flex items-center gap-2">
        <Shield className="w-4 h-4" /> Assinatura conforme Lei 14.063/2020
      </div>
    </div>
  </div>
);

const NotificationsMockup = () => (
  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-2xl shadow-black/40">
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <Bell className="w-4 h-4 text-pink-400" />
        <span className="font-semibold text-white text-sm">Notificações</span>
      </div>
      <span className="text-xs text-slate-500">Hoje</span>
    </div>
    {[
      { icon: Users, color: "from-pink-500 to-rose-500", title: "Novo lead recebido", sub: "João Silva preencheu o formulário", time: "Agora" },
      { icon: MessageSquare, color: "from-emerald-500 to-teal-500", title: "Nova mensagem", sub: "Maria Oliveira respondeu sua proposta", time: "2 min" },
      { icon: FileText, color: "from-violet-500 to-purple-500", title: "Contrato assinado", sub: "Pedro Lima assinou o contrato de honorários", time: "5 min" },
      { icon: Calendar, color: "from-blue-500 to-cyan-500", title: "Reunião confirmada", sub: "Amanhã às 14h — Carlos Mendes", time: "10 min" },
      { icon: CheckCircle2, color: "from-amber-500 to-orange-500", title: "Tarefa concluída", sub: "Equipe finalizou a triagem do caso #142", time: "15 min" },
    ].map((n, i) => (
      <div key={i} className="flex items-start gap-3 py-3 border-t border-white/5 first:border-0">
        <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${n.color} flex items-center justify-center shrink-0`}>
          <n.icon className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-white truncate">{n.title}</p>
            <span className="text-[10px] text-slate-500 shrink-0">{n.time}</span>
          </div>
          <p className="text-xs text-slate-400 truncate">{n.sub}</p>
        </div>
      </div>
    ))}
  </div>
);

export default LandingPage;
