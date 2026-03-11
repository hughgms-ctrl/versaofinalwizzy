import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

export interface DocumentTemplate {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  category: string | null;
  content: string;
  fields: Array<{ name: string; label: string; type: string; required: boolean }>;
  original_file_url: string | null;
  workspace_id: string | null;
  created_by: string | null;
  auto_send_whatsapp?: boolean;
  created_at: string;
  updated_at: string;
}

export function useDocumentTemplates() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;

  return useQuery({
    queryKey: ['document-templates', orgId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('document_templates')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as DocumentTemplate[];
    },
    enabled: !!orgId,
  });
}

export function useCreateDocumentTemplate() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (template: {
      name: string;
      description?: string;
      category?: string;
      content: string;
      fields: any[];
      original_file_url?: string;
      auto_send_whatsapp?: boolean;
    }) => {
      const { data, error } = await (supabase as any)
        .from('document_templates')
        .insert({
          ...template,
          organization_id: profile!.organization_id,
          created_by: profile!.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data as DocumentTemplate;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-templates'] });
      toast({ title: 'Template criado com sucesso' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao criar template', description: error.message, variant: 'destructive' });
    },
  });
}

export function useUpdateDocumentTemplate() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<DocumentTemplate> & { id: string }) => {
      const { data, error } = await (supabase as any)
        .from('document_templates')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as DocumentTemplate;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-templates'] });
      toast({ title: 'Template atualizado' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao atualizar template', description: error.message, variant: 'destructive' });
    },
  });
}

export function useDeleteDocumentTemplate() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      // First get generated documents linked to this template
      const { data: genDocs } = await (supabase as any)
        .from('generated_documents')
        .select('id')
        .eq('template_id', id);

      // Delete signatures for each generated document
      if (genDocs && genDocs.length > 0) {
        const genDocIds = genDocs.map((d: any) => d.id);
        await (supabase as any)
          .from('document_signatures')
          .delete()
          .in('generated_document_id', genDocIds);
      }

      // Delete generated documents linked to this template
      await (supabase as any)
        .from('generated_documents')
        .delete()
        .eq('template_id', id);

      // Now delete the template
      const { error } = await (supabase as any)
        .from('document_templates')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-templates'] });
      toast({ title: 'Template excluído' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao excluir template', description: error.message, variant: 'destructive' });
    },
  });
}
