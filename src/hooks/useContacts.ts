import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from './use-toast';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';

export interface Contact {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  avatar_url: string | null;
  organization_id: string;
  workspace_id?: string | null;
  created_at: string;
  updated_at: string;
  metadata: {
    note?: string;
    description?: string;
    /** Campos personalizados da org: gravados pela IA (save_contact_field), pela importação e pelo fluxo. */
    custom_fields?: Record<string, string | number | boolean | null>;
  } | null;
  tags?: {
    id: string;
    tag: {
      id: string;
      name: string;
      color: string;
    };
  }[];
}

// Cap server-side usado por consumidores que precisam da lista inteira de uma vez
// (ex.: seletor de participantes de grupo). A página de contatos usa
// useInfiniteContacts, que pagina sob demanda.
export const CONTACTS_CAP = 1000;

// Tamanho de cada página do scroll infinito da página de contatos.
export const CONTACTS_PAGE_SIZE = 100;

const CONTACT_SELECT = `
  *,
  tags:contact_tags(
    id,
    tag:tags(id, name, color)
  )
`;

function applyWorkspaceFilter<T extends { is: any; eq: any }>(query: T, selectedWorkspaceId: string | null | undefined): T {
  if (!selectedWorkspaceId) return query;
  if (selectedWorkspaceId === 'unassigned') return query.is('workspace_id', null);
  return query.eq('workspace_id', selectedWorkspaceId);
}

// Escapa os caracteres que o PostgREST usa como separadores dentro de `or(...)`
// e os curingas do LIKE, pra que uma busca com vírgula/parêntese/% não quebre o
// filtro (ou vaze como curinga).
function escapeSearchTerm(term: string): string {
  return term.replace(/[\\%_]/g, m => `\\${m}`).replace(/[(),]/g, ' ');
}

/**
 * Filtro por valor de campo personalizado, aplicado NO SERVIDOR.
 *
 * Os outros filtros avançados rodam no cliente, sobre as páginas já carregadas
 * -- é o que a própria tela avisa. Para campo personalizado isso não serve: a
 * pergunta é justamente "quem, na base inteira, respondeu X", e a resposta não
 * pode depender de quanto a pessoa rolou a lista.
 *
 * O valor mora em contacts.metadata.custom_fields, então dá para filtrar em SQL
 * pelo caminho jsonb -- que é o que faz a diferença entre alcançar a base
 * inteira e alcançar as 100 primeiras linhas.
 */
export interface CustomFieldFilter {
  key: string;
  operator: 'is' | 'is_not' | 'contains' | 'is_empty' | 'is_not_empty';
  value: string;
}

/** Aspas para um valor dentro de `or(...)`: vírgula e parêntese são separadores lá. */
function quoteForOr(value: string): string {
  return `"${value.replace(/["\\]/g, (m) => `\\${m}`)}"`;
}

function applyCustomFieldFilters<T>(query: T, filters: CustomFieldFilter[]): T {
  let q = query as any;

  for (const f of filters) {
    // A chave já passou pelo CHECK de contact_custom_fields.key (\w+) na
    // criação, mas quem monta o path aqui é este código -- confere de novo em
    // vez de confiar, senão uma chave torta viraria um path quebrado.
    if (!/^\w+$/.test(f.key)) continue;
    const path = `metadata->custom_fields->>${f.key}`;

    switch (f.operator) {
      case 'is':
        q = q.eq(path, f.value);
        break;
      case 'is_not':
        // Quem NÃO tem o campo preenchido também "não é X" -- é o que a pessoa
        // quer dizer ao perguntar quem não respondeu tal coisa. Um neq puro
        // deixaria esses de fora, porque NULL <> 'x' é NULL, não true.
        q = q.or(`${path}.is.null,${path}.neq.${quoteForOr(f.value)}`);
        break;
      case 'contains':
        q = q.ilike(path, `%${f.value.replace(/[\\%_]/g, (m) => `\\${m}`)}%`);
        break;
      case 'is_empty':
        q = q.or(`${path}.is.null,${path}.eq.${quoteForOr('')}`);
        break;
      case 'is_not_empty':
        q = q.not(path, 'is', null).neq(path, '');
        break;
    }
  }

  return q as T;
}

/**
 * Lista paginada de contatos (scroll infinito). A busca por texto roda no
 * servidor pra alcançar a base inteira, não só as páginas já carregadas.
 */
export function useInfiniteContacts(searchTerm?: string, customFieldFilters: CustomFieldFilter[] = []) {
  const { session } = useAuth();
  const { selectedWorkspaceId } = useWorkspaceContext();
  const search = (searchTerm || '').trim();
  const cfKey = JSON.stringify(customFieldFilters);

  return useInfiniteQuery({
    queryKey: ['contacts', 'infinite', selectedWorkspaceId, search, cfKey],
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<Contact[]> => {
      const from = (pageParam as number) * CONTACTS_PAGE_SIZE;
      const to = from + CONTACTS_PAGE_SIZE - 1;

      let query = supabase
        .from('contacts')
        .select(CONTACT_SELECT)
        .order('created_at', { ascending: false })
        .range(from, to);

      query = applyWorkspaceFilter(query as any, selectedWorkspaceId) as any;
      query = applyCustomFieldFilters(query as any, customFieldFilters) as any;

      if (search) {
        const term = escapeSearchTerm(search);
        // Telefone é gravado só com dígitos; buscar "(11) 99999" deve achar.
        const digits = search.replace(/\D/g, '');
        const clauses = [
          `name.ilike.%${term}%`,
          `email.ilike.%${term}%`,
          `phone.ilike.%${digits || term}%`,
        ];
        query = query.or(clauses.join(','));
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data || []) as unknown as Contact[];
    },
    // Página cheia => provavelmente há mais; página curta => fim da lista.
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === CONTACTS_PAGE_SIZE ? allPages.length : undefined,
    enabled: !!session,
  });
}

/** Contagem total de contatos (respeita o workspace e a busca ativa). */
export function useContactsCount(searchTerm?: string, customFieldFilters: CustomFieldFilter[] = []) {
  const { session } = useAuth();
  const { selectedWorkspaceId } = useWorkspaceContext();
  const search = (searchTerm || '').trim();
  const cfKey = JSON.stringify(customFieldFilters);

  return useQuery({
    queryKey: ['contacts', 'count', selectedWorkspaceId, search, cfKey],
    queryFn: async (): Promise<number> => {
      let query = supabase
        .from('contacts')
        .select('id', { count: 'exact', head: true });

      query = applyWorkspaceFilter(query as any, selectedWorkspaceId) as any;
      query = applyCustomFieldFilters(query as any, customFieldFilters) as any;

      if (search) {
        const term = escapeSearchTerm(search);
        const digits = search.replace(/\D/g, '');
        query = query.or([
          `name.ilike.%${term}%`,
          `email.ilike.%${term}%`,
          `phone.ilike.%${digits || term}%`,
        ].join(','));
      }

      const { count, error } = await query;

      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!session,
  });
}

export function useContacts() {
  const { session } = useAuth();
  const { selectedWorkspaceId } = useWorkspaceContext();

  return useQuery({
    queryKey: ['contacts', selectedWorkspaceId],
    queryFn: async (): Promise<Contact[]> => {
      let query = supabase
        .from('contacts')
        .select(CONTACT_SELECT)
        .order('created_at', { ascending: false })
        .limit(CONTACTS_CAP);

      query = applyWorkspaceFilter(query as any, selectedWorkspaceId) as any;

      const { data, error } = await query;

      if (error) throw error;
      return (data || []) as unknown as Contact[];
    },
    enabled: !!session,
  });
}

export function useUpdateContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Contact> }) => {
      const { error } = await supabase
        .from('contacts')
        .update(data)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast({
        title: 'Contato atualizado',
        description: 'As informações do contato foram atualizadas.',
      });
    },
    onError: () => {
      toast({
        title: 'Erro ao atualizar',
        description: 'Não foi possível atualizar o contato.',
        variant: 'destructive',
      });
    },
  });
}

export function useCreateContact() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { selectedWorkspaceId } = useWorkspaceContext();

  return useMutation({
    mutationFn: async (data: Partial<Contact>) => {
      if (!profile?.organization_id) throw new Error('Organization ID is required');

      // Format phone: ensure it has country code '55' for BR assuming 10 or 11 digits
      let formattedPhone = data.phone;
      if (formattedPhone) {
        formattedPhone = formattedPhone.replace(/\D/g, '');
        if (formattedPhone.length === 10 || formattedPhone.length === 11) {
          formattedPhone = `55${formattedPhone}`;
        }
      }

      // Check if contact with this phone already exists
      if (formattedPhone) {
        const { data: existingContact } = await supabase
          .from('contacts')
          .select('id')
          .eq('phone', formattedPhone)
          .eq('organization_id', profile.organization_id)
          .limit(1)
          .maybeSingle();

        if (existingContact) {
          throw new Error('Já existe um contato com este telefone.');
        }
      }

      // Herda o workspace selecionado quando o chamador não informou um. Sem
      // isto o contato nasce com workspace_id null e some da própria lista que
      // acabou de criá-lo (a lista filtra por workspace), além de esbarrar na
      // policy de contacts, que exige workspace_id não nulo.
      const workspaceId =
        data.workspace_id !== undefined
          ? data.workspace_id
          : selectedWorkspaceId && selectedWorkspaceId !== 'unassigned'
            ? selectedWorkspaceId
            : null;

      const { data: newContact, error } = await supabase
        .from('contacts')
        .insert({
          ...data,
          phone: formattedPhone || data.phone, // use formatted if available
          organization_id: profile.organization_id,
          workspace_id: workspaceId,
        } as any)
        .select()
        .single();

      if (error) throw error;
      return newContact;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao criar',
        description: error.message || 'Não foi possível criar o contato.',
        variant: 'destructive',
      });
    },
  });
}

export function useDeleteContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // Delete conversations first to avoid foreign key constraint errors
      const { error: convError } = await supabase
        .from('conversations')
        .delete()
        .eq('contact_id', id);

      if (convError) console.error("Error deleting conversations:", convError);

      const { error } = await supabase
        .from('contacts')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast({
        title: 'Contato removido',
        description: 'O contato foi removido com sucesso.',
      });
    },
    onError: () => {
      toast({
        title: 'Erro ao remover',
        description: 'Não foi possível remover o contato.',
        variant: 'destructive',
      });
    },
  });
}
