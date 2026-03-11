import { AdminLayout } from '@/components/admin/AdminLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GovernanceDashboardTab } from '@/components/admin/governance/GovernanceDashboardTab';
import { GovernanceChecklistTab } from '@/components/admin/governance/GovernanceChecklistTab';
import { GovernancePromptsTab } from '@/components/admin/governance/GovernancePromptsTab';
import { GovernanceLibraryTab } from '@/components/admin/governance/GovernanceLibraryTab';
import { GovernanceHistoryTab } from '@/components/admin/governance/GovernanceHistoryTab';

export default function AdminGovernancePage() {
  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Governança</h1>
          <p className="text-muted-foreground mt-1">Auditoria, maturidade e certificação da arquitetura</p>
        </div>

        <Tabs defaultValue="dashboard" className="space-y-4">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="checklist">Checklist</TabsTrigger>
            <TabsTrigger value="prompts">Prompts</TabsTrigger>
            <TabsTrigger value="library">Biblioteca</TabsTrigger>
            <TabsTrigger value="history">Histórico</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard">
            <GovernanceDashboardTab />
          </TabsContent>

          <TabsContent value="checklist">
            <GovernanceChecklistTab />
          </TabsContent>

          <TabsContent value="prompts">
            <GovernancePromptsTab />
          </TabsContent>

          <TabsContent value="library">
            <GovernanceLibraryTab />
          </TabsContent>

          <TabsContent value="history">
            <GovernanceHistoryTab />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}