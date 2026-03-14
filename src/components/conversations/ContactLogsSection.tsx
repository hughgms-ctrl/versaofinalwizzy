import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Bot, User, Tag, Columns, GitBranch, ArrowRightLeft, Loader2, MessageSquare, ArrowRight, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface ContactLogsSectionProps {
  conversationId: string;
}

interface TimelineEntry {
  id: string;
  timestamp: string;
  type: 'agent_activated' | 'tag_added' | 'tag_removed' | 'pipeline_moved' | 'flow_triggered' | 'agent_switched' | 'human_intervened' | 'status_changed' | 'ai_response' | 'stage_changed' | 'conversation_started' | 'followup_sent' | 'flow_step';
  description: string;
  actor: string;
  actorType: 'ai' | 'human' | 'system';
  meta?: {
    columnName?: string;
    columnColor?: string;
    fromColumnName?: string;
    tagName?: string;
    tagColor?: string;
    flowStatus?: string;
    nodeType?: string;
    flowExecutionId?: string;
  };
}

export function ContactLogsSection({ conversationId }: ContactLogsSectionProps) {
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['contact-timeline', conversationId],
    queryFn: async () => {
      // First get conversation to know contact_id
      const { data: conv } = await supabase
        .from('conversations')
        .select('created_at, intervened_by, intervened_at, contact_id')
        .eq('id', conversationId)
        .single();

      if (!conv) return { timeline: [], migrationError: false };

      // Fetch all data sources in parallel
      const results = await Promise.all([
        supabase
          .from('agent_execution_logs')
          .select(`
            id, created_at, input_message, ai_response, tools_executed,
            agent:ai_agents(name),
            master_prompt:master_prompts(name)
          `)
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true }),
        (supabase as any)
          .from('conversation_stage_history')
          .select(`
            *,
            from_column:pipeline_columns!conversation_stage_history_from_column_id_fkey(name, color),
            to_column:pipeline_columns!conversation_stage_history_to_column_id_fkey(name, color),
            changed_by_profile:profiles!conversation_stage_history_changed_by_fkey(full_name)
          `)
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true })
          .then((res: any) => {
            if (res.error) {
              return (supabase as any)
                .from('conversation_stage_history')
                .select('*')
                .eq('conversation_id', conversationId)
                .order('created_at', { ascending: true });
            }
            return res;
          }),
        supabase.from('tags').select('id, name, color'),
        supabase.from('flows').select('id, name'),
        supabase.from('ai_agents').select('id, name'),
        supabase.from('pipeline_columns').select('id, name, color'),
        supabase
          .from('flow_executions')
          .select('id, flow_id, started_at, completed_at, status')
          .eq('conversation_id', conversationId)
          .order('started_at', { ascending: true }),
        supabase
          .from('contact_tags')
          .select('id, tag_id, created_at, added_by_type')
          .eq('contact_id', conv.contact_id)
          .order('created_at', { ascending: true }),
        supabase
          .from('flow_node_logs')
          .select('*')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true }),
      ]);

      const [execResult, stageResult, tagsResult, flowsResult, agentsResult, columnsResult, flowExecResult, contactTagsResult, nodeLogsResult] = results;
      
      const migrationError = !!nodeLogsResult?.error;

      // Build lookup maps
      const tagMap = new Map((tagsResult.data || []).map((t: any) => [t.id, { name: t.name, color: t.color }]));
      const flowMap = new Map((flowsResult.data || []).map((f: any) => [f.id, f.name]));
      const agentMap = new Map((agentsResult.data || []).map((a: any) => [a.id, a.name]));
      const columnMap = new Map((columnsResult.data || []).map((c: any) => [c.id, { name: c.name, color: c.color }]));

      const timeline: TimelineEntry[] = [];

      // 1. Conversation started
      if (conv.created_at) {
        timeline.push({
          id: 'conv-start',
          timestamp: conv.created_at,
          type: 'conversation_started',
          description: 'Conversa iniciada',
          actor: 'Sistema',
          actorType: 'system',
        });
      }

      // 2. Stage history entries
      for (const entry of stageResult.data || []) {
        const toCol = entry.to_column || columnMap.get(entry.to_column_id);
        const fromCol = entry.from_column || (entry.from_column_id ? columnMap.get(entry.from_column_id) : null);
        const actorName = entry.changed_by_profile?.full_name || 
          (entry.changed_by_type === 'ai' ? 'IA' : 
           entry.changed_by_type === 'flow' ? 'Fluxo' :
           entry.changed_by_type === 'orchestrator' ? 'Orquestrador' : 'Manual');

        timeline.push({
          id: `stage-${entry.id}`,
          timestamp: entry.created_at,
          type: 'stage_changed',
          description: fromCol 
            ? `Movido de "${fromCol.name || fromCol}" para "${toCol?.name || 'Estágio'}"`
            : `Entrou no estágio "${toCol?.name || 'Estágio'}"`,
          actor: actorName,
          actorType: entry.changed_by_type === 'ai' || entry.changed_by_type === 'orchestrator' ? 'ai' : entry.changed_by_type === 'flow' ? 'ai' : 'human',
          meta: {
            columnName: toCol?.name,
            columnColor: toCol?.color,
            fromColumnName: fromCol?.name,
          },
        });
      }

      // 3. Flow executions
      for (const flowExec of flowExecResult.data || []) {
        const flowName = flowMap.get(flowExec.flow_id) || 'Fluxo desconhecido';
        timeline.push({
          id: `flowexec-${flowExec.id}`,
          timestamp: flowExec.started_at,
          type: 'flow_triggered',
          description: `Fluxo "${flowName}" executado`,
          actor: 'Fluxo',
          actorType: 'system',
          meta: {
            flowStatus: flowExec.status,
            flowExecutionId: flowExec.id,
          },
        });
      }

      // 3b. Follow-up messages (from messages metadata)
      const { data: followUpMessages } = await supabase
        .from('messages')
        .select('id, created_at, content, metadata')
        .eq('conversation_id', conversationId)
        .eq('direction', 'outbound')
        .eq('is_from_bot', true)
        .order('created_at', { ascending: true });

      for (const msg of followUpMessages || []) {
        const meta = msg.metadata as any;
        if (meta?.source === 'remarketing_followup') {
          const stepNum = meta.remarketing_step || '?';
          const flowName = meta.flow_name || '';
          timeline.push({
            id: `followup-${msg.id}`,
            timestamp: msg.created_at,
            type: 'followup_sent',
            description: `Follow-up #${stepNum} enviado${flowName ? ` (${flowName})` : ''}`,
            actor: 'Follow-up',
            actorType: 'system',
          });
        }
      }

      // 4. Contact tags added (by flow, manual, etc.)
      // Deduplicate: don't show tags already shown via agent_execution_logs tools
      const aiTagIds = new Set<string>();
      for (const log of execResult.data || []) {
        const tools = (log.tools_executed as any[]) || [];
        for (const tool of tools) {
          if (tool.name === 'add_tag' && tool.arguments?.tag_id) {
            aiTagIds.add(tool.arguments.tag_id);
          }
        }
      }

      for (const ct of contactTagsResult.data || []) {
        // Skip tags already tracked via AI execution logs
        if (ct.added_by_type === 'ai' && aiTagIds.has(ct.tag_id)) continue;

        const tagInfo = tagMap.get(ct.tag_id);
        const tagName = tagInfo?.name || 'desconhecida';
        const actorLabel = ct.added_by_type === 'flow' ? 'Fluxo' : 
                          ct.added_by_type === 'ai' ? 'IA' : 
                          ct.added_by_type === 'campaign' ? 'Campanha' : 'Manual';

        timeline.push({
          id: `ctag-${ct.id}`,
          timestamp: ct.created_at,
          type: 'tag_added',
          description: `Tag "${tagName}" adicionada`,
          actor: actorLabel,
          actorType: ct.added_by_type === 'manual' ? 'human' : 'ai',
          meta: {
            tagColor: tagInfo?.color,
            tagName: tagInfo?.name,
          },
        });
      }

      // 5. Agent execution logs
      for (const log of execResult.data || []) {
        const time = log.created_at;
        const agentName = (log.agent as any)?.name || (log.master_prompt as any)?.name || 'Agente Master';

        timeline.push({
          id: `${log.id}-activation`,
          timestamp: time,
          type: 'agent_activated',
          description: `${agentName} ativado`,
          actor: agentName,
          actorType: 'ai',
        });

        const tools = (log.tools_executed as any[]) || [];
        for (const tool of tools) {
          const toolName = tool.name || tool.function_name;
          const toolArgs = tool.arguments || tool.args || {};

          if (toolName === 'add_tag') {
            const tagInfo = tagMap.get(toolArgs.tag_id);
            const name = tagInfo?.name || toolArgs.tag_name || 'desconhecida';
            timeline.push({
              id: `${log.id}-tag-add-${toolArgs.tag_id || ''}`,
              timestamp: time,
              type: 'tag_added',
              description: `Tag "${name}" adicionada`,
              actor: agentName,
              actorType: 'ai',
              meta: { tagColor: tagInfo?.color, tagName: tagInfo?.name },
            });
          }
          if (toolName === 'remove_tag') {
            const tagInfo = tagMap.get(toolArgs.tag_id);
            const name = tagInfo?.name || toolArgs.tag_name || 'desconhecida';
            timeline.push({
              id: `${log.id}-tag-rm-${toolArgs.tag_id || ''}`,
              timestamp: time,
              type: 'tag_removed',
              description: `Tag "${name}" removida`,
              actor: agentName,
              actorType: 'ai',
              meta: { tagColor: tagInfo?.color, tagName: tagInfo?.name },
            });
          }
          if (toolName === 'move_pipeline') {
            const col = columnMap.get(toolArgs.column_id);
            const colName = col?.name || toolArgs.column_name || 'desconhecida';
            timeline.push({
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
            timeline.push({
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
            timeline.push({
              id: `${log.id}-switch`,
              timestamp: time,
              type: 'agent_switched',
              description: `Agente trocado para ${name}`,
              actor: agentName,
              actorType: 'ai',
            });
          }
          if (toolName === 'send_reply') {
            timeline.push({
              id: `${log.id}-reply`,
              timestamp: time,
              type: 'ai_response',
              description: 'Resposta enviada',
              actor: agentName,
              actorType: 'ai',
            });
          }
        }
      }

      // 6. Human intervention
      if (conv.intervened_at && conv.intervened_by) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', conv.intervened_by)
          .single();

        timeline.push({
          id: `intervention-${conv.intervened_at}`,
          timestamp: conv.intervened_at,
          type: 'human_intervened',
          description: `${profile?.full_name || 'Atendente'} assumiu a conversa`,
          actor: profile?.full_name || 'Atendente',
          actorType: 'human',
        });
      }

      // 7. Flow node logs (internal steps)
      for (const nodeLog of (nodeLogsResult?.data || [])) {
        // Skip redundant nodes
        if (['start', 'condition', 'action-transfer'].includes(nodeLog.node_type)) continue;

        timeline.push({
          id: `node-${nodeLog.id}`,
          timestamp: nodeLog.created_at,
          type: 'flow_step',
          description: nodeLog.node_name || nodeLog.node_type,
          actor: 'Fluxo',
          actorType: 'system',
          meta: {
            nodeType: nodeLog.node_type,
            flowExecutionId: nodeLog.flow_execution_id,
          },
        });
      }

      timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      return { timeline, migrationError };
    },
  });

  const timelineEntries = data?.timeline || [];
  const migrationError = data?.migrationError;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (timelineEntries.length === 0) {
    return (
      <div className="text-center text-sm text-muted-foreground py-6">
        <Bot className="h-8 w-8 mx-auto mb-2 opacity-30" />
        <p>Sem histórico para esta conversa</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pr-1">
      {migrationError && (
        <div className="bg-orange-500/10 border border-orange-500/20 rounded p-2 text-[10px] text-orange-500 flex items-center gap-2 mb-2">
          <GitBranch className="h-3 w-3" />
          <span>A migração `flow_node_logs` ainda não foi aplicada. Detalhes internos do fluxo estão ocultos.</span>
        </div>
      )}
      <div className="space-y-0.5">
        {timelineEntries.map((entry) => {
          const Icon = getIcon(entry.type);
          const color = getColor(entry.type);
          const dateStr = format(new Date(entry.timestamp), 'dd/MM/yyyy', { locale: ptBR });
          const showDate = dateStr !== lastDate;
          lastDate = dateStr;

          return (
            <div key={entry.id}>
              {showDate && (
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium pt-2 pb-1 border-b border-border/10 mb-2">
                  {dateStr}
                </div>
              )}
              <div className={cn(
                "flex items-start gap-2 py-1.5 group rounded transition-colors",
                entry.type === 'flow_step' 
                  ? "ml-6 pl-3 border-l-2 border-purple-500/30 bg-purple-500/5 my-0.5" 
                  : ""
              )}>
                <div className={cn(
                  "mt-0.5 shrink-0 relative", 
                  entry.type === 'flow_step' ? getNodeColor(entry.meta?.nodeType || '') : color
                )}>
                  {entry.type === 'flow_step' ? (
                    React.createElement(getNodeIcon(entry.meta?.nodeType || ''), { className: "h-3.5 w-3.5" })
                  ) : (
                    <Icon className="h-3.5 w-3.5" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-1">
                    <p className="text-xs text-foreground leading-tight font-medium truncate">
                      {entry.description}
                    </p>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {format(new Date(entry.timestamp), 'HH:mm', { locale: ptBR })}
                    </span>
                  </div>
                  
                  {entry.type === 'stage_changed' && entry.meta?.columnName && (
                    <Badge 
                      variant="secondary" 
                      className="text-[8px] h-3.5 mt-0.5"
                      style={entry.meta.columnColor ? { 
                        backgroundColor: `${entry.meta.columnColor}20`,
                        color: entry.meta.columnColor,
                        borderColor: `${entry.meta.columnColor}40`,
                      } : undefined}
                    >
                      {entry.meta.columnName}
                    </Badge>
                  )}
                  {(entry.type === 'tag_added' || entry.type === 'tag_removed') && entry.meta?.tagName && (
                    <Badge 
                      variant="secondary" 
                      className="text-[8px] h-3.5 mt-0.5"
                      style={entry.meta.tagColor ? { 
                        backgroundColor: `${entry.meta.tagColor}20`,
                        color: entry.meta.tagColor,
                        borderColor: `${entry.meta.tagColor}40`,
                      } : undefined}
                    >
                      {entry.meta.tagName}
                    </Badge>
                  )}
                  {entry.type === 'flow_triggered' && entry.meta?.flowStatus && (
                    <Badge 
                      variant="secondary" 
                      className="text-[8px] h-3.5 mt-0.5"
                    >
                      {entry.meta.flowStatus === 'completed' ? 'Concluído' : 
                       entry.meta.flowStatus === 'failed' ? 'Falhou' : 
                       entry.meta.flowStatus === 'waiting_input' ? 'Aguardando' : 'Executando'}
                    </Badge>
                  )}

                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] text-muted-foreground/70">{entry.actor}</span>
                    {entry.actorType === 'ai' && (
                      <Badge variant="outline" className="text-[8px] h-3 px-1 border-purple-500/30 text-purple-500 bg-purple-500/5">
                        IA
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
