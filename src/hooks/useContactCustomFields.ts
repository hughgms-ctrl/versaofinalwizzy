import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from './use-toast';

export type ContactCustomFieldType = 'text' | 'number' | 'date' | 'boolean';

export interface ContactCustomField {
  id: string;
  organization_id: string;
  /** Nome usado como {{key}} nos fluxos. */
  key: string;
  label: string;
  type: ContactCustomFieldType;
  created_at: string;
  updated_at: string;
}

/**
 * Converte um rótulo livre ("Mensagem Personalizada", "E-mail secundário") na
 * chave usada como variável de fluxo ("mensagem_personalizada").
 *
 * O motor (flow-execute) só substitui {{...}} quando o miolo casa com \w+, então
 * a chave não pode ter espaço, acento, ponto ou hífen — senão o campo seria
 * gravado mas nunca apareceria na mensagem enviada.
 */
export function slugifyFieldKey(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_')
    .replace(/^([0-9])/, 'campo_$1'); // a chave precisa começar com letra
}

/** Mesma validação do CHECK da tabela, para errar cedo na UI. */
export function isValidFieldKey(key: string): boolean {
  return /^[a-z][a-z0-9_]*$/.test(key);
}

export function useContactCustomFields() {
  const { session } = useAuth();

  return useQuery({
    queryKey: ['contact-custom-fields'],
    queryFn: async (): Promise<ContactCustomField[]> => {
      const { data, error } = await supabase
        .from('contact_custom_fields' as any)
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data || []) as unknown as ContactCustomField[];
    },
    enabled: !!session,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateContactCustomField() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (field: {
      label: string;
      key?: string;
      type?: ContactCustomFieldType;
    }): Promise<ContactCustomField> => {
      if (!profile?.organization_id) throw new Error('Organização não encontrada');

      const label = field.label.trim();
      if (!label) throw new Error('Informe o nome do campo');

      const key = (field.key || slugifyFieldKey(label)).trim();
      if (!isValidFieldKey(key)) {
        throw new Error('Nome inválido: use apenas letras minúsculas, números e _ (começando com letra).');
      }

      const { data, error } = await supabase
        .from('contact_custom_fields' as any)
        .insert({
          organization_id: profile.organization_id,
          key,
          label,
          type: field.type || 'text',
        })
        .select()
        .single();

      if (error) {
        if ((error as { code?: string }).code === '23505') {
          throw new Error(`Já existe um campo com a chave "${key}".`);
        }
        throw error;
      }
      return data as unknown as ContactCustomField;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-custom-fields'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao criar campo',
        description: error.message || 'Não foi possível criar o campo.',
        variant: 'destructive',
      });
    },
  });
}

export function useDeleteContactCustomField() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // Só apaga a definição; os valores já gravados em contacts.metadata
      // permanecem (não vale varrer a tabela inteira de contatos por isso).
      const { error } = await supabase
        .from('contact_custom_fields' as any)
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-custom-fields'] });
      toast({ title: 'Campo removido' });
    },
    onError: () => {
      toast({
        title: 'Erro ao remover',
        description: 'Não foi possível remover o campo.',
        variant: 'destructive',
      });
    },
  });
}
