import { MainLayout } from '@/components/layout/MainLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AITab } from '@/components/integrations/AITab';
import { CalendarTab } from '@/components/integrations/CalendarTab';
import { DriveTab } from '@/components/integrations/DriveTab';
import { WhatsAppTab } from '@/components/integrations/WhatsAppTab';
import { Brain, Calendar, HardDrive, MessageSquare } from 'lucide-react';

export default function IntegrationsPage({ embedded = false }: { embedded?: boolean }) {
  const Wrapper = embedded ? ({ children }: { children: React.ReactNode }) => <>{children}</> : ({ children }: { children: React.ReactNode }) => (
    <MainLayout title="Integrações" subtitle="Gerencie conexões, provedores de IA e backups">
      {children}
    </MainLayout>
  );

  return (
    <Wrapper>
      <Tabs defaultValue="ai" className="w-full">
        <TabsList className="mb-6 bg-muted/50 p-1 h-auto flex-wrap">
          <TabsTrigger value="ai" className="gap-2 data-[state=active]:bg-background">
            <Brain className="h-4 w-4" />
            IA
          </TabsTrigger>
          <TabsTrigger value="calendar" className="gap-2 data-[state=active]:bg-background">
            <Calendar className="h-4 w-4" />
            Agenda
          </TabsTrigger>
          <TabsTrigger value="drive" className="gap-2 data-[state=active]:bg-background">
            <HardDrive className="h-4 w-4" />
            Drive
          </TabsTrigger>
          <TabsTrigger value="whatsapp" className="gap-2 data-[state=active]:bg-background">
            <MessageSquare className="h-4 w-4" />
            WhatsApp
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ai">
          <AITab />
        </TabsContent>
        <TabsContent value="calendar">
          <CalendarTab />
        </TabsContent>
        <TabsContent value="drive">
          <DriveTab />
        </TabsContent>
        <TabsContent value="whatsapp">
          <WhatsAppTab />
        </TabsContent>
      </Tabs>
    </Wrapper>
  );
}
