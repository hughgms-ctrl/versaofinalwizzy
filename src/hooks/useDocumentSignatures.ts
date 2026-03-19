import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

export interface DocumentSignature {
  id: string;
  organization_id: string;
  generated_document_id: string;
  contact_id: string | null;
  conversation_id: string | null;
  signer_name: string | null;
  signer_email: string | null;
  signer_phone: string | null;
  signer_cpf: string | null;
  signing_method: string;
  status: string;
  signature_url: string | null;
  signed_pdf_url: string | null;
  external_id: string | null;
  metadata: Record<string, any>;
  sent_at: string | null;
  signed_at: string | null;
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // joined
  generated_document?: {
    id: string;
    name: string;
    pdf_url: string | null;
    status: string;
  };
}

export function useDocumentSignatures() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;

  return useQuery({
    queryKey: ['document-signatures', orgId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('document_signatures')
        .select('*, generated_document:generated_documents(id, name, pdf_url, status)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as DocumentSignature[];
    },
    enabled: !!orgId,
  });
}

export function useCreateSignatureRequest() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: {
      generated_document_id: string;
      signing_method: string;
      signer_name?: string;
      signer_email?: string;
      signer_phone?: string;
      signer_cpf?: string;
      contact_id?: string;
      conversation_id?: string;
    }) => {
      const orgId = profile!.organization_id;
      
      // Generate signature URL
      let signatureUrl: string | null = null;
      const signatureToken = crypto.randomUUID();
      
      if (params.signing_method === 'internal' || params.signing_method === 'govbr') {
        const baseUrl = window.location.origin;
        signatureUrl = `${baseUrl}/sign/${signatureToken}`;
      }

      const { data, error } = await (supabase as any)
        .from('document_signatures')
        .insert({
          organization_id: orgId,
          generated_document_id: params.generated_document_id,
          signing_method: params.signing_method,
          signer_name: params.signer_name,
          signer_email: params.signer_email,
          signer_phone: params.signer_phone,
          signer_cpf: params.signer_cpf,
          contact_id: params.contact_id,
          conversation_id: params.conversation_id,
          signature_url: signatureUrl,
          status: 'pending',
          created_by: profile!.id,
        })
        .select()
        .single();
      if (error) throw error;

      // Update generated_document signing fields
      await (supabase as any)
        .from('generated_documents')
        .update({
          signing_method: params.signing_method,
          signing_status: 'pending',
        })
        .eq('id', params.generated_document_id);

      return data as DocumentSignature;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-signatures'] });
      queryClient.invalidateQueries({ queryKey: ['generated-documents'] });
      toast({ title: 'Solicitação de assinatura criada' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao criar solicitação', description: error.message, variant: 'destructive' });
    },
  });
}

export function useUpdateSignatureStatus() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, status, signed_pdf_url }: { id: string; status: string; signed_pdf_url?: string }) => {
      const updates: any = { status };
      if (status === 'signed') updates.signed_at = new Date().toISOString();
      if (status === 'sent') updates.sent_at = new Date().toISOString();
      if (signed_pdf_url) updates.signed_pdf_url = signed_pdf_url;

      const { data, error } = await (supabase as any)
        .from('document_signatures')
        .update(updates)
        .eq('id', id)
        .select('*, generated_document:generated_documents(id)')
        .single();
      if (error) throw error;

      // Sync status to generated_documents
      if (data.generated_document?.id) {
        await (supabase as any)
          .from('generated_documents')
          .update({ signing_status: status })
          .eq('id', data.generated_document.id);
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-signatures'] });
      queryClient.invalidateQueries({ queryKey: ['generated-documents'] });
      toast({ title: 'Status atualizado' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao atualizar status', description: error.message, variant: 'destructive' });
    },
  });
}
