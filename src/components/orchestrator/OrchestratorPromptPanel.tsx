import { useState } from 'react';
import { PanelRightClose, PanelRight, Sparkles, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface OrchestratorPromptPanelProps {
  content: string;
  onChange: (content: string) => void;
  agentName: string;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  syncEnabled: boolean;
  onSyncEnabledChange: (enabled: boolean) => void;
  onApplyToFlow?: (prompt: string) => void;
  isApplyingToFlow?: boolean;
}

export function OrchestratorPromptPanel({
  content,
  onChange,
  agentName,
  isCollapsed,
  onToggleCollapse,
  syncEnabled,
  onSyncEnabledChange,
  onApplyToFlow,
  isApplyingToFlow,
}: OrchestratorPromptPanelProps) {
  const [aiInput, setAiInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const handleAIGenerate = async () => {
    if (!aiInput.trim()) return;
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-agent-prompt', {
        body: { userDescription: aiInput, agentName, agentRole: 'Orquestrador Master' },
      });
      if (error) throw error;
      if (data?.prompt) {
        onChange(data.prompt);
        toast({ title: 'Prompt gerado com sucesso!' });
        // If sync is enabled, automatically apply to flow
        if (syncEnabled && onApplyToFlow) {
          onApplyToFlow(data.prompt);
        }
      }
    } catch (err) {
      toast({ title: 'Erro ao gerar prompt', description: err instanceof Error ? err.message : 'Tente novamente', variant: 'destructive' });
    } finally {
      setIsGenerating(false);
    }
  };

  if (isCollapsed) {
    return (
      <div className="w-10 bg-card border-l border-border h-full flex flex-col items-center py-3">
        <Button variant="ghost" size="icon" onClick={onToggleCollapse} className="h-8 w-8" title="Abrir Prompt">
          <PanelRight className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="w-80 bg-card border-l border-border h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-foreground text-sm">Prompt & Regras</h3>
          <p className="text-[10px] text-muted-foreground mt-0.5">Personalidade e instruções complementares</p>
        </div>
        <Button variant="ghost" size="icon" onClick={onToggleCollapse} className="h-8 w-8">
          <PanelRightClose className="h-4 w-4" />
        </Button>
      </div>

      {/* Sync Toggle */}
      <div className="p-3 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-xs font-medium">Sincronizar com fluxo</Label>
            <p className="text-[10px] text-muted-foreground">Mudanças no prompt atualizam o fluxo e vice-versa</p>
          </div>
          <Switch checked={syncEnabled} onCheckedChange={onSyncEnabledChange} />
        </div>
      </div>

      {/* AI Assist */}
      <div className="p-3 border-b border-border">
        <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            Assistente IA
          </div>
          <Textarea
            value={aiInput}
            onChange={e => setAiInput(e.target.value)}
            placeholder="Descreva a personalidade e regras..."
            className="min-h-[60px] text-xs"
          />
          <Button
            onClick={handleAIGenerate}
            disabled={isGenerating || !aiInput.trim()}
            size="sm"
            className="gap-1.5 h-7 text-xs w-full"
          >
            {isGenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            {isGenerating ? 'Gerando...' : 'Gerar com IA'}
          </Button>
        </div>
      </div>

      {/* Apply to Flow button (manual) */}
      {onApplyToFlow && (
        <div className="px-3 pt-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 h-7 text-xs w-full"
            onClick={() => onApplyToFlow(content)}
            disabled={isApplyingToFlow || !content.trim()}
          >
            {isApplyingToFlow ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            {isApplyingToFlow ? 'Aplicando...' : 'Aplicar ao fluxo'}
          </Button>
        </div>
      )}

      {/* Prompt Editor */}
      <div className="flex-1 p-3 overflow-y-auto">
        <Textarea
          value={content}
          onChange={e => onChange(e.target.value)}
          placeholder={`Defina a personalidade do orquestrador...\n\nExemplo:\nVocê é Hugo Gomes, advogado especialista em Direito à Saúde.\n\nRegras:\n- Sempre trate o lead pelo nome\n- Seja empático e profissional\n- Nunca revele que é uma IA\n- Use linguagem acessível`}
          className="min-h-[300px] text-xs font-mono resize-none h-full"
        />
      </div>
    </div>
  );
}
