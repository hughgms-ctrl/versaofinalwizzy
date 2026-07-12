import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface ContactFilterJoins {
  // contact_id -> ids dos usuários responsáveis por alguma conversa desse contato
  assignedToByContact: Map<string, Set<string>>;
  // contact_id -> ids das colunas de pipeline onde alguma conversa desse contato está
  pipelineColumnsByContact: Map<string, Set<string>>;
}

// Contatos não têm pipeline/responsável diretamente — esses campos vivem nas conversas.
// Esse hook junta conversations + conversation_pipeline_positions e agrupa por contact_id,
// pra permitir filtrar contatos por esses campos no client (um contato "bate" se QUALQUER
// conversa dele bater).
export function useContactFilterJoins() {
  const { session } = useAuth();

  return useQuery({
    queryKey: ['contact-filter-joins'],
    queryFn: async (): Promise<ContactFilterJoins> => {
      const [{ data: conversations, error: convError }, { data: positions, error: posError }] = await Promise.all([
        supabase
          .from('conversations')
          .select('contact_id, assigned_to')
          .not('assigned_to', 'is', null),
        (supabase as any)
          .from('conversation_pipeline_positions')
          .select('column_id, conversation:conversations(contact_id)'),
      ]);

      if (convError) throw convError;
      if (posError) throw posError;

      const assignedToByContact = new Map<string, Set<string>>();
      for (const row of conversations || []) {
        if (!row.contact_id || !row.assigned_to) continue;
        if (!assignedToByContact.has(row.contact_id)) assignedToByContact.set(row.contact_id, new Set());
        assignedToByContact.get(row.contact_id)!.add(row.assigned_to);
      }

      const pipelineColumnsByContact = new Map<string, Set<string>>();
      for (const row of (positions || []) as any[]) {
        const contactId = row.conversation?.contact_id;
        if (!contactId || !row.column_id) continue;
        if (!pipelineColumnsByContact.has(contactId)) pipelineColumnsByContact.set(contactId, new Set());
        pipelineColumnsByContact.get(contactId)!.add(row.column_id);
      }

      return { assignedToByContact, pipelineColumnsByContact };
    },
    enabled: !!session,
    staleTime: 60 * 1000,
  });
}
