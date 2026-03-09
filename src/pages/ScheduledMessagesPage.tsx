import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { ScheduledMessagesList } from '@/components/scheduled/ScheduledMessagesList';
import { CreateScheduledMessageDialog } from '@/components/scheduled/CreateScheduledMessageDialog';

const ScheduledMessagesPage = () => {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  return (
    <MainLayout 
      title="Envios em Massa" 
      subtitle="Gerencie suas mensagens e fluxos agendados"
      showSearch={false}
      showNewButton
      newButtonLabel="Novo Envio"
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
