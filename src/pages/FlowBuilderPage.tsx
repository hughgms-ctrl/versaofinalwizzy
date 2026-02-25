import { MainLayout } from '@/components/layout/MainLayout';
import { FlowCanvas } from '@/components/flow/FlowCanvas';
import { ReactFlowProvider } from '@xyflow/react';

const FlowBuilderPage = () => {
  return (
    <MainLayout 
      title="Flow Builder" 
      subtitle="Crie automações visuais para seus atendimentos"
      showSearch={false}
      showNewButton={true}
      newButtonLabel="Novo Fluxo"
    >
      <div className="h-[calc(100vh-180px)] -mx-6 -mb-6 border-t border-border">
        <ReactFlowProvider>
          <FlowCanvas />
        </ReactFlowProvider>
      </div>
    </MainLayout>
  );
};

export default FlowBuilderPage;
