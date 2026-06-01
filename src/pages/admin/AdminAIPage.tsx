import { useLocation, useNavigate } from 'react-router-dom';
import { Activity, Brain, Key } from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AdminAIModelsContent } from './AdminAIModelsPage';
import { AdminAIUsageContent } from './AdminAIUsagePage';
import { AdminApiContent } from './AdminApiPage';

function getActiveTab(pathname: string) {
  if (pathname.includes('/models')) return 'models';
  if (pathname.includes('/api')) return 'api';
  return 'usage';
}

const tabRoutes: Record<string, string> = {
  usage: '/admin/ai/usage',
  models: '/admin/ai/models',
  api: '/admin/ai/api',
};

export default function AdminAIPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab = getActiveTab(location.pathname);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">IA & Custos</h1>
          <p className="mt-1 text-muted-foreground">
            Modelos, consumo, chaves e custos de IA em um unico lugar.
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={(value) => navigate(tabRoutes[value])} className="space-y-5">
          <TabsList className="h-auto flex-wrap justify-start">
            <TabsTrigger value="usage" className="gap-2">
              <Activity className="h-4 w-4" />
              Consumo
            </TabsTrigger>
            <TabsTrigger value="models" className="gap-2">
              <Brain className="h-4 w-4" />
              Modelos
            </TabsTrigger>
            <TabsTrigger value="api" className="gap-2">
              <Key className="h-4 w-4" />
              API & Custos
            </TabsTrigger>
          </TabsList>

          <TabsContent value="usage" className="mt-0">
            <AdminAIUsageContent showHeader={false} />
          </TabsContent>
          <TabsContent value="models" className="mt-0">
            <AdminAIModelsContent showHeader={false} />
          </TabsContent>
          <TabsContent value="api" className="mt-0">
            <AdminApiContent showHeader={false} />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
