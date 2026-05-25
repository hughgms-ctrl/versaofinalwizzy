import { useState } from 'react';
import { mockAgents } from '@/data/mockData';
import { Agent } from '@/types';
import { ArrowRight, Bot, Plus, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function AgentOrchestration() {
  const [pipeline, setPipeline] = useState<Agent[]>([
    mockAgents[0], // Aria
    mockAgents[1], // Victor
    mockAgents[2], // Sofia
  ]);

  const aiAgents = mockAgents.filter(a => a.type === 'ai');

  return (
    <div className="metric-card">
      <div className="metric-card-gradient" />
      <div className="relative">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Pipeline de Orquestração</h3>
            <p className="text-sm text-muted-foreground">
              Configure a ordem de atendimento dos agentes de IA
            </p>
          </div>
          <Button variant="outline" size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Adicionar Etapa
          </Button>
        </div>

        {/* Pipeline Visualization */}
        <div className="flex items-center gap-2 overflow-x-auto pb-4">
          {/* Entry Point */}
          <div className="flex-shrink-0 flex flex-col items-center">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-slate-400 to-slate-500 flex items-center justify-center shadow-lg">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
            <span className="text-xs text-muted-foreground mt-2">Entrada</span>
          </div>

          {pipeline.map((agent, index) => (
            <div key={agent.id} className="flex items-center gap-2">
              {/* Arrow */}
              <ArrowRight className="h-5 w-5 text-primary flex-shrink-0" />

              {/* Agent Node */}
              <div className="flex-shrink-0">
                <div className="p-4 rounded-xl bg-gradient-to-br from-primary/5 to-purple-500/5 border-2 border-primary/20 min-w-[180px]">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center">
                      <Bot className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{agent.name.split(' - ')[0]}</p>
                      <p className="text-[10px] text-muted-foreground">Etapa {index + 1}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {agent.specialization?.slice(0, 2).map((spec) => (
                      <span 
                        key={spec}
                        className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px]"
                      >
                        {spec}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* Human Escalation */}
          <ArrowRight className="h-5 w-5 text-green-500 flex-shrink-0" />
          <div className="flex-shrink-0 flex flex-col items-center">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center shadow-lg">
              <Bot className="h-6 w-6 text-white" />
            </div>
            <span className="text-xs text-muted-foreground mt-2 text-center">Escalação<br/>Humana</span>
          </div>
        </div>

        {/* Transfer Rules */}
        <div className="mt-6 pt-4 border-t border-border">
          <h4 className="text-sm font-semibold text-foreground mb-3">Regras de Transferência</h4>
          <div className="space-y-2">
            <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-primary" />
                <span className="text-sm text-foreground">Intenção de compra detectada</span>
              </div>
              <span className="text-xs text-muted-foreground">Aria → Victor</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-amber-500" />
                <span className="text-sm text-foreground">Problema técnico complexo</span>
              </div>
              <span className="text-xs text-muted-foreground">Victor → Sofia</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                <span className="text-sm text-foreground">Solicitação de cancelamento</span>
              </div>
              <span className="text-xs text-muted-foreground">Qualquer → Humano</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
