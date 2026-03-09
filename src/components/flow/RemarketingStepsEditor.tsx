import { useState } from 'react';
import { Plus, Trash2, Sparkles, Loader2, Clock, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const generateId = () => Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

interface RemarketingStepsEditorProps {
  localData: Record<string, unknown>;
  handleChange: (key: string, value: unknown) => void;
}

export function RemarketingStepsEditor({ localData, handleChange }: RemarketingStepsEditorProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const steps = (localData.remarketingSteps as any[]) || [];

  const quietHoursEnabled = (localData.remarketingQuietHours as boolean) || false;
  const quietStart = (localData.remarketingQuietStart as string) || '22:00';
  const quietEnd = (localData.remarketingQuietEnd as string) || '08:00';

  return (
    <div className="space-y-2 pt-2 border-t border-border/50">
      <Label className="text-xs font-semibold">Sequência de Follow-up</Label>
      <p className="text-[10px] text-muted-foreground">
        Cada tentativa aguarda o tempo configurado após a anterior. Se o usuário não responder, segue pela saída vermelha.
      </p>

      {steps.map((step: any, idx: number) => (
        <div key={step.id} className="border border-border rounded-lg p-2 space-y-2 bg-muted/30">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium text-muted-foreground">Tentativa {idx + 1}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-destructive"
              onClick={() => {
                const newSteps = [...steps];
                newSteps.splice(idx, 1);
                handleChange('remarketingSteps', newSteps);
              }}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
          <Select
            value={String(step.delayMinutes)}
            onValueChange={(v) => {
              const newSteps = [...steps];
              newSteps[idx] = { ...newSteps[idx], delayMinutes: parseFloat(v) };
              handleChange('remarketingSteps', newSteps);
            }}
          >
            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="4.55">4m33s</SelectItem>
              <SelectItem value="10">10 min</SelectItem>
              <SelectItem value="30">30 min</SelectItem>
              <SelectItem value="60">1 hora</SelectItem>
              <SelectItem value="120">2 horas</SelectItem>
              <SelectItem value="1440">1 dia</SelectItem>
              <SelectItem value="4320">3 dias</SelectItem>
              <SelectItem value="7200">5 dias</SelectItem>
              <SelectItem value="14400">10 dias</SelectItem>
            </SelectContent>
          </Select>
          <Textarea
            value={step.message || ''}
            onChange={(e) => {
              const newSteps = [...steps];
              newSteps[idx] = { ...newSteps[idx], message: e.target.value };
              handleChange('remarketingSteps', newSteps);
            }}
            placeholder="Mensagem de follow-up..."
            className="min-h-[50px] text-xs"
          />
        </div>
      ))}

      <Button
        variant="outline"
        size="sm"
        className="w-full gap-2 border-dashed"
        onClick={() => {
          handleChange('remarketingSteps', [...steps, { id: generateId(), delayMinutes: 10, message: '' }]);
        }}
      >
        <Plus className="h-3.5 w-3.5" />
        Adicionar tentativa
      </Button>

      {/* AI Generation */}
      {steps.length > 0 && (
        <div className="p-3 rounded-lg border border-dashed border-blue-500/40 bg-blue-500/5 space-y-2">
          <div className="flex items-center gap-2 text-blue-600">
            <Sparkles className="h-3.5 w-3.5" />
            <span className="text-[10px] font-semibold">Gerar mensagens com IA</span>
          </div>
          <Textarea
            value={(localData.remarketingContext as string) || ''}
            onChange={(e) => handleChange('remarketingContext', e.target.value)}
            placeholder="Contexto: ex. Estou perguntando o nome do cliente para cadastro..."
            className="min-h-[40px] text-xs"
          />
          <Button
            size="sm"
            className="w-full h-8 gap-2 bg-blue-600 hover:bg-blue-700 text-white text-xs"
            disabled={isGenerating || !localData.remarketingContext}
            onClick={async () => {
              setIsGenerating(true);
              try {
                const { data, error } = await supabase.functions.invoke('generate-remarketing-messages', {
                  body: {
                    context: localData.remarketingContext,
                    steps: steps.map((s: any) => ({
                      id: s.id,
                      delayMinutes: s.delayMinutes,
                    })),
                  }
                });
                if (error) throw error;
                if (data?.steps) {
                  handleChange('remarketingSteps', data.steps);
                  toast.success('Mensagens geradas com sucesso!');
                }
              } catch (err) {
                console.error(err);
                toast.error('Erro ao gerar mensagens com IA.');
              } finally {
                setIsGenerating(false);
              }
            }}
          >
            {isGenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            {isGenerating ? 'Gerando...' : 'Gerar mensagens'}
          </Button>
        </div>
      )}
    </div>
  );
}
