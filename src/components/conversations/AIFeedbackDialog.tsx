import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Sparkles, Loader2, Save, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/train-ai-agent`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Robust fetch with automatic retry — never throws to the user
async function callTrainAgent(body: Record<string, unknown>, maxRetries = 2): Promise<{ success: boolean; [key: string]: unknown }> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const resp = await fetch(FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ANON_KEY}`,
          'apikey': ANON_KEY,
        },
        body: JSON.stringify(body),
      });

      // Try to parse JSON regardless of status
      let data: any;
      try {
        data = await resp.json();
      } catch {
        // If JSON parsing fails, create a fallback
        data = { success: false, error: `Resposta inesperada do servidor (status ${resp.status})` };
      }

      // If we got a valid response (even with error), return it
      if (data && typeof data === 'object') {
        return data;
      }

      return { success: false, error: 'Resposta vazia do servidor' };
    } catch (fetchError) {
      console.warn(`[AIFeedback] Attempt ${attempt + 1} failed:`, fetchError);
      if (attempt < maxRetries) {
        // Wait before retry (500ms, 1000ms)
        await new Promise(r => setTimeout(r, (attempt + 1) * 500));
        continue;
      }
      return { success: false, error: 'Não foi possível conectar ao servidor. Verifique sua conexão.' };
    }
  }
  return { success: false, error: 'Falha após múltiplas tentativas' };
}

interface AIFeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messageId: string;
  originalMessage: string;
  metadata: {
    agent_id?: string;
    master_prompt_id?: string;
    node_id?: string;
    flow_id?: string;
  };
  organizationId: string;
}

export function AIFeedbackDialog({
  open,
  onOpenChange,
  messageId,
  originalMessage,
  metadata,
  organizationId,
}: AIFeedbackDialogProps) {
  const [feedback, setFeedback] = useState("");
  const [situation, setSituation] = useState("");
  const [ruleText, setRuleText] = useState("");
  const [isDrafting, setIsDrafting] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [hasDrafted, setHasDrafted] = useState(false);
  const [target, setTarget] = useState<"agent" | "flow_node" | "master_prompt">("agent");

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setTarget("agent");
      setFeedback("");
      setSituation("");
      setRuleText("");
      setHasDrafted(false);
    }
  }, [open]);

  const handleDraftAI = async () => {
    if (!feedback.trim()) return;
    setIsDrafting(true);
    try {
      const data = await callTrainAgent({
        mode: "draft",
        feedback: feedback.trim(),
        originalMessage: originalMessage || "",
        organizationId,
        messageId,
      });

      if (data.error) {
        toast.error(String(data.error));
        return;
      }

      setSituation(String(data.situation || ''));
      setRuleText(String(data.rule || ''));
      setHasDrafted(true);
      toast.success("Regra gerada com sucesso!");
    } finally {
      setIsDrafting(false);
    }
  };

  const handleApply = async () => {
    if (!situation.trim() || !ruleText.trim()) {
      toast.error("Preencha a situação e a regra antes de salvar.");
      return;
    }

    if (!organizationId) {
      toast.error("Sessão expirada. Recarregue a página.");
      return;
    }

    setIsApplying(true);
    try {
      const data = await callTrainAgent({
        mode: "apply",
        feedback: feedback.trim() || null,
        situation: situation.trim(),
        rule: ruleText.trim(),
        target,
        context: {
          agentId: metadata.agent_id || null,
          flowId: metadata.flow_id || null,
          nodeId: metadata.node_id || null,
          masterPromptId: metadata.master_prompt_id || null,
        },
        organizationId,
        messageId,
        originalMessage: originalMessage || "",
      });

      if (data.error) {
        toast.error(String(data.error));
        return;
      }

      toast.success("Regra salva com sucesso!");
      onOpenChange(false);
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] bg-card border-border shadow-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <DialogTitle className="text-xl">Treinar Inteligência</DialogTitle>
          </div>
          <DialogDescription>
            Crie uma regra contextual para o agente aprender com esta interação.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Original Message Quote */}
          <div className="p-3 rounded-lg bg-muted/50 border border-border/50 text-xs text-muted-foreground italic">
            <p className="font-semibold mb-1 not-italic text-[10px] uppercase tracking-wider opacity-70">Mensagem da IA:</p>
            "{originalMessage?.length > 200 ? originalMessage.slice(0, 200) + '...' : originalMessage}"
          </div>

          {/* User Feedback Input */}
          <div className="space-y-2">
            <Label htmlFor="feedback" className="text-sm font-medium">
              O que deve mudar?
            </Label>
            <div className="flex gap-2">
              <Textarea
                id="feedback"
                placeholder="Ex: Não deveria negar o direito. Deveria investigar se há período de graça estendido..."
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                className="min-h-[70px] resize-none focus-visible:ring-primary"
              />
              <Button
                variant="outline"
                size="icon"
                className="h-auto w-12 shrink-0 border-primary/20 hover:border-primary/50 hover:bg-primary/5"
                onClick={handleDraftAI}
                disabled={isDrafting || !feedback.trim()}
                title="Gerar regra com IA"
              >
                {isDrafting ? (
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                ) : (
                  <Sparkles className="h-5 w-5 text-primary" />
                )}
              </Button>
            </div>
          </div>

          {/* Structured Rule Fields */}
          {(hasDrafted || situation || ruleText) && (
            <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-1.5 text-primary">
                  <CheckCircle2 className="h-4 w-4" />
                  Situação (quando aplicar):
                </Label>
                <Textarea
                  value={situation}
                  onChange={(e) => setSituation(e.target.value)}
                  placeholder="Ex: Quando o cliente pergunta sobre direito a benefício do INSS..."
                  className="min-h-[50px] border-primary/20 bg-primary/5 focus-visible:ring-primary resize-none"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-1.5 text-primary">
                  <CheckCircle2 className="h-4 w-4" />
                  Regra (o que fazer):
                </Label>
                <Textarea
                  value={ruleText}
                  onChange={(e) => setRuleText(e.target.value)}
                  placeholder="Ex: Não negar o direito. Investigar se há período de graça estendido..."
                  className="min-h-[50px] border-primary/20 bg-primary/5 focus-visible:ring-primary resize-none"
                />
              </div>
            </div>
          )}

          {/* Target Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Onde aplicar esta regra?</Label>
            <RadioGroup
              value={target}
              onValueChange={(val: any) => setTarget(val)}
              className="grid grid-cols-1 gap-2"
            >
              <div className="flex items-center space-x-2 rounded-md border border-border p-3 transition-colors hover:bg-muted/50 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                  <RadioGroupItem value="agent" id="target-agent" />
                  <Label htmlFor="target-agent" className="flex-1 cursor-pointer font-normal">
                    <span className="font-semibold block">Prompt Base (Agente)</span>
                    <span className="text-xs text-muted-foreground">O agente seguirá esta regra em todas as interações.</span>
                  </Label>
                </div>
              <div className="flex items-center space-x-2 rounded-md border border-border p-3 transition-colors hover:bg-muted/50 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                  <RadioGroupItem value="flow_node" id="target-flow" />
                  <Label htmlFor="target-flow" className="flex-1 cursor-pointer font-normal">
                    <span className="font-semibold block">Prompt Adicional (Nó do Fluxo)</span>
                    <span className="text-xs text-muted-foreground">Aplica apenas nesta etapa específica do fluxo.</span>
                  </Label>
                </div>
              <div className="flex items-center space-x-2 rounded-md border border-border p-3 transition-colors hover:bg-muted/50 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                  <RadioGroupItem value="master_prompt" id="target-master" />
                  <Label htmlFor="target-master" className="flex-1 cursor-pointer font-normal">
                    <span className="font-semibold block">Prompt Mestre (do Fluxo)</span>
                    <span className="text-xs text-muted-foreground">Afeta todos os agentes dentro deste fluxo.</span>
                  </Label>
                </div>
            </RadioGroup>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2" 
            onClick={handleApply}
            disabled={isApplying || isDrafting || !situation.trim() || !ruleText.trim()}
          >
            {isApplying ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {isApplying ? "Salvando..." : "Salvar Regra"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
