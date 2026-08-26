import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { ScheduledMessagesList } from '@/components/scheduled/ScheduledMessagesList';
import { CreateScheduledMessageDialog } from '@/components/scheduled/CreateScheduledMessageDialog';

const ScheduledMessagesPage = () => {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  // A pasta aberta fica aqui porque o botão "Nova programação" mora no header
  // da página: sem isso a programação criada de dentro de uma pasta cairia na raiz.
  const [openFolderId, setOpenFolderId] = useState<string | null>(null);

  return (
    <MainLayout 
      title="Mensagens programadas" 
      subtitle="Programe mensagens, mídias e fluxos para envio automático"
      showSearch={false}
      showNewButton
      newButtonLabel="Nova programação"
      onNewClick={() => setCreateDialogOpen(true)}
    >
      <ScheduledMessagesList
        openFolderId={openFolderId}
        onOpenFolderChange={setOpenFolderId}
      />

      <CreateScheduledMessageDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        folderId={openFolderId}
      />
    </MainLayout>
  );
};

export default ScheduledMessagesPage;
