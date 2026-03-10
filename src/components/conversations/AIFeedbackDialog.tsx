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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
      const { data, error } = await supabase.functions.invoke("train-ai-agent", {
        body: {
          mode: "draft",
          feedback: feedback.trim(),
          originalMessage,
          organizationId,
          messageId,
        },
      });

      if (error) {
        console.error("AI Draft invoke error:", error);
        throw new Error(typeof error === 'object' && error.message ? error.message : String(error));
      }
      
      // Handle edge function returning error in body
      if (data?.error) {
        throw new Error(data.error);
      }

      setSituation(data?.situation || '');
      setRuleText(data?.rule || '');
      setHasDrafted(true);
      toast.success("Regra gerada com sucesso!");
    } catch (error: any) {
      console.error("AI Draft error:", error);
      const msg = error?.message || "Erro desconhecido";
      toast.error(`Não foi possível gerar a sugestão: ${msg}`);
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
      toast.error("Organização não identificada. Recarregue a página.");
      return;
    }

    setIsApplying(true);
    try {
      const body = {
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
        originalMessage,
      };

      console.log("[AIFeedback] Saving rule with body:", JSON.stringify(body, null, 2));

      const { data, error } = await supabase.functions.invoke("train-ai-agent", {
        body,
      });

      if (error) {
        console.error("[AIFeedback] Invoke error:", error);
        throw new Error(typeof error === 'object' && error.message ? error.message : String(error));
      }

      // Handle edge function returning error in body
      if (data?.error) {
        console.error("[AIFeedback] Function returned error:", data.error);
        throw new Error(data.error);
      }

      toast.success("Regra salva com sucesso!");
      onOpenChange(false);
    } catch (error: any) {
      console.error("Apply training error:", error);
      const msg = error?.message || "Erro desconhecido";
      toast.error(`Erro ao salvar a regra: ${msg}`);
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
