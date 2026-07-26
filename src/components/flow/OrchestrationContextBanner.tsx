import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Target, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useOrchestrationForFlow, useToggleOrchestration } from '@/hooks/useAgentOrchestrations';
import { useFlow } from '@/hooks/useFlows';
import { useTags } from '@/hooks/useTags';
import { supabase } from '@/integrations/supabase/client';

interface OrchestrationContextBannerProps {
  flowId: string;
}

// Cola entre Agentes e o Flow Builder: quando o fluxo aberto pertence a uma
// orquestração, mostra nome + voltar + ativar sem precisar sair do canvas
// (ver conversa com o usuário: "conectar os dois sem sair de um"). Some
// sozinha pra qualquer fluxo comum (useOrchestrationForFlow retorna null).
export function OrchestrationContextBanner({ flowId }: OrchestrationContextBannerProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: orchestration } = useOrchestrationForFlow(flowId);
  const { data: flow } = useFlow(flowId);
  const { data: tags = [] } = useTags();
  const toggleOrchestration = useToggleOrchestration();

  const [goalTagId, setGoalTagId] = useState('');
  const [savingGoal, setSavingGoal] = useState(false);

  useEffect(() => {
    setGoalTagId(orchestration?.goalTagId || '');
  }, [orchestration?.goalTagId]);

  if (!orchestration) return null;

  const hasAgentNode = (flow?.nodes || []).some((n: any) => n.type === 'ai-handoff');

  const handleToggle = (checked: boolean) => {
    if (checked && !hasAgentNode) {
      toast.error('Adicione um agente de IA ao fluxo antes de ativar.');
      return;
    }
    toggleOrchestration.mutate({
      instanceId: orchestration.id,
      flowId: orchestration.flowId,
      campaignId: orchestration.campaignId,
      isActive: checked,
    });
  };

  const saveGoalTag = async () => {
    setSavingGoal(true);
    const { error, data } = await supabase.functions.invoke('apply-agent-template', {
      body: { action: 'set_goal_tag', instanceId: orchestration.id, goalTagId: goalTagId || null },
    });
    setSavingGoal(false);
    if (error || data?.error) {
      toast.error('Erro ao salvar objetivo de conversão');
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['orchestration-for-flow', flowId] });
    queryClient.invalidateQueries({ queryKey: ['agent-orchestrations'] });
    toast.success('Objetivo de conversão salvo');
  };

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2 bg-card border-b border-border shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <Button variant="ghost" size="sm" onClick={() => navigate('/agents')} className="gap-1.5 shrink-0">
          <ArrowLeft className="h-4 w-4" /> Voltar para Agentes
        </Button>
        <div className="h-5 w-px bg-border shrink-0" />
        <span className="text-sm font-medium text-foreground truncate">{orchestration.name}</span>
        <Badge variant="outline" className="text-[10px] shrink-0">Orquestração</Badge>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" title="Objetivo de conversão">
              <Target className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72" align="end">
            <div className="space-y-2">
              <Label htmlFor="goal-tag-banner" className="text-xs">Objetivo de conversão (opcional)</Label>
              <div className="flex gap-2">
                <Select value={goalTagId || 'none'} onValueChange={(v) => setGoalTagId(v === 'none' ? '' : v)}>
                  <SelectTrigger id="goal-tag-banner" className="h-8 text-xs">
                    <SelectValue placeholder="Sem objetivo definido" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem objetivo definido</SelectItem>
                    {tags.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" className="h-8 text-xs" onClick={saveGoalTag} disabled={savingGoal}>
                  {savingGoal ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Salvar'}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Quando um contato que passou por essa orquestração recebe essa tag, conta como conversão.
              </p>
            </div>
          </PopoverContent>
        </Popover>
        <div className="h-5 w-px bg-border" />
        <span className="text-xs text-muted-foreground">Ativo</span>
        <Switch checked={orchestration.isActive} onCheckedChange={handleToggle} />
      </div>
    </div>
  );
}
