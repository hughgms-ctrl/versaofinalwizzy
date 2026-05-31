import { Link, Navigate } from "react-router-dom";
import { Button } from "@/fluzz/components/ui/button";
import { Card, CardContent } from "@/fluzz/components/ui/card";
import logoFluzz from "@/fluzz/assets/logo-fluzz.png";
import { useAuth } from "@/fluzz/contexts/AuthContext";
import { 
  CheckCircle2, 
  Users, 
  BarChart3, 
  FileText, 
  Calendar, 
  ArrowRight,
  Zap,
  Shield,
  Clock,
  Target,
  Layers,
  TrendingUp
} from "lucide-react";

const features = [
  {
    icon: Users,
    title: "Gestão de Equipes",
    description: "Organize sua equipe com cargos, setores e permissões personalizadas. Cada membro no lugar certo."
  },
  {
    icon: Target,
    title: "Projetos & Tarefas",
    description: "Gerencie projetos com quadros Kanban, tarefas recorrentes e acompanhamento em tempo real."
  },
  {
    icon: FileText,
    title: "POPs Documentados",
    description: "Documente todos os procedimentos da empresa com editor rico, imagens e vídeos integrados."
  },
  {
    icon: Calendar,
    title: "Rotinas Automatizadas",
    description: "Crie rotinas recorrentes que geram tarefas automaticamente para sua equipe."
  },
  {
    icon: BarChart3,
    title: "Analytics Completo",
    description: "Dashboards e métricas para acompanhar o desempenho de projetos e colaboradores."
  },
  {
    icon: Layers,
    title: "Briefing & Debriefing",
    description: "Planeje eventos com briefings detalhados e analise resultados com KPIs automáticos."
  }
];

const benefits = [
  {
    icon: Zap,
    title: "Aumente a Produtividade",
    description: "Reduza reuniões desnecessárias e centralize toda comunicação em um só lugar."
  },
  {
    icon: Shield,
    title: "Segurança Total",
    description: "Controle de acesso por níveis, permissões granulares e dados protegidos."
  },
  {
    icon: Clock,
    title: "Economize Tempo",
    description: "Automatize tarefas repetitivas e foque no que realmente importa."
  },
  {
    icon: TrendingUp,
    title: "Escale seu Negócio",
    description: "Do pequeno time à grande empresa, o Fluzz cresce junto com você."
  }
];

export default function Landing() {
  const { user, loading } = useAuth();

  // Redirect authenticated users to my-tasks
  if (!loading && user) {
    return <Navigate to="/tools/wizzy-flow/my-tasks" replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* iOS Safe Area Cover (evita ver conteúdo atrás da barra do iPhone) */}
      <div
        className="fixed top-0 left-0 right-0 z-[60] bg-primary"
        style={{ height: "env(safe-area-inset-top, 0px)" }}
      />

      {/* Header */}
      <header
        className="fixed left-0 right-0 z-50 bg-background border-b border-border"
        style={{ top: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <img src={logoFluzz} alt="Fluzz" className="h-10 w-10 object-contain" />
              <span className="text-xl font-bold text-primary">Fluzz</span>
            </div>
            <div className="flex items-center gap-4">
              <Link to="/tools/wizzy-flow/auth">
                <Button variant="ghost">Entrar</Button>
              </Link>
              <Link to="/tools/wizzy-flow/auth">
                <Button className="bg-primary hover:bg-primary/90">
                  Começar Grátis
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-6">
            <Zap size={16} />
            Simplifique a gestão da sua empresa
          </div>
          
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground leading-tight mb-6">
            Transforme o caos em{" "}
            <span className="text-primary">resultados</span>
          </h1>
          
          <p className="text-lg sm:text-xl text-muted-foreground max-w-3xl mx-auto mb-10">
            Fluzz é a plataforma completa para gerenciar equipes, projetos e POPs. 
            Tenha visibilidade total do seu negócio e libere o potencial da sua equipe.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/tools/wizzy-flow/auth">
              <Button size="lg" className="bg-primary hover:bg-primary/90 text-lg px-8 py-6 h-auto">
                Começar Agora
                <ArrowRight className="ml-2" size={20} />
              </Button>
            </Link>
            <a href="#features">
              <Button size="lg" variant="outline" className="text-lg px-8 py-6 h-auto">
                Ver Recursos
              </Button>
            </a>
          </div>

          {/* Stats */}
          <div className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { value: "10x", label: "Mais produtividade" },
              { value: "100%", label: "Visibilidade" },
              { value: "50%", label: "Menos reuniões" },
              { value: "24/7", label: "Disponível" }
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-3xl sm:text-4xl font-bold text-primary">{stat.value}</div>
                <div className="text-sm text-muted-foreground mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 bg-muted/30">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Tudo que você precisa em um só lugar
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Ferramentas poderosas para transformar a forma como sua equipe trabalha
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <Card key={feature.title} className="border-border hover:border-primary/50 transition-colors group">
                <CardContent className="p-6">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                    <feature.icon className="text-primary" size={24} />
                  </div>
                  <h3 className="text-xl font-semibold text-foreground mb-2">{feature.title}</h3>
                  <p className="text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-6">
                Por que escolher o Fluzz?
              </h2>
              <p className="text-lg text-muted-foreground mb-8">
                Desenvolvido pensando na realidade de empresas brasileiras, 
                o Fluzz une simplicidade e poder para você focar no crescimento.
              </p>
              
              <div className="space-y-6">
                {benefits.map((benefit) => (
                  <div key={benefit.title} className="flex gap-4">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <benefit.icon className="text-primary" size={20} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground mb-1">{benefit.title}</h3>
                      <p className="text-muted-foreground text-sm">{benefit.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="bg-gradient-to-br from-primary/20 to-primary/5 rounded-2xl p-8 border border-primary/20">
                <div className="space-y-4">
                  {[
                    "Gestão completa de projetos",
                    "Tarefas e rotinas recorrentes",
                    "Documentação de POPs",
                    "Controle de permissões",
                    "Analytics e relatórios",
                    "Briefings de eventos",
                    "Gestão de inventário",
                    "Notificações em tempo real"
                  ].map((item) => (
                    <div key={item} className="flex items-center gap-3">
                      <CheckCircle2 className="text-primary" size={20} />
                      <span className="text-foreground">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-primary">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-primary-foreground mb-6">
            Pronto para transformar sua gestão?
          </h2>
          <p className="text-lg text-primary-foreground/80 mb-10">
            Junte-se a empresas que já descobriram uma forma mais inteligente de trabalhar.
          </p>
          <Link to="/tools/wizzy-flow/auth">
            <Button size="lg" variant="secondary" className="text-lg px-8 py-6 h-auto">
              Criar Conta Gratuita
              <ArrowRight className="ml-2" size={20} />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 sm:px-6 lg:px-8 border-t border-border">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <img src={logoFluzz} alt="Fluzz" className="h-10 w-10 object-contain" />
              <span className="text-xl font-bold text-primary">Fluzz</span>
            </div>
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} Fluzz. Todos os direitos reservados.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
