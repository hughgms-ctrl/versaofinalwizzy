import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { AgentsTab } from '@/components/agents/AgentsTab';
import { AgentTemplateGallery, AgentsPageTabs, type AgentTemplate } from '@/components/agents/AgentTemplateGallery';
import { ApplyTemplateWizard } from '@/components/agents/ApplyTemplateWizard';
import { useAgentTemplates } from '@/hooks/useAgentTemplates';
import { useAppliedTemplateInstances } from '@/hooks/useAgentInstances';
import { usePlatformSetting } from '@/hooks/usePlatformSettings';
import { usePlatformAdmin } from '@/hooks/usePlatformAdmin';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { useQueryClient } from '@tanstack/react-query';

const AgentsPage = () => {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { selectedWorkspace } = useWorkspaceContext();
  const activeOrganizationId = selectedWorkspace?.organization_id || profile?.organization_id || null;
  const { isPlatformAdmin } = usePlatformAdmin();
  const { data: templates = [] } = useAgentTemplates();
  const { data: appliedInstances = [] } = useAppliedTemplateInstances();

  const { data: toolReleaseFlags } = usePlatformSetting<Record<string, boolean>>('tool_release_flags', {});
  const { data: internalTestOrgIds } = usePlatformSetting<string[]>('internal_test_organization_ids', []);
  const isInternalTestOrg = Boolean(activeOrganizationId && internalTestOrgIds?.includes(activeOrganizationId));

  // Mesma combinação já usada em ToolsPage.tsx: flag do admin ligada OU org marcada
  // como teste interno. Sem bypass extra — pra ver a galeria antes do flag geral,
  // adicione a organização em internal_test_organization_ids via admin-dashboard.
  const showTemplateGallery = toolReleaseFlags?.['agent_template_gallery'] === true || isInternalTestOrg;
  // agent_mass_tester (AgentTesterPanel) não mora mais nesta tela — o simulador e a
  // classificação em massa vão viver dentro do detalhe do agente/instância (a definir
  // no design da Etapa 4), não empilhados sob a galeria.

  const [activeTab, setActiveTab] = useState<'gallery' | 'my-agents'>('my-agents');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [applyingTemplate, setApplyingTemplate] = useState<AgentTemplate | null>(null);

  return (
    <MainLayout
      title="Agentes de IA"
      subtitle="Configure seus agentes especialistas para uso nos fluxos de atendimento"
    >
      {showTemplateGallery ? (
        <div className="space-y-4">
          <AgentsPageTabs activeTab={activeTab} onTabChange={setActiveTab} />

          {activeTab === 'gallery' && (
            <AgentTemplateGallery
              templates={templates}
              isAdmin={isPlatformAdmin}
              appliedInstances={appliedInstances}
              onApplyTemplate={(templateId) => {
                const template = templates.find((t) => t.id === templateId) || null;
                setApplyingTemplate(template);
                setWizardOpen(true);
              }}
            />
          )}

          {activeTab === 'my-agents' && <AgentsTab />}
        </div>
      ) : (
        <AgentsTab />
      )}

      <ApplyTemplateWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        template={applyingTemplate}
        onApplied={() => {
          queryClient.invalidateQueries({ queryKey: ['ai-agents'] });
          queryClient.invalidateQueries({ queryKey: ['applied-template-instances'] });
          setActiveTab('my-agents');
        }}
      />
    </MainLayout>
  );
};

export default AgentsPage;
