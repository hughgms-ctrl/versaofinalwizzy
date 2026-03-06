import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
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
    start_hour: number;
    end_hour: number;
    pending_count?: number; // Virtual field calculated in query or elsewhere
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

    return useQuery({
        queryKey: ['campaigns', currentOrganizationId],
        queryFn: async () => {
            if (!currentOrganizationId) return [];

            const { data, error } = await supabase
                .from('campaigns')
                .select(`
                  *,
                  flow:flows(id, name),
                  pending_count:campaign_queue(count)
                `)
                .eq('organization_id', currentOrganizationId)
                .order('created_at', { ascending: false });

            if (error) throw error;

            // Map the pending_count from the joined count query
            const mappedData = (data || []).map((c: any) => ({
                ...c,
                pending_count: c.pending_count?.[0]?.count || 0
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
            const { error } = await supabase
                .from('campaigns')
                .delete()
                .eq('id', id);

            if (error) throw error;
            return id;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['campaigns'] });
            toast.success('Campanha excluída!');
        },
        onError: (error) => {
            console.error('Error deleting campaign:', error);
            toast.error('Erro ao excluir campanha');
        },
    });
}
