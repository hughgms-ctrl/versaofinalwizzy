import { MainLayout } from '@/components/layout/MainLayout';
import { AgentsTab } from '@/components/agents/AgentsTab';
import { MasterPromptsTab } from '@/components/agents/MasterPromptsTab';
import { WorkspaceAgentsTab } from '@/components/agents/WorkspaceAgentsTab';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Bot, FileText, Settings2 } from 'lucide-react';

const AgentsPage = () => {
  return (
    <MainLayout
      title="Agentes de IA (V14)"
      subtitle="[V14] Configure agentes, prompts mestre e orquestração por workspace"
    >
      <Tabs defaultValue="agents" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="agents" className="gap-2">
            <Bot className="h-4 w-4" />
            Agentes
          </TabsTrigger>
          <TabsTrigger value="workspaces" className="gap-2">
            <Settings2 className="h-4 w-4" />
            Workspaces
          </TabsTrigger>
        </TabsList>

        <TabsContent value="agents" className="mt-0">
          <AgentsTab />
        </TabsContent>

        <TabsContent value="workspaces" className="mt-0">
          <WorkspaceAgentsTab />
        </TabsContent>
      </Tabs>
    </MainLayout>
  );
};

export default AgentsPage;
