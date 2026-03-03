import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { PipelineBoard } from '@/components/pipeline/PipelineBoardV2';
import { PipelineSelector } from '@/components/pipeline/PipelineSelector';
import { PipelineChatModal } from '@/components/pipeline/PipelineChatModal';
import { ConversationFilters, ConversationFiltersState, defaultFilters } from '@/components/shared/ConversationFilters';
import { Loader2, Search, X, Smartphone, Settings } from 'lucide-react';
import { usePipelines, useDeletePipeline, Pipeline } from '@/hooks/usePipelines';
import { useConversations, DbConversation } from '@/hooks/useConversations';
import { useWhatsAppStatus } from '@/hooks/useWhatsAppStatus';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const PipelinePage = () => {
  const { data: allPipelines = [], isLoading: pipelinesLoading } = usePipelines();
  const { data: conversations = [], isLoading: conversationsLoading } = useConversations();
  const { connected: whatsappConnected, isLoading: whatsappLoading } = useWhatsAppStatus();
  const deletePipeline = useDeletePipeline();
  const { selectedWorkspaceId } = useWorkspaceContext();

  // Filter pipelines by selected workspace (global/empty array + matching workspace)
  const pipelines = useMemo(() => {
    if (!selectedWorkspaceId) return allPipelines;
    return allPipelines.filter(p =>
      !p.workspace_ids || p.workspace_ids.length === 0 || p.workspace_ids.includes(selectedWorkspaceId)
    );
  }, [allPipelines, selectedWorkspaceId]);

  const [selectedPipeline, setSelectedPipeline] = useState<Pipeline | null>(null);
  const [filters, setFilters] = useState<ConversationFiltersState>(defaultFilters);
  const [searchQuery, setSearchQuery] = useState('');
  const [chatConversation, setChatConversation] = useState<DbConversation | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Auto-select first pipeline
  useEffect(() => {
    if (pipelines.length > 0 && !selectedPipeline) {
      const defaultPipeline = pipelines.find(p => p.is_default) || pipelines[0];
      setSelectedPipeline(defaultPipeline);
    }
  }, [pipelines, selectedPipeline]);

  // Keep selected pipeline in sync
  useEffect(() => {
    if (selectedPipeline && pipelines.length > 0) {
      const updated = pipelines.find(p => p.id === selectedPipeline.id);
      if (updated) {
        setSelectedPipeline(updated);
      } else if (pipelines.length > 0) {
        setSelectedPipeline(pipelines[0]);
      } else {
        setSelectedPipeline(null);
      }
    }
  }, [pipelines]);

  const handleConversationClick = (conversation: DbConversation) => {
    setChatConversation(conversation);
    setChatOpen(true);
  };

  const handleDeletePipeline = async () => {
    if (!deleteId) return;
    await deletePipeline.mutateAsync(deleteId);
    setDeleteId(null);
    if (selectedPipeline?.id === deleteId) {
      setSelectedPipeline(null);
    }
  };

  const isLoading = pipelinesLoading || conversationsLoading;

  // Show disconnected state if WhatsApp is not connected
  if (!whatsappLoading && !whatsappConnected) {
    return (
      <MainLayout
        title="Pipeline de Atendimento"
        subtitle="Visualize e gerencie o fluxo de conversas"
        showSearch={false}
        showNewButton={false}
      >
        <div className="flex items-center justify-center h-64">
          <div className="text-center p-8 max-w-md">
            <div className="h-20 w-20 rounded-2xl bg-yellow-500/10 flex items-center justify-center mx-auto mb-6">
              <Smartphone className="h-10 w-10 text-yellow-500" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">Conecte seu WhatsApp</h2>
            <p className="text-muted-foreground mb-6">
              Para visualizar o pipeline de conversas, você precisa conectar seu WhatsApp nas configurações.
            </p>
            <Button asChild>
              <Link to="/settings">
                <Settings className="h-4 w-4 mr-2" />
                Ir para Configurações
              </Link>
            </Button>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (isLoading) {
    return (
      <MainLayout
        title="Pipeline de Atendimento"
        subtitle="Carregando..."
        showSearch={false}
        showNewButton={false}
      >
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout
      title="Pipeline de Atendimento"
      subtitle="Visualize e gerencie o fluxo de conversas"
      showSearch={false}
      showNewButton={false}
      fullWidth
    >
      <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden">
        {/* Header Controls */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30 flex-shrink-0 flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <PipelineSelector
              pipelines={pipelines}
              selectedPipeline={selectedPipeline}
              onSelect={setSelectedPipeline}
              onDelete={setDeleteId}
            />

            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou número..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-9 w-64 bg-secondary/50 border-0"
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                  onClick={() => setSearchQuery('')}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            <ConversationFilters
              conversations={conversations}
              filters={filters}
              onFiltersChange={setFilters}
              showCount={false}
            />
          </div>
        </div>

        {/* Pipeline Board */}
        <PipelineBoard
          pipeline={selectedPipeline}
          filters={filters}
          searchQuery={searchQuery}
          onConversationClick={handleConversationClick}
        />

        {/* Chat Modal */}
        <PipelineChatModal
          conversation={chatConversation}
          open={chatOpen}
          onOpenChange={setChatOpen}
        />

        {/* Delete Confirmation */}
        <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir pipeline?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação não pode ser desfeita. Todas as configurações de colunas e posições de conversas serão perdidas.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeletePipeline}>
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </MainLayout>
  );
};

export default PipelinePage;
