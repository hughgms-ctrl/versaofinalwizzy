import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export interface TemplateFixedSigner {
  id: string;
  organization_id: string;
  template_id: string;
  signer_name: string;
  signer_email: string | null;
  signer_phone: string | null;
  signer_cpf: string | null;
  signer_role: string | null;
  auth_methods: {
    manuscrita?: boolean;
    otp_email?: boolean;
    otp_whatsapp?: boolean;
    selfie?: boolean;
  };
  order: number;
  created_at: string;
  updated_at: string;
}

export type TemplateFixedSignerInput = Omit<
  TemplateFixedSigner,
  'id' | 'organization_id' | 'template_id' | 'created_at' | 'updated_at'
>;

export function useTemplateFixedSigners(templateId: string | null | undefined) {
  return useQuery({
    queryKey: ['template-fixed-signers', templateId],
    queryFn: async () => {
      if (!templateId) return [];
      const { data, error } = await (supabase as any)
        .from('template_fixed_signers')
        .select('*')
        .eq('template_id', templateId)
        .order('order', { ascending: true });
      if (error) throw error;
      return data as TemplateFixedSigner[];
    },
    enabled: !!templateId,
  });
}

export function useUpsertTemplateFixedSigner() {
  const qc = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (params: {
      id?: string;
      template_id: string;
      data: TemplateFixedSignerInput;
    }) => {
      if (params.id) {
        const { error } = await (supabase as any)
          .from('template_fixed_signers')
          .update(params.data)
          .eq('id', params.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from('template_fixed_signers')
          .insert({
            organization_id: profile!.organization_id,
            template_id: params.template_id,
            ...params.data,
          });
        if (error) throw error;
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['template-fixed-signers', vars.template_id] });
    },
    onError: (e: any) => {
      toast.error('Não foi possível salvar o signatário. Tente novamente.');
      console.error(e);
    },
  });
}

export function useDeleteTemplateFixedSigner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('template_fixed_signers')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['template-fixed-signers'] });
    },
    onError: () => toast.error('Não foi possível remover.'),
  });
}
