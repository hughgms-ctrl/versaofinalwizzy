import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Workflow, Megaphone, CalendarClock } from 'lucide-react';

// Lazy-load the content from existing pages
import FlowsPageContent from '@/pages/FlowsPage';
import CampaignsPageContent from '@/pages/CampaignsPage';
import ScheduledMessagesPageContent from '@/pages/ScheduledMessagesPage';

const AutomationPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const defaultTab = searchParams.get('tab') || 'flows';

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value }, { replace: true });
  };

  return (
    <MainLayout
      title="Automação"
      subtitle="Fluxos, campanhas e agendamentos"
      showSearch={false}
    >
      <Tabs value={defaultTab} onValueChange={handleTabChange} className="space-y-4">
        <TabsList className="bg-muted/50 p-1 h-auto">
          <TabsTrigger value="flows" className="gap-2 data-[state=active]:bg-background">
            <Workflow className="h-4 w-4" />
            Fluxos
          </TabsTrigger>
          <TabsTrigger value="campaigns" className="gap-2 data-[state=active]:bg-background">
            <Megaphone className="h-4 w-4" />
            Campanhas
          </TabsTrigger>
          <TabsTrigger value="scheduled" className="gap-2 data-[state=active]:bg-background">
            <CalendarClock className="h-4 w-4" />
            Agendamentos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="flows">
          <FlowsPageContent embedded />
        </TabsContent>
        <TabsContent value="campaigns">
          <CampaignsPageContent embedded />
        </TabsContent>
        <TabsContent value="scheduled">
          <ScheduledMessagesPageContent embedded />
        </TabsContent>
      </Tabs>
    </MainLayout>
  );
};

export default AutomationPage;
