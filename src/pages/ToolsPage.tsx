import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MousePointerClick, FileText, HelpCircle, GitBranch } from 'lucide-react';
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
            return (
              <Card
                key={tool.name}
                className={`cursor-pointer transition-all hover:shadow-md ${isLocked ? 'opacity-50' : 'hover:border-primary/50'}`}
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
