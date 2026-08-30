import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { createRealtimeChannel } from '@/lib/realtimeChannel';
import { useSharedRealtimeSubscription } from '@/lib/sharedRealtime';
import type { ContactTagLink } from '@/lib/contactTagLinks';

/** Espera para agrupar rajadas de vinculo de tag (import de contatos, tag em massa). */
const TAGS_REFETCH_DEBOUNCE_MS = 800;

/**
 * Realtime do board do funil.
 *
 * As conversas NAO sao assinadas aqui: `useConversations` ja mantem o proprio
 * canal por organizacao e agora aplica patch no cache (B12). Este hook tinha uma
 * assinatura paralela de `conversations` que invalidava a lista inteira — o
 * mesmo evento, o dobro do trabalho.
 *
 * `contact_tags` nao tem `organization_id` (so `contact_id` e `tag_id`), entao
 * nao ha filtro de coluna a aplicar: o escopo vem da RLS, que o Realtime avalia
 * por assinante. O que da para cortar e o TRABALHO por evento — um vinculo novo
 * entra no cache por patch, e so o que nao da para deduzir do payload (DELETE,
 * que traz apenas a chave primaria) cai num refetch com atraso, agrupando
 * rajadas como import de contatos com tag.
 */
function startPipelineSync(queryClient: ReturnType<typeof useQueryClient>, pipelineId: string) {
  const refetchPositions = () => {
    queryClient.refetchQueries({ queryKey: ['conversation-positions', pipelineId], type: 'active' });
  };

  let tagsDebounce: ReturnType<typeof setTimeout> | null = null;
  const scheduleTagsRefetch = () => {
    if (tagsDebounce) return;
    tagsDebounce = setTimeout(() => {
      tagsDebounce = null;
      queryClient.refetchQueries({ queryKey: ['all-contact-tags'], type: 'active' });
      queryClient.refetchQueries({ queryKey: ['contact-tags'], type: 'active' });
    }, TAGS_REFETCH_DEBOUNCE_MS);
  };

  const channel = createRealtimeChannel(`pipeline-rt-${pipelineId}`)
    // Movimentacao de card. O filtro por pipeline ja cobre o INSERT (o filtro
    // vale para a linha nova), entao nao ha binding extra sem filtro.
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'conversation_pipeline_positions',
        filter: `pipeline_id=eq.${pipelineId}`,
      },
      refetchPositions
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'contact_tags',
      },
      (payload) => {
        if (payload.eventType === 'INSERT') {
          const link = payload.new as Partial<ContactTagLink> | null;
          if (!link?.contact_id || !link?.tag_id) return;

          const cached = queryClient.getQueryData<ContactTagLink[]>(['all-contact-tags']);
          if (!cached) {
            // Sem cache ainda: a propria consulta vai trazer o vinculo novo.
            queryClient.refetchQueries({ queryKey: ['contact-tags'], type: 'active' });
            return;
          }

          const exists = cached.some((row) => row.contact_id === link.contact_id && row.tag_id === link.tag_id);
          if (!exists) {
            queryClient.setQueryData<ContactTagLink[]>(['all-contact-tags'], [
              ...cached,
              { contact_id: link.contact_id, tag_id: link.tag_id },
            ]);
          }
          queryClient.refetchQueries({ queryKey: ['contact-tags'], type: 'active' });
          return;
        }

        // DELETE traz so a chave primaria (sem REPLICA IDENTITY FULL) e UPDATE de
        // vinculo e raro: nos dois casos e preciso reler.
        scheduleTagsRefetch();
      }
    )
    .subscribe();

  return () => {
    if (tagsDebounce) clearTimeout(tagsDebounce);
    supabase.removeChannel(channel);
  };
}

/**
 * Subscribes to real-time changes on pipeline-related tables
 * so the board updates instantly without manual refresh.
 */
export function usePipelineRealtime(pipelineId: string | null) {
  const queryClient = useQueryClient();

  useSharedRealtimeSubscription(
    pipelineId ? `pipeline-rt:${pipelineId}` : null,
    () => startPipelineSync(queryClient, pipelineId!)
  );
}
