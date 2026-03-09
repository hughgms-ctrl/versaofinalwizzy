import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

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
