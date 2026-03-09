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
import { Sparkles, Loader2, Save, Send, CheckCircle2 } from "lucide-react";
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
  const [refinedFeedback, setRefinedFeedback] = useState("");
  const [isDrafting, setIsDrafting] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [target, setTarget] = useState<"base_agent" | "flow_node" | "master_prompt">("base_agent");

  // Determine available targets based on metadata
  const canUpdateFlow = !!metadata.flow_id && !!metadata.node_id;
  const canUpdateMaster = !!metadata.master_prompt_id;
  const canUpdateBase = !!metadata.agent_id;

  // Set default target based on availability
  useEffect(() => {
    if (open) {
      if (canUpdateFlow) setTarget("flow_node");
      else if (canUpdateBase) setTarget("base_agent");
      else if (canUpdateMaster) setTarget("master_prompt");
      
      setFeedback("");
      setRefinedFeedback("");
    }
  }, [open, canUpdateFlow, canUpdateBase, canUpdateMaster]);

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
        },
      });

      if (error) throw error;
      setRefinedFeedback(data.refinedFeedback);
      toast.success("Sugestão de prompt gerada com sucesso!");
    } catch (error) {
      console.error("AI Draft error:", error);
      toast.error("Não foi possível gerar a sugestão da IA.");
    } finally {
      setIsDrafting(false);
    }
  };

  const handleApply = async () => {
    const finalFeedback = refinedFeedback || feedback;
    if (!finalFeedback.trim()) return;

    setIsApplying(true);
    try {
      const { data, error } = await supabase.functions.invoke("train-ai-agent", {
        body: {
          mode: "apply",
          feedback: finalFeedback.trim(),
          target,
          context: {
            agentId: metadata.agent_id,
            flowId: metadata.flow_id,
            nodeId: metadata.node_id,
            masterPromptId: metadata.master_prompt_id,
          },
          organizationId,
          messageId,
        },
      });

      if (error) throw error;
      toast.success("Treinamento aplicado com sucesso!");
      onOpenChange(false);
    } catch (error) {
      console.error("Apply training error:", error);
      toast.error("Erro ao aplicar o treinamento.");
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
            Ajuste o comportamento do agente com base nesta interação.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Original Message Quote */}
          <div className="p-3 rounded-lg bg-muted/50 border border-border/50 text-xs text-muted-foreground italic">
            <p className="font-semibold mb-1 NOT-ITALIC not-italic text-[10px] uppercase tracking-wider opacity-70">Mensagem da IA:</p>
            "{originalMessage}"
          </div>

          {/* User Feedback Input */}
          <div className="space-y-2">
            <Label htmlFor="feedback" className="text-sm font-medium">
              O que deve mudar?
            </Label>
            <div className="flex gap-2">
              <Textarea
                id="feedback"
                placeholder="Ex: Não use emojis, ou peça o CPF imediatamente..."
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                className="min-h-[80px] resize-none focus-visible:ring-primary"
              />
              <Button
                variant="outline"
                size="icon"
                className="h-auto w-12 shrink-0 border-primary/20 hover:border-primary/50 hover:bg-primary/5"
                onClick={handleDraftAI}
                disabled={isDrafting || !feedback.trim()}
                title="Melhorar com IA"
              >
                {isDrafting ? (
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                ) : (
                  <Sparkles className="h-5 w-5 text-primary" />
                )}
              </Button>
            </div>
          </div>

          {/* Refined Feedback / Prompt Rule */}
          {(refinedFeedback || isDrafting) && (
            <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
              <Label className="text-sm font-medium flex items-center gap-1.5 text-primary">
                <CheckCircle2 className="h-4 w-4" />
                Regra sugerida (pode editar):
              </Label>
              <Textarea
                value={refinedFeedback}
                onChange={(e) => setRefinedFeedback(e.target.value)}
                placeholder="Aguardando sugestão da IA..."
                className="min-h-[80px] border-primary/20 bg-primary/5 focus-visible:ring-primary"
                disabled={isDrafting}
              />
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
              {canUpdateFlow && (
                <div className="flex items-center space-x-2 rounded-md border border-border p-3 transition-colors hover:bg-muted/50 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                  <RadioGroupItem value="flow_node" id="target-flow" />
                  <Label htmlFor="target-flow" className="flex-1 cursor-pointer font-normal">
                    <span className="font-semibold block">Apenas neste Bloco do Fluxo</span>
                    <span className="text-xs text-muted-foreground">A regra será aplicada apenas a esta etapa específica do atendimento.</span>
                  </Label>
                </div>
              )}
              {canUpdateBase && (
                <div className="flex items-center space-x-2 rounded-md border border-border p-3 transition-colors hover:bg-muted/50 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                  <RadioGroupItem value="base_agent" id="target-agent" />
                  <Label htmlFor="target-agent" className="flex-1 cursor-pointer font-normal">
                    <span className="font-semibold block">No Agente Base</span>
                    <span className="text-xs text-muted-foreground">O agente aprenderá esta regra para todas as interações.</span>
                  </Label>
                </div>
              )}
              {canUpdateMaster && (
                <div className="flex items-center space-x-2 rounded-md border border-border p-3 transition-colors hover:bg-muted/50 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                  <RadioGroupItem value="master_prompt" id="target-master" />
                  <Label htmlFor="target-master" className="flex-1 cursor-pointer font-normal">
                    <span className="font-semibold block">No Prompt Mestre (Global)</span>
                    <span className="text-xs text-muted-foreground">Afeta todos os agentes que usam este prompt mestre.</span>
                  </Label>
                </div>
              )}
            </RadioGroup>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            className="bg-primary hover:bg-primary/90 text-white gap-2" 
            onClick={handleApply}
            disabled={isApplying || isDrafting || (!feedback.trim() && !refinedFeedback.trim())}
          >
            {isApplying ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {isApplying ? "Salvando..." : "Salvar e Aplicar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
