import { supabase } from '@/integrations/supabase/client';

// Contador monotônico por aba: garante um tópico único a cada assinatura.
let channelSeq = 0;

/**
 * Cria um canal de realtime com tópico ÚNICO por chamada.
 *
 * Porquê: `supabase.channel(topic)` REUSA um canal já existente de mesmo tópico
 * (RealtimeClient.channel retorna o canal encontrado em vez de criar outro). Se
 * esse canal já passou por `.subscribe()`, o `.on('postgres_changes', …)` seguinte
 * lança "cannot add `postgres_changes` callbacks ... after `subscribe()`" e derruba
 * a página inteira no ErrorBoundary (tela branca). Isso acontecia quando dois
 * componentes montavam o mesmo hook ao mesmo tempo (ex.: Pipeline + Conversas)
 * usando um tópico escopado por org/conversa — o segundo reusava o canal já
 * subscrito do primeiro.
 *
 * Tornando o tópico único por instância, cada assinatura tem seu próprio canal e o
 * `.on()` nunca cai num canal já subscrito. O escopo real dos eventos continua no
 * filtro do `.on(...)`, então o comportamento não muda.
 *
 * ATENÇÃO: use apenas para canais de `postgres_changes`/`broadcast`. NUNCA para
 * Presence compartilhada (`.on('presence')` / `.track()`), que depende do tópico
 * ser idêntico entre clientes para agrupar o estado de presença.
 */
export function createRealtimeChannel(base: string) {
  channelSeq += 1;
  return supabase.channel(`${base}#${channelSeq}`);
}
