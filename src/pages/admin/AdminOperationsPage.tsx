import { AdminLayout } from '@/components/admin/AdminLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AdminDocsContent } from '@/pages/admin/AdminDocsPage';
import { AdminGovernanceContent } from '@/pages/admin/AdminGovernancePage';
import { AdminHistoryContent } from '@/pages/admin/AdminHistoryPage';
import { AdminMonitoringContent } from '@/pages/admin/AdminMonitoringPage';
import { AdminSecurityContent } from '@/pages/admin/AdminSecurityPage';
import { BookOpen, ScrollText, Shield, ShieldCheck, TrendingUp } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

const operationTabs = [
  {
    value: 'governance',
    label: 'Governança',
    path: '/admin/operations/governance',
    icon: ScrollText,
    content: <AdminGovernanceContent showHeader={false} />,
  },
  {
    value: 'security',
    label: 'Segurança',
    path: '/admin/operations/security',
    icon: Shield,
    content: <AdminSecurityContent showHeader={false} />,
  },
  {
    value: 'monitoring',
    label: 'Monitoramento',
    path: '/admin/operations/monitoring',
    icon: ShieldCheck,
    content: <AdminMonitoringContent showHeader={false} />,
  },
  {
    value: 'docs',
    label: 'Documentação',
    path: '/admin/operations/docs',
    icon: BookOpen,
    content: <AdminDocsContent showHeader={false} />,
  },
  {
    value: 'history',
    label: 'Histórico',
    path: '/admin/operations/history',
    icon: TrendingUp,
    content: <AdminHistoryContent showHeader={false} />,
  },
];

export default function AdminOperationsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab = operationTabs.find((tab) => location.pathname === tab.path)?.value ?? 'governance';

  const handleTabChange = (value: string) => {
    const nextTab = operationTabs.find((tab) => tab.value === value);
    if (nextTab) {
      navigate(nextTab.path);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Operações</h1>
          <p className="text-muted-foreground mt-1">
            Governança, segurança, monitoramento, documentação e histórico da plataforma
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-5">
          <TabsList className="flex h-auto flex-wrap justify-start gap-1 bg-muted/50 p-1">
            {operationTabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} className="gap-2">
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {operationTabs.map((tab) => (
            <TabsContent key={tab.value} value={tab.value} className="mt-0">
              {tab.content}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </AdminLayout>
  );
}
