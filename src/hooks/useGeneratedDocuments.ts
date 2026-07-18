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
  // joined (used to resolve which workspace this doc belongs to)
  document_packs?: { name: string; workspace_id: string | null } | null;
  document_templates?: { workspace_id: string | null } | null;
}

export function useGeneratedDocuments() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;

  return useQuery({
    queryKey: ['generated-documents', orgId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('generated_documents')
        .select('*, document_packs(name, workspace_id), document_templates(workspace_id)')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as GeneratedDocument[];
    },
    enabled: !!orgId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

export function useDeleteGeneratedDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await (supabase as any)
        .from('document_signatures')
        .delete()
        .eq('generated_document_id', id);
      
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

export function useRegenerateDocumentPdf() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (doc: GeneratedDocument) => {
      let templateContent = '';
      let templateContentHtml: string | null = null;
      let templateLogoUrl: string | null = null;
      let templateFields: any[] = [];
      if (doc.template_id) {
        const { data: template } = await (supabase as any)
          .from('document_templates')
          .select('content, content_html, logo_url, fields')
          .eq('id', doc.template_id)
          .single();
        templateContent = template?.content || '';
        templateContentHtml = template?.content_html || null;
        templateLogoUrl = template?.logo_url || null;
        templateFields = template?.fields || [];
      }

      const { data, error } = await supabase.functions.invoke('generate-document-pdf', {
        body: {
          template_content: templateContent,
          template_content_html: templateContentHtml,
          fields: templateFields,
          filled_data: doc.filled_data,
          document_name: doc.name,
          logo_url: templateLogoUrl,
        },
      });
      if (error) throw error;

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
