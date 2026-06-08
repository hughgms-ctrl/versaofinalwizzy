import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MousePointerClick, FileText, HelpCircle, GitBranch, LayoutTemplate, Scale, SearchCheck, Images } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useOrganizationPlan } from '@/hooks/useOrganizationPlan';
import { Lock } from 'lucide-react';
import { useState } from 'react';
import UpgradeModal from '@/components/billing/UpgradeModal';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';

const tools = [
  {
    name: 'Wizzy Forms',
    description: 'Crie botões com formulário para incorporar no seu site e capturar leads automaticamente.',
    icon: MousePointerClick,
    href: '/tools/buttons',
    planModule: 'widgets',
  },
  {
    name: 'Wizzy Sign',
    description: 'Gerencie templates, pacotes de documentos, assinaturas e gere PDFs automaticamente.',
    icon: FileText,
    href: '/tools/documents',
    planModule: 'documents',
  },
  {
    name: 'Wizzy Quiz',
    description: 'Crie questionários interativos estilo Typebot. Capture dados, qualifique leads e dispare conversas.',
    icon: HelpCircle,
    href: '/tools/quiz',
    planModule: 'quiz',
  },
  {
    name: 'Wizzy Flow',
    description: 'Organize processos, projetos, tarefas e fluxos operacionais dentro do workspace atual.',
    icon: GitBranch,
    href: '/tools/wizzy-flow',
    planModule: 'wizzy_flow',
  },
  {
    name: 'Wizzy Carrossel',
    description: 'Gere carrosséis para o Instagram com IA — textos e imagens criados automaticamente, prontos pra baixar.',
    icon: Images,
    href: '/tools/carousel',
  },
  {
    name: 'Wizzy Pages',
    description: 'Crie páginas profissionais com auxílio da IA.',
    icon: LayoutTemplate,
    comingSoon: true,
  },
  {
    name: 'Wizzy Docs',
    description: 'Criação e análise jurídica de contratos com IA.',
    icon: Scale,
    comingSoon: true,
  },
  {
    name: 'Wizzy CNIS',
    description: 'Análise de CNIS para fins de Auxílio Reclusão e outros.',
    icon: SearchCheck,
    href: '/tools/cnis',
  },
];

export default function ToolsPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { selectedWorkspace } = useWorkspaceContext();
  const activeOrganizationId = selectedWorkspace?.organization_id || profile?.organization_id || null;
  const { canAccessModule } = useOrganizationPlan(activeOrganizationId);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [blockedModule, setBlockedModule] = useState<string | undefined>();

  const handleClick = (tool: typeof tools[0]) => {
    if (tool.comingSoon) return;
    if (tool.planModule && !canAccessModule(tool.planModule)) {
      setBlockedModule(tool.name);
      setUpgradeOpen(true);
      return;
    }
    navigate(tool.href);
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Ferramentas</h1>
          <p className="text-muted-foreground">Gerencie suas ferramentas de captura, documentação e qualificação.</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool) => {
            const isLocked = tool.planModule ? !canAccessModule(tool.planModule) : false;
            const isComingSoon = Boolean(tool.comingSoon);
            return (
              <Card
                key={tool.name}
                className={`transition-all hover:shadow-md ${isComingSoon ? 'cursor-default opacity-75' : 'cursor-pointer'} ${isLocked ? 'opacity-50' : !isComingSoon ? 'hover:border-primary/50' : ''}`}
                onClick={() => handleClick(tool)}
              >
                <CardHeader className="flex flex-row items-center gap-4 pb-2">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                    <tool.icon className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-lg flex items-center gap-2">
                      {tool.name}
                      {isLocked && <Lock className="h-4 w-4 text-muted-foreground" />}
                      {isComingSoon && <Badge variant="secondary">Em breve</Badge>}
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-sm">{tool.description}</CardDescription>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
      <UpgradeModal open={upgradeOpen} onOpenChange={setUpgradeOpen} moduleName={blockedModule} />
    </MainLayout>
  );
}
