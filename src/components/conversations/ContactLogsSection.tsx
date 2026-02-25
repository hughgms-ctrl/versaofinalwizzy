import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Bot, User, Tag, Columns, GitBranch, ArrowRightLeft, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ContactLogsSectionProps {
  conversationId: string;
}

interface LogEntry {
  id: string;
  timestamp: string;
  type: 'agent_activated' | 'tag_added' | 'tag_removed' | 'pipeline_moved' | 'flow_triggered' | 'agent_switched' | 'human_intervened' | 'status_changed' | 'ai_response';
  description: string;
  actor: string;
  actorType: 'ai' | 'human';
}

export function ContactLogsSection({ conversationId }: ContactLogsSectionProps) {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['contact-logs', conversationId],
    queryFn: async () => {
      // Fetch execution logs and lookup data in parallel
      const [execResult, tagsResult, flowsResult, agentsResult, columnsResult] = await Promise.all([
        supabase
          .from('agent_execution_logs')
          .select(`
            id,
            created_at,
            input_message,
            ai_response,
            tools_executed,
            agent:ai_agents(name),
            master_prompt:master_prompts(name)
          `)
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true }),
        supabase.from('tags').select('id, name'),
        supabase.from('flows').select('id, name'),
        supabase.from('ai_agents').select('id, name'),
        supabase.from('pipeline_columns').select('id, name'),
      ]);

      if (execResult.error) throw execResult.error;

      // Build lookup maps
      const tagMap = new Map((tagsResult.data || []).map(t => [t.id, t.name]));
      const flowMap = new Map((flowsResult.data || []).map(f => [f.id, f.name]));
      const agentMap = new Map((agentsResult.data || []).map(a => [a.id, a.name]));
      const columnMap = new Map((columnsResult.data || []).map(c => [c.id, c.name]));

      const entries: LogEntry[] = [];

      for (const log of execResult.data || []) {
        const time = log.created_at;
        const agentName = (log.agent as any)?.name || (log.master_prompt as any)?.name || 'Agente Master';

        // Log the agent activation
        entries.push({
          id: `${log.id}-activation`,
          timestamp: time,
          type: 'agent_activated',
          description: `${agentName} ativado`,
          actor: agentName,
          actorType: 'ai',
        });

        // Parse tools executed
        const tools = (log.tools_executed as any[]) || [];
        for (const tool of tools) {
          const toolName = tool.name || tool.function_name;
          const toolArgs = tool.arguments || tool.args || {};

          if (toolName === 'add_tag') {
            const name = tagMap.get(toolArgs.tag_id) || toolArgs.tag_name || 'desconhecida';
            entries.push({
              id: `${log.id}-tag-add-${toolArgs.tag_id || ''}`,
              timestamp: time,
              type: 'tag_added',
              description: `Tag #${name} inserida`,
              actor: agentName,
              actorType: 'ai',
            });
          }
          if (toolName === 'remove_tag') {
            const name = tagMap.get(toolArgs.tag_id) || toolArgs.tag_name || 'desconhecida';
            entries.push({
              id: `${log.id}-tag-rm-${toolArgs.tag_id || ''}`,
              timestamp: time,
              type: 'tag_removed',
              description: `Tag #${name} removida`,
              actor: agentName,
              actorType: 'ai',
            });
          }
          if (toolName === 'move_pipeline') {
            const colName = columnMap.get(toolArgs.column_id) || toolArgs.column_name || 'desconhecida';
            entries.push({
              id: `${log.id}-pipeline`,
              timestamp: time,
              type: 'pipeline_moved',
              description: `Pipeline movido para "${colName}"`,
              actor: agentName,
              actorType: 'ai',
            });
          }
          if (toolName === 'trigger_flow') {
            const name = flowMap.get(toolArgs.flow_id) || toolArgs.flow_name || 'desconhecido';
            entries.push({
              id: `${log.id}-flow`,
              timestamp: time,
              type: 'flow_triggered',
              description: `Fluxo "${name}" disparado`,
              actor: agentName,
              actorType: 'ai',
            });
          }
          if (toolName === 'switch_agent') {
            const name = agentMap.get(toolArgs.agent_id) || toolArgs.agent_name || 'desconhecido';
            entries.push({
              id: `${log.id}-switch`,
              timestamp: time,
              type: 'agent_switched',
              description: `Agente trocado para ${name}`,
              actor: agentName,
              actorType: 'ai',
            });
          }
          if (toolName === 'send_reply') {
            entries.push({
              id: `${log.id}-reply`,
              timestamp: time,
              type: 'ai_response',
              description: `Resposta enviada`,
              actor: agentName,
              actorType: 'ai',
            });
          }
        }
      }

      // Fetch human interventions
      const { data: convData } = await supabase
        .from('conversations')
        .select('intervened_by, intervened_at')
        .eq('id', conversationId)
        .single();

      if (convData?.intervened_at && convData?.intervened_by) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', convData.intervened_by)
          .single();

        entries.push({
          id: `intervention-${convData.intervened_at}`,
          timestamp: convData.intervened_at,
          type: 'human_intervened',
          description: `Atendente ${profile?.full_name || 'humano'} assumiu`,
          actor: profile?.full_name || 'Atendente',
          actorType: 'human',
        });
      }

      entries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      return entries;
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="text-center text-sm text-muted-foreground py-6">
        <Bot className="h-8 w-8 mx-auto mb-2 opacity-30" />
        <p>Nenhum log registrado</p>
        <p className="text-xs mt-1">Ações de agentes e atendentes aparecerão aqui</p>
      </div>
    );
  }

  const getIcon = (type: LogEntry['type']) => {
    switch (type) {
      case 'agent_activated':
      case 'agent_switched':
      case 'ai_response':
        return Bot;
      case 'tag_added':
      case 'tag_removed':
        return Tag;
      case 'pipeline_moved':
        return Columns;
      case 'flow_triggered':
        return GitBranch;
      case 'human_intervened':
      case 'status_changed':
        return User;
      default:
        return ArrowRightLeft;
    }
  };

  const getColor = (type: LogEntry['type']) => {
    switch (type) {
      case 'agent_activated':
        return 'text-primary';
      case 'tag_added':
        return 'text-green-500';
      case 'tag_removed':
        return 'text-red-400';
      case 'pipeline_moved':
        return 'text-blue-500';
      case 'flow_triggered':
        return 'text-purple-500';
      case 'agent_switched':
        return 'text-amber-500';
      case 'human_intervened':
        return 'text-orange-500';
      case 'ai_response':
        return 'text-muted-foreground';
      default:
        return 'text-muted-foreground';
    }
  };

  return (
    <div className="space-y-1">
      {logs.map((log) => {
        const Icon = getIcon(log.type);
        const color = getColor(log.type);

        return (
          <div key={log.id} className="flex items-start gap-2 py-1.5">
            <div className={cn("mt-0.5 shrink-0", color)}>
              <Icon className="h-3.5 w-3.5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-foreground leading-tight">{log.description}</p>
            </div>
            <span className="text-[10px] text-muted-foreground shrink-0">
              {format(new Date(log.timestamp), 'HH:mm', { locale: ptBR })}
            </span>
          </div>
        );
      })}
    </div>
  );
}
