import { MainLayout } from '@/components/layout/MainLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AITab } from '@/components/integrations/AITab';
import { CalendarTab } from '@/components/integrations/CalendarTab';
import { DriveTab } from '@/components/integrations/DriveTab';
import { WhatsAppTab } from '@/components/integrations/WhatsAppTab';
import { InstagramTab } from '@/components/integrations/InstagramTab';
import { Brain, Calendar, HardDrive, Instagram, MessageSquare } from 'lucide-react';

export default function IntegrationsPage() {
  return (
    <MainLayout title="Integrações" subtitle="Gerencie conexões, provedores de IA e backups">
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
          <TabsTrigger value="instagram" className="gap-2 data-[state=active]:bg-background">
            <Instagram className="h-4 w-4" />
            Instagram
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
        <TabsContent value="instagram">
          <InstagramTab />
        </TabsContent>
      </Tabs>
    </MainLayout>
  );
}
