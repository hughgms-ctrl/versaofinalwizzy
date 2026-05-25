import { MainLayout } from '@/components/layout/MainLayout';
import { AgentsTab } from '@/components/agents/AgentsTab';

const AgentsPage = () => {
  return (
    <MainLayout
      title="Agentes de IA"
      subtitle="Configure seus agentes especialistas para uso nos fluxos de atendimento"
    >
      <AgentsTab />
    </MainLayout>
  );
};

export default AgentsPage;
