import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Trash2, BookOpen, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface TrainingRulesListProps {
  targetType: 'agent' | 'master_prompt' | 'flow_node';
  agentId?: string;
  masterPromptId?: string;
  flowId?: string;
  nodeId?: string;
  organizationId?: string;
}

export function TrainingRulesList({
  targetType,
  agentId,
  masterPromptId,
  flowId,
  nodeId,
  organizationId,
}: TrainingRulesListProps) {
  const [expanded, setExpanded] = useState(false);
  const queryClient = useQueryClient();

  const queryKey = ['training-rules', targetType, agentId, masterPromptId, flowId, nodeId];

  const { data: rules = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      let query = supabase
        .from('agent_training_rules')
        .select('*')
        .eq('target_type', targetType)
        .order('created_at', { ascending: false });

      if (targetType === 'agent' && agentId) {
        query = query.eq('agent_id', agentId);
      } else if (targetType === 'master_prompt' && flowId) {
        query = query.eq('flow_id', flowId);
      } else if (targetType === 'flow_node' && flowId && nodeId) {
        query = query.eq('flow_id', flowId).eq('node_id', nodeId);
      } else {
        return [];
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!(
      (targetType === 'agent' && agentId) ||
      (targetType === 'master_prompt' && flowId) ||
      (targetType === 'flow_node' && flowId && nodeId)
    ),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('agent_training_rules')
        .update({ is_active })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('agent_training_rules')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('Regra removida');
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground p-2">
        <Loader2 className="h-3 w-3 animate-spin" />
        Carregando regras...
      </div>
    );
  }

  if (rules.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-muted/30 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-amber-500" />
          <span className="text-xs font-semibold text-foreground">
            Regras Aprendidas ({rules.length})
          </span>
        </div>
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-border divide-y divide-border">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className={cn(
                'p-3 space-y-1 transition-opacity',
                !rule.is_active && 'opacity-50'
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                    Situação
                  </p>
                  <p className="text-xs text-foreground leading-snug">{rule.situation}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Switch
                    checked={rule.is_active}
                    onCheckedChange={(checked) =>
                      toggleMutation.mutate({ id: rule.id, is_active: checked })
                    }
                    className="scale-75"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive hover:text-destructive"
                    onClick={() => deleteMutation.mutate(rule.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                  Regra
                </p>
                <p className="text-xs text-foreground leading-snug">{rule.rule}</p>
              </div>
              {rule.original_feedback && (
                <p className="text-[10px] text-muted-foreground italic mt-1">
                  Feedback original: "{rule.original_feedback}"
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
