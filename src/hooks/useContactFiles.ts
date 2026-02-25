import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface ContactFolder {
  id: string;
  contact_id: string;
  organization_id: string;
  name: string;
  created_by: string | null;
  created_at: string;
  _count?: {
    files: number;
  };
}

export interface ContactFile {
  id: string;
  contact_id: string;
  folder_id: string | null;
  organization_id: string;
  message_id: string | null;
  name: string;
  file_url: string;
  file_type: 'image' | 'video' | 'audio' | 'document';
  file_size: number | null;
  storage_path: string | null;
  created_by: string | null;
  created_at: string;
  folder?: ContactFolder | null;
}

// Folders
export function useContactFolders(contactId: string | null) {
  return useQuery({
    queryKey: ['contact-folders', contactId],
    queryFn: async () => {
      if (!contactId) return [];
      
      const { data, error } = await supabase
        .from('contact_folders')
        .select('*')
        .eq('contact_id', contactId)
        .order('name');
      
      if (error) throw error;
      return data as ContactFolder[];
    },
    enabled: !!contactId,
  });
}

export function useCreateContactFolder() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ contactId, name }: { contactId: string; name: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const { data: profile } = await supabase
        .from('profiles')
        .select('id, organization_id')
        .eq('user_id', user.id)
        .single();

      if (!profile) throw new Error('Perfil não encontrado');

      const { data, error } = await supabase
        .from('contact_folders')
        .insert({
          contact_id: contactId,
          organization_id: profile.organization_id,
          name,
          created_by: profile.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['contact-folders', variables.contactId] });
      toast({
        title: 'Pasta criada',
        description: 'A pasta foi criada com sucesso.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao criar pasta',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useDeleteContactFolder() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ folderId, contactId }: { folderId: string; contactId: string }) => {
      const { error } = await supabase
        .from('contact_folders')
        .delete()
        .eq('id', folderId);

      if (error) throw error;
      return { contactId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['contact-folders', data.contactId] });
      queryClient.invalidateQueries({ queryKey: ['contact-files', data.contactId] });
      toast({
        title: 'Pasta removida',
        description: 'A pasta foi removida com sucesso.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao remover pasta',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Files
export function useContactFiles(contactId: string | null, folderId?: string | null) {
  return useQuery({
    queryKey: ['contact-files', contactId, folderId],
    queryFn: async () => {
      if (!contactId) return [];
      
      let query = supabase
        .from('contact_files')
        .select(`
          *,
          folder:contact_folders(id, name)
        `)
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false });
      
      if (folderId !== undefined) {
        if (folderId === null) {
          query = query.is('folder_id', null);
        } else {
          query = query.eq('folder_id', folderId);
        }
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      return data as ContactFile[];
    },
    enabled: !!contactId,
  });
}

export function useAddContactFile() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: {
      contactId: string;
      folderId?: string | null;
      messageId?: string | null;
      name: string;
      fileUrl: string;
      fileType: 'image' | 'video' | 'audio' | 'document';
      fileSize?: number | null;
      storagePath?: string | null;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const { data: profile } = await supabase
        .from('profiles')
        .select('id, organization_id')
        .eq('user_id', user.id)
        .single();

      if (!profile) throw new Error('Perfil não encontrado');

      const { data, error } = await supabase
        .from('contact_files')
        .insert({
          contact_id: params.contactId,
          folder_id: params.folderId || null,
          organization_id: profile.organization_id,
          message_id: params.messageId || null,
          name: params.name,
          file_url: params.fileUrl,
          file_type: params.fileType,
          file_size: params.fileSize || null,
          storage_path: params.storagePath || null,
          created_by: profile.id,
        })
        .select()
        .single();

      if (error) throw error;
      return { ...data, contactId: params.contactId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['contact-files', data.contactId] });
      toast({
        title: 'Arquivo arquivado',
        description: 'O arquivo foi salvo no perfil do contato.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao arquivar arquivo',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useMoveContactFile() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ fileId, folderId, contactId }: { fileId: string; folderId: string | null; contactId: string }) => {
      const { error } = await supabase
        .from('contact_files')
        .update({ folder_id: folderId })
        .eq('id', fileId);

      if (error) throw error;
      return { contactId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['contact-files', data.contactId] });
      toast({
        title: 'Arquivo movido',
        description: 'O arquivo foi movido para a pasta.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao mover arquivo',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useDeleteContactFile() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ fileId, contactId, storagePath }: { fileId: string; contactId: string; storagePath?: string | null }) => {
      // Delete from storage if there's a storage path
      if (storagePath) {
        await supabase.storage
          .from('contact-files')
          .remove([storagePath]);
      }

      const { error } = await supabase
        .from('contact_files')
        .delete()
        .eq('id', fileId);

      if (error) throw error;
      return { contactId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['contact-files', data.contactId] });
      toast({
        title: 'Arquivo removido',
        description: 'O arquivo foi removido.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao remover arquivo',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Upload file to storage
export async function uploadContactFile(file: File, contactId: string): Promise<{ url: string; path: string } | null> {
  const ext = file.name.split('.').pop() || 'bin';
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 8);
  const fileName = `${contactId}/${timestamp}-${randomId}.${ext}`;

  const { data, error } = await supabase.storage
    .from('contact-files')
    .upload(fileName, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (error) {
    console.error('Upload error:', error);
    return null;
  }

  const { data: urlData } = supabase.storage
    .from('contact-files')
    .getPublicUrl(data.path);

  return {
    url: urlData.publicUrl,
    path: data.path,
  };
}

// Helper to determine file type
export function getFileType(mimeType: string, fileName: string): 'image' | 'video' | 'audio' | 'document' {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'document';
}
