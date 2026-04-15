import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { ScheduledMessagesList } from '@/components/scheduled/ScheduledMessagesList';
import { CreateScheduledMessageDialog } from '@/components/scheduled/CreateScheduledMessageDialog';

const ScheduledMessagesPage = ({ embedded = false }: { embedded?: boolean }) => {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  return (
    <MainLayout 
      title="Agendamento de Mensagens" 
      subtitle="Gerencie seus agendamentos de mensagens e fluxos"
      showSearch={false}
      showNewButton
      newButtonLabel="Novo Agendamento"
      onNewClick={() => setCreateDialogOpen(true)}
    >
      <ScheduledMessagesList />
      
      <CreateScheduledMessageDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
    </MainLayout>
  );
};

export default ScheduledMessagesPage;
