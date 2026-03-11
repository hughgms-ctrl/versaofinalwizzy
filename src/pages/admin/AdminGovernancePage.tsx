import { AdminLayout } from '@/components/admin/AdminLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GovernanceDashboardTab } from '@/components/admin/governance/GovernanceDashboardTab';
import { GovernanceChecklistTab } from '@/components/admin/governance/GovernanceChecklistTab';
import { GovernancePromptsTab } from '@/components/admin/governance/GovernancePromptsTab';
import { GovernanceLibraryTab } from '@/components/admin/governance/GovernanceLibraryTab';
import { GovernanceHistoryTab } from '@/components/admin/governance/GovernanceHistoryTab';
import { GovernanceAuditTab } from '@/components/admin/governance/GovernanceAuditTab';
import { FileText, Target, BarChart3, Rocket, FileUp, Award, Clock } from 'lucide-react';

export default function AdminGovernancePage() {
  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Governança</h1>
          <p className="text-muted-foreground mt-1">Auditoria, maturidade e certificação da arquitetura</p>
        </div>

        <Tabs defaultValue="prompts" className="space-y-4">
          <TabsList className="flex-wrap h-auto gap-1 bg-transparent border-b border-border rounded-none p-0 pb-0">
            <TabsTrigger value="prompts" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none gap-1.5">
              <FileText className="h-4 w-4" />
              Prompts
            </TabsTrigger>
            <TabsTrigger value="audit" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none gap-1.5">
              <Target className="h-4 w-4" />
              Auditoria
            </TabsTrigger>
            <TabsTrigger value="checklist" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none gap-1.5">
              <BarChart3 className="h-4 w-4" />
              Arquitetura Base
            </TabsTrigger>
            <TabsTrigger value="library" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none gap-1.5">
              <Rocket className="h-4 w-4" />
              Novo SaaS
            </TabsTrigger>
            <TabsTrigger value="dashboard" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none gap-1.5">
              <Award className="h-4 w-4" />
              Certificações
            </TabsTrigger>
            <TabsTrigger value="history" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none gap-1.5">
              <Clock className="h-4 w-4" />
              Histórico
            </TabsTrigger>
          </TabsList>

          <TabsContent value="prompts">
            <GovernancePromptsTab />
          </TabsContent>

          <TabsContent value="audit">
            <GovernanceAuditTab />
          </TabsContent>

          <TabsContent value="checklist">
            <GovernanceChecklistTab />
          </TabsContent>

          <TabsContent value="library">
            <GovernanceLibraryTab />
          </TabsContent>

          <TabsContent value="dashboard">
            <GovernanceDashboardTab />
          </TabsContent>

          <TabsContent value="history">
            <GovernanceHistoryTab />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
