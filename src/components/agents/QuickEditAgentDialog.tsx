import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAIAgents, useUpdateAIAgent, AGENT_FUNCTION_ROLES } from '@/hooks/useAIAgents';
import { AgentPersonalityFields, EMPTY_PERSONALITY, type AgentPersonalityValue } from './AgentPersonalityFields';

interface QuickEditAgentDialogProps {
  agentId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Modal por cima do contexto atual (etapa de orquestração ou nó do Flow
// Builder) pra editar o agente base sem sair de onde se está -- ver conversa
// com o usuário: "botãozinho discreto... sem necessáriamente sair de onde
// estamos". Reaproveitado nos dois lugares onde um agentId é escolhido.
export function QuickEditAgentDialog({ agentId, open, onOpenChange }: QuickEditAgentDialogProps) {
  const { data: agents = [] } = useAIAgents();
  const updateAgent = useUpdateAIAgent();
  const agent = agents.find((a) => a.id === agentId);

  const [name, setName] = useState('');
  const [functionRole, setFunctionRole] = useState('recepcao');
  const [promptBase, setPromptBase] = useState('');
  const [personality, setPersonality] = useState<AgentPersonalityValue>(EMPTY_PERSONALITY);

  useEffect(() => {
    if (!agent) return;
    setName(agent.name);
    setFunctionRole(agent.function_role || 'recepcao');
    setPromptBase(agent.prompt_base || '');
    setPersonality({
      behaviorStyle: agent.behavior_style || EMPTY_PERSONALITY.behaviorStyle,
      responseLength: agent.response_length || EMPTY_PERSONALITY.responseLength,
      toneStyle: agent.tone_style || EMPTY_PERSONALITY.toneStyle,
      emojiUsage: agent.emoji_usage || EMPTY_PERSONALITY.emojiUsage,
    });
  }, [agent?.id]);

  const handleSave = () => {
    if (!agentId) return;
    updateAgent.mutate(
      {
        id: agentId,
        name,
        function_role: functionRole,
        prompt_base: promptBase,
        behavior_style: personality.behaviorStyle,
        response_length: personality.responseLength,
        tone_style: personality.toneStyle,
        emoji_usage: personality.emojiUsage,
      },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Dialog open={open && !!agentId} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar agente base</DialogTitle>
          <DialogDescription>Essas mudanças valem em todo lugar que usa esse agente, não só aqui.</DialogDescription>
        </DialogHeader>
        {!agent ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Agente não encontrado.</div>
        ) : (
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Função</Label>
              <Select value={functionRole} onValueChange={setFunctionRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {AGENT_FUNCTION_ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Personalidade</Label>
              <AgentPersonalityFields value={personality} onChange={(patch) => setPersonality((prev) => ({ ...prev, ...patch }))} />
            </div>
            <div className="space-y-2">
              <Label>Prompt base</Label>
              <Textarea rows={8} className="font-mono text-sm" value={promptBase} onChange={(e) => setPromptBase(e.target.value)} />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={!agent || !name.trim() || updateAgent.isPending} onClick={handleSave}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
