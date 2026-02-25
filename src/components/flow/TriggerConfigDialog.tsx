import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Hand, MessageSquareText, UserPlus, Webhook, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export type TriggerType = 'manual' | 'keyword' | 'new_conversation' | 'webhook';

export interface TriggerConfig {
  type: TriggerType;
  keywords?: string[];
  webhookUrl?: string;
}

interface TriggerConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerType: TriggerType;
  triggerConfig: Record<string, unknown>;
  onSave: (type: TriggerType, config: Record<string, unknown>) => void;
  flowId?: string;
}

const triggerOptions = [
  {
    id: 'manual' as TriggerType,
    label: 'Manual',
    description: 'Disparado manualmente pelo operador',
    icon: Hand,
  },
  {
    id: 'keyword' as TriggerType,
    label: 'Palavra-chave',
    description: 'Quando o cliente envia uma mensagem com palavra específica',
    icon: MessageSquareText,
  },
  {
    id: 'new_conversation' as TriggerType,
    label: 'Nova Conversa',
    description: 'Quando um novo contato inicia uma conversa',
    icon: UserPlus,
  },
  {
    id: 'webhook' as TriggerType,
    label: 'Webhook',
    description: 'Disparado por uma chamada HTTP externa',
    icon: Webhook,
  },
];

export function TriggerConfigDialog({
  open,
  onOpenChange,
  triggerType,
  triggerConfig,
  onSave,
  flowId,
}: TriggerConfigDialogProps) {
  const [selectedType, setSelectedType] = useState<TriggerType>(triggerType);
  const [keywords, setKeywords] = useState('');
  const [copied, setCopied] = useState(false);

  // Generate webhook URL based on flowId
  const webhookUrl = flowId 
    ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/flow-webhook/${flowId}`
    : '';

  useEffect(() => {
    setSelectedType(triggerType);
    if (triggerConfig.keywords && Array.isArray(triggerConfig.keywords)) {
      setKeywords((triggerConfig.keywords as string[]).join(', '));
    } else {
      setKeywords('');
    }
  }, [triggerType, triggerConfig, open]);

  const handleSave = () => {
    const config: Record<string, unknown> = {};
    
    if (selectedType === 'keyword') {
      config.keywords = keywords
        .split(',')
        .map(k => k.trim().toLowerCase())
        .filter(k => k.length > 0);
    }
    
    if (selectedType === 'webhook') {
      config.webhookUrl = webhookUrl;
    }

    onSave(selectedType, config);
    onOpenChange(false);
  };

  const handleCopyWebhook = async () => {
    if (webhookUrl) {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Configurar Gatilho</DialogTitle>
          <DialogDescription>
            Escolha como o fluxo será iniciado automaticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <RadioGroup
            value={selectedType}
            onValueChange={(value) => setSelectedType(value as TriggerType)}
            className="space-y-3"
          >
            {triggerOptions.map((option) => {
              const Icon = option.icon;
              const isSelected = selectedType === option.id;

              return (
                <div key={option.id}>
                  <Label
                    htmlFor={option.id}
                    className={cn(
                      "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-muted-foreground/50"
                    )}
                  >
                    <RadioGroupItem value={option.id} id={option.id} className="mt-0.5" />
                    <div className={cn(
                      "h-8 w-8 rounded-md flex items-center justify-center flex-shrink-0",
                      isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    )}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{option.label}</p>
                      <p className="text-xs text-muted-foreground">{option.description}</p>
                    </div>
                  </Label>

                  {/* Keyword config */}
                  {isSelected && option.id === 'keyword' && (
                    <div className="mt-3 ml-11 space-y-2">
                      <Label htmlFor="keywords" className="text-sm">
                        Palavras-chave (separadas por vírgula)
                      </Label>
                      <Textarea
                        id="keywords"
                        value={keywords}
                        onChange={(e) => setKeywords(e.target.value)}
                        placeholder="oi, olá, bom dia, boa tarde"
                        className="min-h-[60px] text-sm"
                      />
                      <p className="text-xs text-muted-foreground">
                        O fluxo será acionado quando o cliente enviar qualquer uma dessas palavras.
                      </p>
                    </div>
                  )}

                  {/* Webhook config */}
                  {isSelected && option.id === 'webhook' && (
                    <div className="mt-3 ml-11 space-y-2">
                      <Label className="text-sm">URL do Webhook</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          value={webhookUrl}
                          readOnly
                          className="text-xs font-mono bg-muted"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={handleCopyWebhook}
                          className="flex-shrink-0"
                        >
                          {copied ? (
                            <Check className="h-4 w-4 text-primary" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Faça uma requisição POST para esta URL com o body: {`{ "conversationId": "..." }`}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </RadioGroup>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
