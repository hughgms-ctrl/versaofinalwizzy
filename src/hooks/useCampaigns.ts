import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { normalizeWorkspaceId, isUnassignedWorkspace } from '@/lib/workspaceId';
import { toast } from 'sonner';

export interface Campaign {
    id: string;
    organization_id: string;
    name: string;
    trigger_keyword: string;
    match_type: string;
    flow_id: string;
    is_active: boolean;
    trigger_count: number;
    start_time?: string;
    end_time?: string;
    pending_count?: number;
    workspace_id?: string | null;
    webhook_token?: string;
    /** Público do gatilho por palavra-chave. Vazio/ausente = qualquer contato dispara. */
    trigger_tag_ids?: string[];
    /** any | all | none -- como combinar trigger_tag_ids. */
    trigger_tag_match?: string;
    /** Desempate entre campanhas com palavras-chave sobrepostas. Maior ganha. */
    trigger_priority?: number;
    /** Palavra-chave dispara mesmo com fluxo ativo na conversa (comando interno). */
    interrompe_fluxo?: boolean;
    folder_id?: string | null;
    position?: number;
    created_at: string;
    updated_at: string;
    flow?: {
        id: string;
        name: string;
    };
}

export function useCampaigns() {
    const { profile } = useAuth();
    const currentOrganizationId = profile?.organization_id;
    const { selectedWorkspaceId } = useWorkspaceContext();

    return useQuery({
        queryKey: ['campaigns', currentOrganizationId, selectedWorkspaceId],
        queryFn: async () => {
            if (!currentOrganizationId) return [];

            let query = supabase
                .from('campaigns')
                .select(`
                  *,
                  flow:flows(id, name),
                  pending_count:campaign_queue(count)
                `)
                .eq('campaign_queue.status', 'pending')
                .eq('organization_id', currentOrganizationId)
                .order('created_at', { ascending: false });

            // Filter by workspace: show campaigns for this workspace or without workspace.
            // "Sem Workspace" e a sentinela 'unassigned', que nao e uuid: mandada
            // ao PostgREST derrubava a consulta inteira e a tela ficava vazia.
            const workspaceId = normalizeWorkspaceId(selectedWorkspaceId);
            if (workspaceId) {
                query = query.or(`workspace_id.eq.${workspaceId},workspace_id.is.null`);
            } else if (isUnassignedWorkspace(selectedWorkspaceId)) {
                query = query.is('workspace_id', null);
            }

            const { data, error } = await query;

            if (error) throw error;

            const mappedData = (data || []).map((c: any) => ({
                ...c,
                pending_count: c.pending_count?.[0]?.count || 0,
                folder_id: c.folder_id ?? null,
                position: c.position ?? 0,
            }));

            return mappedData as unknown as Campaign[];
        },
        enabled: !!currentOrganizationId,
    });
}

export function useCreateCampaign() {
    const queryClient = useQueryClient();
    const { profile } = useAuth();
    const currentOrganizationId = profile?.organization_id;

    return useMutation({
        mutationFn: async (campaign: Partial<Campaign>) => {
            if (!currentOrganizationId) throw new Error('No organization selected');

            // Cast payload to any to bypass strict type checking for now, as DB might require some fields but TS thinks they are optional in Partial<Campaign>
            const payload = { ...campaign, organization_id: currentOrganizationId } as any;

            const { data, error } = await supabase
                .from('campaigns')
                .insert([payload])
                .select()
                .single();

            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['campaigns'] });
            toast.success('Campanha criada com sucesso!');
        },
        onError: (error: any) => {
            console.error('Error creating campaign:', error);
            toast.error(`Erro ao criar campanha: ${error?.message || 'Erro interno'}`);
        },
    });
}

export function useUpdateCampaign() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, ...updates }: Partial<Campaign> & { id: string }) => {
            const { data, error } = await supabase
                .from('campaigns')
                .update(updates)
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['campaigns'] });
            toast.success('Campanha atualizada!');
        },
        onError: (error) => {
            console.error('Error updating campaign:', error);
            toast.error('Erro ao atualizar campanha');
        },
    });
}

export function useDeleteCampaign() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            // .select() força o Postgrest a devolver as linhas de fato apagadas --
            // sem isso, uma policy de RLS que bloqueia silenciosamente (0 linhas
            // afetadas, sem erro) passaria por "sucesso" mesmo sem apagar nada.
            const { data, error } = await supabase
                .from('campaigns')
                .delete()
                .eq('id', id)
                .select('id');

            if (error) throw error;
            if (!data || data.length === 0) {
                throw new Error('Nenhuma campanha foi apagada -- você pode não ter permissão para excluir este item.');
            }
            return id;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['campaigns'] });
            toast.success('Campanha excluída!');
        },
        onError: (error: any) => {
            console.error('Error deleting campaign:', error);
            toast.error(`Erro ao excluir campanha: ${error?.message || 'Erro interno'}`);
        },
    });
}

export function useUpdateCampaignPositions() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (updates: { id: string; position: number }[]) => {
            const promises = updates.map(update =>
                supabase
                    .from('campaigns')
                    .update({ position: update.position } as never)
                    .eq('id', update.id)
            );

            const results = await Promise.all(promises);
            const firstError = results.find(r => r.error)?.error;
            if (firstError) throw firstError;
        },
        onError: (error: any) => {
            console.error('Error updating campaign positions:', error);
            if (error?.code === '42703') {
                toast.error('Coluna "position" não encontrada no banco de dados. A ordem não será persistida.');
            } else {
                toast.error('Erro ao atualizar ordem das campanhas');
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['campaigns'] });
        },
    });
}
