import { Agent } from '@/types';
import { Bot, User, Zap, Clock, ThumbsUp, Settings, Play, Pause, MoreVertical, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';

interface AgentCardProps {
  agent: Agent;
  onToggle?: (id: string, active: boolean) => void;
  onEdit?: (agent: Agent) => void;
}

export function AgentCard({ agent, onToggle, onEdit }: AgentCardProps) {
  const isAI = agent.type === 'ai';

  return (
    <div className={cn(
      "agent-card",
      agent.isActive && "agent-card-active"
    )}>
      {/* Gradient Background */}
      <div className="absolute inset-0 opacity-5 rounded-xl overflow-hidden">
        <div className={cn(
          "absolute inset-0",
          isAI 
            ? "bg-gradient-to-br from-primary via-purple-500 to-indigo-600" 
            : "bg-gradient-to-br from-green-500 via-emerald-500 to-teal-500"
        )} />
      </div>

      <div className="relative">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className={cn(
                "h-14 w-14 rounded-xl flex items-center justify-center shadow-lg",
                isAI 
                  ? "bg-gradient-to-br from-primary to-purple-500" 
                  : "bg-gradient-to-br from-green-500 to-emerald-500"
              )}>
                {isAI ? (
                  <Bot className="h-7 w-7 text-white" />
                ) : (
                  <User className="h-7 w-7 text-white" />
                )}
              </div>
              <div className={cn(
                "absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-card",
                agent.status === 'online' && "bg-green-500",
                agent.status === 'busy' && "bg-amber-500",
                agent.status === 'offline' && "bg-slate-400"
              )} />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">{agent.name}</h3>
              <p className="text-xs text-muted-foreground">
                {isAI ? 'Agente de IA' : 'Agente Humano'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch 
              checked={agent.isActive}
              onCheckedChange={(checked) => onToggle?.(agent.id, checked)}
            />
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit?.(agent)}>
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Description */}
        {agent.description && (
          <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
            {agent.description}
          </p>
        )}

        {/* Specializations */}
        {agent.specialization && agent.specialization.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {agent.specialization.map((spec) => (
              <span 
                key={spec}
                className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium"
              >
                {spec}
              </span>
            ))}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 p-3 rounded-xl bg-muted/50">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Zap className="h-4 w-4 text-primary" />
            </div>
            <p className="text-lg font-bold text-foreground">{agent.conversationsHandled.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground uppercase">Conversas</p>
          </div>
          <div className="text-center border-x border-border">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Clock className="h-4 w-4 text-amber-500" />
            </div>
            <p className="text-lg font-bold text-foreground">{agent.avgResponseTime}s</p>
            <p className="text-[10px] text-muted-foreground uppercase">Tempo Resp.</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <ThumbsUp className="h-4 w-4 text-green-500" />
            </div>
            <p className="text-lg font-bold text-foreground">{agent.satisfactionScore}%</p>
            <p className="text-[10px] text-muted-foreground uppercase">Satisfação</p>
          </div>
        </div>

        {/* Knowledge Base */}
        {agent.knowledgeBase && agent.knowledgeBase.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-xs font-medium text-muted-foreground mb-2">Base de Conhecimento:</p>
            <div className="flex flex-wrap gap-1.5">
              {agent.knowledgeBase.map((kb) => (
                <span 
                  key={kb}
                  className="px-2 py-0.5 rounded bg-secondary text-secondary-foreground text-[10px]"
                >
                  {kb}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
