import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export interface SignerFieldMapping {
  name?: string;
  email?: string;
  cpf?: string;
  phone?: string;
}

export interface DocumentSigner {
  id: string;
  organization_id: string;
  generated_document_id: string;
  pack_id: string | null;
  signature_id: string | null;
  signer_name: string;
  signer_email: string | null;
  signer_phone: string | null;
  signer_cpf: string | null;
  signer_role: string | null;
  signing_method: string;
  auth_methods: {
    manuscrita?: boolean;
    otp_email?: boolean;
    otp_sms?: boolean;
    otp_whatsapp?: boolean;
    selfie?: boolean;
    cpf_simples?: boolean;
  };
  status: string;
  signature_token: string | null;
  signed_at: string | null;
  sent_at: string | null;
  order: number;
  metadata: Record<string, any>;
  data_source: 'manual' | 'form';
  field_mapping: SignerFieldMapping;
  created_at: string;
  updated_at: string;
}

export interface SignerInput {
  signer_name: string;
  signer_email?: string;
  signer_phone?: string;
  signer_cpf?: string;
  signer_role?: string;
  auth_methods?: DocumentSigner['auth_methods'];
  data_source?: 'manual' | 'form';
  field_mapping?: SignerFieldMapping;
}

export function useDocumentSigners(documentId: string | null) {
  return useQuery({
    queryKey: ['document-signers', documentId],
    queryFn: async () => {
      if (!documentId) return [];
      const { data, error } = await (supabase as any)
        .from('document_signers')
        .select('*')
        .eq('generated_document_id', documentId)
        .order('order', { ascending: true });
      if (error) throw error;
      return data as DocumentSigner[];
    },
    enabled: !!documentId,
  });
}

export function useCreateSigners() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({
      documentIds,
      packId,
      signers,
      signing_method,
    }: {
      documentIds: string[];
      packId?: string | null;
      signers: SignerInput[];
      signing_method: string;
    }) => {
      const orgId = profile!.organization_id;
      const rows: any[] = [];
      documentIds.forEach((docId) => {
        signers.forEach((s, idx) => {
          rows.push({
            organization_id: orgId,
            generated_document_id: docId,
            pack_id: packId || null,
            signer_name: s.signer_name,
            signer_email: s.signer_email || null,
            signer_phone: s.signer_phone || null,
            signer_cpf: s.signer_cpf || null,
            signer_role: s.signer_role || 'Assinar',
            signing_method,
            auth_methods: s.auth_methods || { manuscrita: true },
            signature_token: crypto.randomUUID(),
            order: idx,
            status: 'pending',
            data_source: s.data_source || 'manual',
            field_mapping: s.field_mapping || {},
          });
        });
      });
      if (rows.length === 0) return [];
      const { data, error } = await (supabase as any)
        .from('document_signers')
        .insert(rows)
        .select();
      if (error) throw error;
      return data as DocumentSigner[];
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['document-signers'] });
      queryClient.invalidateQueries({ queryKey: ['generated-documents'] });
      if (data.length > 0) {
        toast.success(`${data.length} signatário(s) configurado(s)`);
      }
    },
    onError: (e: any) => {
      toast.error('Erro ao adicionar signatários: ' + (e.message || ''));
    },
  });
}

export function useDeleteSigner() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('document_signers')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-signers'] });
    },
  });
}
