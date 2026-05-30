import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { ScheduledMessagesList } from '@/components/scheduled/ScheduledMessagesList';
import { CreateScheduledMessageDialog } from '@/components/scheduled/CreateScheduledMessageDialog';

const ScheduledMessagesPage = () => {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  return (
    <MainLayout 
      title="Mensagens programadas" 
      subtitle="Programe mensagens, mídias e fluxos para envio automático"
      showSearch={false}
      showNewButton
      newButtonLabel="Nova programação"
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
