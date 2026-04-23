import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from './use-toast';

export interface FAQItem {
  question: string;
  answer: string;
}

export interface OrganizationKnowledge {
  organization_id: string;
  company_name: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  hours: string | null;
  payment_methods: string | null;
  tone_of_voice: string | null;
  differentials: string | null;
  about: string | null;
  faqs: FAQItem[];
  custom_fields: Record<string, string>;
  created_at?: string;
  updated_at?: string;
}

const EMPTY: Omit<OrganizationKnowledge, 'organization_id'> = {
  company_name: '',
  website: '',
  phone: '',
  email: '',
  address: '',
  hours: '',
  payment_methods: '',
  tone_of_voice: '',
  differentials: '',
  about: '',
  faqs: [],
  custom_fields: {},
};

export function useOrganizationKnowledge() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;

  return useQuery({
    queryKey: ['organization-knowledge', orgId],
    queryFn: async (): Promise<OrganizationKnowledge | null> => {
      if (!orgId) return null;
      const { data, error } = await supabase
        .from('organization_knowledge' as any)
        .select('*')
        .eq('organization_id', orgId)
        .maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
      if (!data) {
        return { organization_id: orgId, ...EMPTY } as OrganizationKnowledge;
      }
      const row = data as any;
      return {
        ...row,
        faqs: Array.isArray(row.faqs) ? row.faqs : [],
        custom_fields:
          row.custom_fields && typeof row.custom_fields === 'object' ? row.custom_fields : {},
      } as OrganizationKnowledge;
    },
    enabled: !!orgId,
  });
}

export function useUpsertOrganizationKnowledge() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const orgId = profile?.organization_id;

  return useMutation({
    mutationFn: async (payload: Partial<OrganizationKnowledge>) => {
      if (!orgId) throw new Error('Sem organização');
      const row = {
        organization_id: orgId,
        company_name: payload.company_name ?? null,
        website: payload.website ?? null,
        phone: payload.phone ?? null,
        email: payload.email ?? null,
        address: payload.address ?? null,
        hours: payload.hours ?? null,
        payment_methods: payload.payment_methods ?? null,
        tone_of_voice: payload.tone_of_voice ?? null,
        differentials: payload.differentials ?? null,
        about: payload.about ?? null,
        faqs: payload.faqs ?? [],
        custom_fields: payload.custom_fields ?? {},
      };
      const { data, error } = await supabase
        .from('organization_knowledge' as any)
        .upsert(row, { onConflict: 'organization_id' })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-knowledge', orgId] });
      toast({ title: 'Base de conhecimento salva' });
    },
    onError: (err: any) => {
      toast({
        title: 'Erro ao salvar',
        description: err.message,
        variant: 'destructive',
      });
    },
  });
}
