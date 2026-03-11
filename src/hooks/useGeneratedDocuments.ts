import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export interface GeneratedDocument {
  id: string;
  organization_id: string;
  template_id: string | null;
  pack_id: string | null;
  contact_id: string | null;
  conversation_id: string | null;
  name: string;
  filled_data: Record<string, any>;
  pdf_url: string | null;
  status: string;
  signing_method: string | null;
  signing_status: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ... keep existing code

export function useRegenerateDocumentPdf() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (doc: GeneratedDocument) => {
      // Get template content
      let templateContent = '';
      if (doc.template_id) {
        const { data: template } = await (supabase as any)
          .from('document_templates')
          .select('content')
          .eq('id', doc.template_id)
          .single();
        templateContent = template?.content || '';
      }

      // Call the edge function
      const { data, error } = await supabase.functions.invoke('generate-document-pdf', {
        body: {
          template_content: templateContent,
          filled_data: doc.filled_data,
          document_name: doc.name,
        },
      });
      if (error) throw error;

      // Update the document with the new pdf_url
      const { error: updateError } = await (supabase as any)
        .from('generated_documents')
        .update({ pdf_url: data.pdf_url })
        .eq('id', doc.id);
      if (updateError) throw updateError;

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['generated-documents'] });
      toast.success('PDF regenerado com sucesso');
    },
    onError: (err: any) => {
      toast.error('Erro ao regenerar PDF: ' + (err.message || 'erro desconhecido'));
    },
  });
}

export interface GeneratedDocument {
  id: string;
  organization_id: string;
  template_id: string | null;
  pack_id: string | null;
  contact_id: string | null;
  conversation_id: string | null;
  name: string;
  filled_data: Record<string, any>;
  pdf_url: string | null;
  status: string;
  signing_method: string | null;
  signing_status: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function useGeneratedDocuments() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;

  return useQuery({
    queryKey: ['generated-documents', orgId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('generated_documents')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as GeneratedDocument[];
    },
    enabled: !!orgId,
  });
}

export function useDeleteGeneratedDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // First delete related signatures
      await (supabase as any)
        .from('document_signatures')
        .delete()
        .eq('generated_document_id', id);
      
      // Then delete the document
      const { error } = await (supabase as any)
        .from('generated_documents')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['generated-documents'] });
    },
  });
}
