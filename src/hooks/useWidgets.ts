import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from './use-toast';

export interface Widget {
  id: string;
  organization_id: string;
  folder_id: string | null;
  workspace_id: string | null;
  name: string;
  description: string | null;
  is_active: boolean;
  
  // Button config
  button_text: string;
  button_color: string;
  button_text_color: string;
  button_size: string;
  button_position: string;
  button_border_radius: number;
  button_icon: string | null;
  
  // Form config
  form_title: string;
  form_subtitle: string | null;
  form_background_color: string;
  form_text_color: string;
  form_accent_color: string;
  form_background_image: string | null;
  form_logo_url: string | null;
  
  // Fields config
  field_name_enabled: boolean;
  field_name_required: boolean;
  field_email_enabled: boolean;
  field_email_required: boolean;
  field_cpf_enabled: boolean;
  field_cpf_required: boolean;
  field_whatsapp_enabled: boolean;
  field_whatsapp_required: boolean;
  
  // Integration config
  integration_type: 'register_only' | 'send_message' | 'trigger_flow';
  message_template: string | null;
  flow_id: string | null;
  tag_ids: string[];
  auto_create_conversation: boolean;
  
  // Pixel config
  pixel_enabled: boolean;
  pixel_code: string | null;
  pixel_event_name: string | null;
  
  // Success config
  success_message: string;
  success_redirect_url: string | null;
  
  created_by: string | null;
  created_at: string;
  updated_at: string;
  
  // Relations
  custom_fields?: WidgetCustomField[];
}

export interface WidgetCustomField {
  id: string;
  widget_id: string;
  field_label: string;
  field_type: 'text' | 'select' | 'checkbox' | 'textarea';
  field_options: string[] | null;
  field_placeholder: string | null;
  is_required: boolean;
  field_order: number;
  created_at: string;
}

export interface WidgetFolder {
  id: string;
  organization_id: string;
  name: string;
  parent_id: string | null;
  workspace_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface WidgetSubmission {
  id: string;
  widget_id: string;
  organization_id: string;
  contact_id: string | null;
  conversation_id: string | null;
  submitted_name: string | null;
  submitted_email: string | null;
  submitted_cpf: string | null;
  submitted_whatsapp: string;
  custom_fields_data: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  referrer_url: string | null;
  page_url: string | null;
  status: string;
  processed_at: string | null;
  error_message: string | null;
  created_at: string;
}

// Fetch all widgets
export function useWidgets() {
  const { session } = useAuth();
  
  return useQuery({
    queryKey: ['widgets'],
    queryFn: async (): Promise<Widget[]> => {
      const { data, error } = await supabase
        .from('widgets')
        .select(`
          *,
          custom_fields:widget_custom_fields(*)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as Widget[];
    },
    enabled: !!session,
  });
}

// Fetch single widget
export function useWidget(widgetId: string | null) {
  const { session } = useAuth();
  
  return useQuery({
    queryKey: ['widget', widgetId],
    queryFn: async (): Promise<Widget | null> => {
      if (!widgetId) return null;
      
      const { data, error } = await supabase
        .from('widgets')
        .select(`
          *,
          custom_fields:widget_custom_fields(*)
        `)
        .eq('id', widgetId)
        .maybeSingle();

      if (error) throw error;
      return data as unknown as Widget | null;
    },
    enabled: !!session && !!widgetId,
  });
}

// Create widget
export function useCreateWidget() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  
  return useMutation({
    mutationFn: async (data: Partial<Widget>) => {
      if (!profile?.organization_id) throw new Error('No organization');
      
      const insertData: Record<string, unknown> = {
        name: data.name || 'Novo Form',
        organization_id: profile.organization_id,
        created_by: profile.id,
        folder_id: data.folder_id || null,
        workspace_id: data.workspace_id || null,
      };
      
      const { data: widget, error } = await supabase
        .from('widgets')
        .insert(insertData as never)
        .select()
        .single();

      if (error) throw error;
      return widget;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['widgets'] });
      toast({
        title: 'Form criado',
        description: 'O form foi criado com sucesso.',
      });
    },
    onError: () => {
      toast({
        title: 'Erro ao criar',
        description: 'Não foi possível criar o form.',
        variant: 'destructive',
      });
    },
  });
}

// Update widget
export function useUpdateWidget() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Widget> }) => {
      // Strip relational/non-column fields before sending to Supabase
      const { custom_fields, ...updateData } = data as any;
      
      const { error } = await supabase
        .from('widgets')
        .update(updateData)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['widgets'] });
      queryClient.invalidateQueries({ queryKey: ['widget', variables.id] });
      toast({
        title: 'Form atualizado',
        description: 'As alterações foram salvas.',
      });
    },
    onError: () => {
      toast({
        title: 'Erro ao atualizar',
        description: 'Não foi possível salvar as alterações.',
        variant: 'destructive',
      });
    },
  });
}

// Delete widget
export function useDeleteWidget() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('widgets')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['widgets'] });
      toast({
        title: 'Form removido',
        description: 'O form foi removido com sucesso.',
      });
    },
    onError: () => {
      toast({
        title: 'Erro ao remover',
        description: 'Não foi possível remover o form.',
        variant: 'destructive',
      });
    },
  });
}

// Fetch widget folders
export function useWidgetFolders() {
  const { session } = useAuth();
  
  return useQuery({
    queryKey: ['widget-folders'],
    queryFn: async (): Promise<WidgetFolder[]> => {
      const { data, error } = await supabase
        .from('widget_folders')
        .select('*')
        .order('name');

      if (error) throw error;
      return (data || []) as WidgetFolder[];
    },
    enabled: !!session,
  });
}

// Create folder
export function useCreateWidgetFolder() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  
  return useMutation({
    mutationFn: async ({ name, workspaceId }: { name: string; workspaceId?: string | null }) => {
      if (!profile?.organization_id) throw new Error('No organization');
      
      const { data, error } = await supabase
        .from('widget_folders')
        .insert({
          name,
          organization_id: profile.organization_id,
          workspace_id: workspaceId || null,
        } as never)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['widget-folders'] });
      toast({
        title: 'Pasta criada',
        description: 'A pasta foi criada com sucesso.',
      });
    },
    onError: () => {
      toast({
        title: 'Erro ao criar pasta',
        description: 'Não foi possível criar a pasta.',
        variant: 'destructive',
      });
    },
  });
}

// Delete folder
export function useDeleteWidgetFolder() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('widget_folders')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['widget-folders'] });
      toast({
        title: 'Pasta removida',
        description: 'A pasta foi removida com sucesso.',
      });
    },
    onError: () => {
      toast({
        title: 'Erro ao remover',
        description: 'Não foi possível remover a pasta.',
        variant: 'destructive',
      });
    },
  });
}

// Manage custom fields
export function useUpdateWidgetCustomFields() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ widgetId, fields }: { widgetId: string; fields: Partial<WidgetCustomField>[] }) => {
      // Delete existing
      await supabase
        .from('widget_custom_fields')
        .delete()
        .eq('widget_id', widgetId);
      
      // Insert new - filter out fields without labels
      const validFields = fields.filter(f => f.field_label && f.field_label.trim() !== '');
      
      if (validFields.length > 0) {
        const insertData = validFields.map((f, i) => ({
          widget_id: widgetId,
          field_label: f.field_label!,
          field_type: f.field_type || 'text',
          field_options: f.field_options || null,
          field_placeholder: f.field_placeholder || null,
          is_required: f.is_required || false,
          field_order: i,
        }));
        
        const { error } = await supabase
          .from('widget_custom_fields')
          .insert(insertData);
        if (error) throw error;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['widget', variables.widgetId] });
      queryClient.invalidateQueries({ queryKey: ['widgets'] });
    },
  });
}

// Fetch submissions for a widget
export function useWidgetSubmissions(widgetId: string | null) {
  const { session } = useAuth();
  
  return useQuery({
    queryKey: ['widget-submissions', widgetId],
    queryFn: async (): Promise<WidgetSubmission[]> => {
      if (!widgetId) return [];
      
      const { data, error } = await supabase
        .from('widget_submissions')
        .select('*')
        .eq('widget_id', widgetId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      return (data || []) as WidgetSubmission[];
    },
    enabled: !!session && !!widgetId,
  });
}
