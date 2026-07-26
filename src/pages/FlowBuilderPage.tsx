import { useSearchParams } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { FlowCanvas } from '@/components/flow/FlowCanvas';
import { OrchestrationContextBanner } from '@/components/flow/OrchestrationContextBanner';
import { ReactFlowProvider } from '@xyflow/react';

const FlowBuilderPage = () => {
  const [searchParams] = useSearchParams();
  const flowId = searchParams.get('id');

  return (
    <MainLayout
      title="Flow Builder"
      subtitle="Crie automações visuais para seus atendimentos"
      showSearch={false}
      showNewButton={true}
      newButtonLabel="Novo Fluxo"
      fullWidth={true}
    >
      <div className="h-[calc(100vh-64px)] border-t border-border flex flex-col">
        {flowId && <OrchestrationContextBanner flowId={flowId} />}
        <div className="flex-1 min-h-0">
          <ReactFlowProvider>
            <FlowCanvas />
          </ReactFlowProvider>
        </div>
      </div>
    </MainLayout>
  );
};

export default FlowBuilderPage;
