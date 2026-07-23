import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

export interface AgentKnowledgeFile {
  id: string;
  agent_id: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  status: 'processing' | 'ready' | 'error';
  error_message: string | null;
  created_at: string;
}

// Base de conhecimento (RAG) do agente -- ver conversa com o usuário: em vez
// de colar o arquivo inteiro no prompt, cada upload vira pedaços com
// embedding, buscados só o trecho relevante na hora de responder
// (process-agent-knowledge-file + agent-orchestrator).
export function useAgentKnowledgeFiles(agentId: string | null) {
  return useQuery({
    queryKey: ['agent-knowledge-files', agentId],
    queryFn: async (): Promise<AgentKnowledgeFile[]> => {
      const { data, error } = await (supabase as any)
        .from('agent_knowledge_files')
        .select('id, agent_id, file_name, storage_path, mime_type, status, error_message, created_at')
        .eq('agent_id', agentId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as AgentKnowledgeFile[]) || [];
    },
    enabled: !!agentId,
    // Enquanto algum arquivo ainda está processando, verifica de novo em
    // pouco tempo pra status refletir sozinho (sem precisar recarregar a tela).
    refetchInterval: (query) => {
      const data = query.state.data as AgentKnowledgeFile[] | undefined;
      return data?.some((f) => f.status === 'processing') ? 2500 : false;
    },
  });
}

export function useUploadAgentKnowledgeFile() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({ agentId, file }: { agentId: string; file: File }) => {
      if (!profile?.organization_id) throw new Error('Sem organização');
      const path = `${agentId}/${Date.now()}-${file.name}`;

      const { error: uploadError } = await supabase.storage.from('agent-knowledge-files').upload(path, file);
      if (uploadError) throw uploadError;

      const { data: fileRow, error: insertError } = await (supabase as any)
        .from('agent_knowledge_files')
        .insert({
          organization_id: profile.organization_id,
          agent_id: agentId,
          file_name: file.name,
          storage_path: path,
          mime_type: file.type || null,
          status: 'processing',
        })
        .select('id')
        .single();
      if (insertError) throw insertError;

      // Dispara o processamento (extração + chunk + embedding) -- não bloqueia
      // a UI esperando terminar; o status na lista atualiza sozinho via polling.
      supabase.functions.invoke('process-agent-knowledge-file', { body: { fileId: fileRow.id } });

      return fileRow;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['agent-knowledge-files', variables.agentId] });
      toast({ title: 'Arquivo enviado', description: 'Processando... o status atualiza sozinho em alguns segundos.' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao enviar arquivo', description: error.message, variant: 'destructive' });
    },
  });
}

export function useDeleteAgentKnowledgeFile() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ fileId, agentId, storagePath }: { fileId: string; agentId: string; storagePath: string }) => {
      await supabase.storage.from('agent-knowledge-files').remove([storagePath]);
      // agent_knowledge_chunks tem ON DELETE CASCADE em file_id -- apagar a
      // linha do arquivo já remove os pedaços/embeddings dele.
      const { error } = await (supabase as any).from('agent_knowledge_files').delete().eq('id', fileId);
      if (error) throw error;
      return { agentId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['agent-knowledge-files', result.agentId] });
      toast({ title: 'Arquivo removido' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao remover arquivo', description: error.message, variant: 'destructive' });
    },
  });
}
