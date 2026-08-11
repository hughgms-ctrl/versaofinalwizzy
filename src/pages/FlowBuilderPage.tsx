import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { FlowCanvas } from '@/components/flow/FlowCanvas';
import { FlowExecutionsPanel } from '@/components/flow/FlowExecutionsPanel';
import { OrchestrationContextBanner } from '@/components/flow/OrchestrationContextBanner';
import { ReactFlowProvider } from '@xyflow/react';
import { Workflow, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

const FlowBuilderPage = () => {
  const [searchParams] = useSearchParams();
  const flowId = searchParams.get('id');
  const [tab, setTab] = useState<'editor' | 'executions'>('editor');

  return (
    <MainLayout
      title="Flow Builder"
      subtitle="Crie automações visuais para seus atendimentos"
      showSearch={false}
      showNewButton={true}
      newButtonLabel="Novo Fluxo"
      fullWidth={true}
    >
      {/* Header tem 64px só em md+; no mobile é min-h-14 (56px) e a barra de
          endereço do navegador mexe no 100vh -- por isso dvh. */}
      <div className="h-[calc(100dvh-3.5rem)] md:h-[calc(100vh-64px)] border-t border-border flex flex-col">
        {flowId && <OrchestrationContextBanner flowId={flowId} />}

        {/* Abas só fazem sentido num fluxo já salvo: sem id não há execução para
            mostrar. Fluxo novo continua abrindo direto no canvas, como antes. */}
        {flowId && (
          <div className="flex shrink-0 items-center gap-1 border-b border-border px-3">
            <TabButton
              active={tab === 'editor'}
              onClick={() => setTab('editor')}
              icon={<Workflow className="h-4 w-4" />}
              label="Editor"
            />
            <TabButton
              active={tab === 'executions'}
              onClick={() => setTab('executions')}
              icon={<Users className="h-4 w-4" />}
              label="Execuções"
            />
          </div>
        )}

        {/* O canvas fica MONTADO ao trocar de aba (hidden em vez de desmontar):
            o React Flow perde zoom, posição e edições não salvas se remontar. */}
        <div className={cn('flex-1 min-h-0', flowId && tab !== 'editor' && 'hidden')}>
          <ReactFlowProvider>
            <FlowCanvas />
          </ReactFlowProvider>
        </div>

        {flowId && tab === 'executions' && (
          <div className="flex-1 min-h-0">
            <FlowExecutionsPanel flowId={flowId} />
          </div>
        )}
      </div>
    </MainLayout>
  );
};

function TabButton({
  active, onClick, icon, label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
        active
          ? 'border-primary text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground',
      )}
    >
      {icon}
      {label}
    </button>
  );
}

export default FlowBuilderPage;
