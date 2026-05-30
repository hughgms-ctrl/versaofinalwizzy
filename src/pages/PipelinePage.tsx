import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { PipelineBoard } from '@/components/pipeline/PipelineBoardV2';
import { PipelineSelector } from '@/components/pipeline/PipelineSelector';
import { PipelineChatModal } from '@/components/pipeline/PipelineChatModal';
import { ConversationFilters, ConversationFiltersState, defaultFilters } from '@/components/shared/ConversationFilters';
import { Loader2, Search, X, Smartphone, Settings } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePipelines, useDeletePipeline, Pipeline } from '@/hooks/usePipelines';
import { useConversations, DbConversation } from '@/hooks/useConversations';
import { useWhatsAppStatus } from '@/hooks/useWhatsAppStatus';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
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
import { useUserPermissions, useCurrentUserRole } from '@/hooks/useUserPermissions';
import { useAuth } from '@/hooks/useAuth';
import { useConversationShares } from '@/hooks/useConversationShares';

const getLastSelectedPipelineStorageKey = (workspaceId?: string | null) => (
  `pipeline_last_selected:${workspaceId || 'global'}`
);

const PipelinePage = () => {
  const queryClient = useQueryClient();
  const { data: allPipelines = [], isLoading: pipelinesLoading } = usePipelines();
  const { data: conversations = [], isLoading: conversationsLoading } = useConversations();
  const { connected: whatsappConnected, isLoading: whatsappLoading } = useWhatsAppStatus();
  const deletePipeline = useDeletePipeline();
  const { selectedWorkspaceId } = useWorkspaceContext();
  const { data: userPermissions } = useUserPermissions();
  const { data: userRole } = useCurrentUserRole();
  const { user } = useAuth();
  const { data: myShares = [] } = useConversationShares();

  // Fetch pipeline positions for shared conversations to know which pipelines to show
  const isRestricted = userRole && userRole !== 'owner' && userRole !== 'admin';
  const hasPipelineRestriction = isRestricted && userPermissions?.pipeline_access_type === 'specific' && (userPermissions?.allowed_pipeline_ids?.length ?? 0) > 0;

  const { data: sharedPipelinePositions = [] } = useQuery({
    queryKey: ['shared-pipeline-positions', myShares.map(s => s.conversation_id)],
    queryFn: async () => {
      const sharedConvIds = myShares.map(s => s.conversation_id);
      if (sharedConvIds.length === 0) return [];
      const { data, error } = await supabase
        .from('conversation_pipeline_positions')
        .select('conversation_id, pipeline_id')
        .in('conversation_id', sharedConvIds);
      if (error) throw error;
      return data || [];
    },
    enabled: !!hasPipelineRestriction && myShares.length > 0,
  });

  // Filter pipelines by selected workspace AND user permissions
  const pipelines = useMemo(() => {
    let filtered = allPipelines;
    
    // Workspace filter
    if (selectedWorkspaceId) {
      filtered = filtered.filter(p =>
        p.workspace_ids?.includes(selectedWorkspaceId)
      );
    }
    
    // Permission filter: restrict to allowed pipelines + pipelines with shared leads
    if (hasPipelineRestriction && userPermissions?.allowed_pipeline_ids?.length) {
      const allowedIds = new Set(userPermissions.allowed_pipeline_ids);
      // Also include pipelines that contain shared conversations
      sharedPipelinePositions.forEach(pp => allowedIds.add(pp.pipeline_id));
      filtered = filtered.filter(p => allowedIds.has(p.id));
    }
    
    return filtered;
  }, [allPipelines, selectedWorkspaceId, hasPipelineRestriction, userPermissions, sharedPipelinePositions]);

  const [selectedPipeline, setSelectedPipeline] = useState<Pipeline | null>(null);
  const [filters, setFilters] = useState<ConversationFiltersState>(defaultFilters);
  const [searchQuery, setSearchQuery] = useState('');
  const [chatConversation, setChatConversation] = useState<DbConversation | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const selectPipeline = (pipeline: Pipeline) => {
    setSelectedPipeline(pipeline);
    localStorage.setItem(getLastSelectedPipelineStorageKey(selectedWorkspaceId), pipeline.id);
  };

  // Keep selected pipeline in sync and reopen the last accessed pipeline.
  useEffect(() => {
    if (pipelines.length === 0) {
      setSelectedPipeline(null);
      return;
    }

    if (selectedPipeline) {
      const updated = pipelines.find(p => p.id === selectedPipeline.id);
      if (updated) {
        setSelectedPipeline(updated);
        return;
      }
    }

    const lastSelectedId = localStorage.getItem(getLastSelectedPipelineStorageKey(selectedWorkspaceId));
    const lastSelectedPipeline = lastSelectedId
      ? pipelines.find(p => p.id === lastSelectedId)
      : null;
    const defaultPipeline = pipelines.find(p => p.is_default) || pipelines[0];
    setSelectedPipeline(lastSelectedPipeline || defaultPipeline);
  }, [pipelines, selectedPipeline?.id, selectedWorkspaceId]);

  const handleConversationClick = async (conversation: DbConversation) => {
    setChatConversation(conversation);
    setChatOpen(true);

    // Mark as read if there are unread messages
    if (conversation.unread_count > 0) {
      try {
        await supabase
          .from('conversations')
          .update({ unread_count: 0 })
          .eq('id', conversation.id);
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
        queryClient.invalidateQueries({ queryKey: ['pipeline-conversations'] });
      } catch (err) {
        console.error('Error marking conversation as read:', err);
      }
    }
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
        <div className="flex items-center px-4 py-2 border-b border-border bg-muted/30 flex-shrink-0 overflow-x-auto w-full scrollbar-hide">
          <div className="flex items-center gap-4 min-w-max">
            <PipelineSelector
              pipelines={pipelines}
              selectedPipeline={selectedPipeline}
              onSelect={selectPipeline}
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
          sharedConversationIds={
            hasPipelineRestriction && selectedPipeline && 
            !userPermissions?.allowed_pipeline_ids?.includes(selectedPipeline.id)
              ? new Set(myShares.map(s => s.conversation_id))
              : undefined
          }
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
