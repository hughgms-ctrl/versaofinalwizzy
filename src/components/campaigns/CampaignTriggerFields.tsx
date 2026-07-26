import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { MessageSquareText, Tag, Webhook, Copy, Check, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface TagOption {
    id: string;
    name: string;
    color?: string;
}

interface CampaignTriggerFieldsProps {
    triggerType: string;
    onTriggerTypeChange: (value: string) => void;
    triggerKeyword: string;
    onTriggerKeywordChange: (value: string) => void;
    matchType: string;
    onMatchTypeChange: (value: string) => void;
    tags: TagOption[];
    /** Vazio até a campanha existir de verdade -- mostra o placeholder "salve primeiro". */
    webhookUrl: string;
    onCopyWebhookUrl: () => void;
    copied: boolean;
    /** Omitido quando ainda não há campanha salva pra rotacionar o token. */
    onRotateWebhookUrl?: () => void;
    isRotatingWebhookUrl?: boolean;
}

// Bloco "Gatilho (Como a campanha inicia?)" -- extraído de CampaignDialog.tsx
// pra ser reaproveitado também na criação guiada de orquestração (ver
// conversa com o usuário: "a palavra chave teria que configurar tipo quando
// configura dentro de campanhas, não é só palavra-chave").
export function CampaignTriggerFields({
    triggerType,
    onTriggerTypeChange,
    triggerKeyword,
    onTriggerKeywordChange,
    matchType,
    onMatchTypeChange,
    tags,
    webhookUrl,
    onCopyWebhookUrl,
    copied,
    onRotateWebhookUrl,
    isRotatingWebhookUrl,
}: CampaignTriggerFieldsProps) {
    const triggerOptions = [
        {
            id: 'keyword',
            label: 'Palavra-chave',
            description: 'Quando o cliente envia uma mensagem com palavra específica',
            icon: MessageSquareText,
        },
        {
            id: 'tag_added',
            label: 'Tag Adicionada',
            description: 'Quando uma tag específica é adicionada ao contato',
            icon: Tag,
        },
        {
            id: 'webhook',
            label: 'Webhook',
            description: 'Disparado por uma chamada HTTP externa',
            icon: Webhook,
        },
    ];

    return (
        <div className="grid gap-2">
            <Label>Gatilho (Como a campanha inicia?)</Label>
            <RadioGroup
                value={triggerType}
                onValueChange={onTriggerTypeChange}
                className="space-y-3 mt-2"
            >
                {triggerOptions.map((option) => {
                    const Icon = option.icon;
                    const isSelected = triggerType === option.id;

                    return (
                        <div key={option.id}>
                            <Label
                                htmlFor={option.id}
                                className={cn(
                                    "flex items-start gap-4 p-4 rounded-xl border cursor-pointer transition-all hover:bg-muted/50",
                                    isSelected
                                        ? "border-primary bg-primary/5 hover:bg-primary/5"
                                        : "border-border"
                                )}
                            >
                                <RadioGroupItem value={option.id} id={option.id} className="mt-1" />
                                <div className={cn(
                                    "h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
                                    isSelected ? "bg-primary text-primary-foreground shadow-md shadow-primary/20" : "bg-muted text-muted-foreground"
                                )}>
                                    <Icon className="h-5 w-5" />
                                </div>
                                <div className="flex-1">
                                    <p className="text-sm font-semibold text-foreground">{option.label}</p>
                                    <p className="text-[13px] text-muted-foreground mt-0.5">{option.description}</p>
                                </div>
                            </Label>

                            {/* Mostrar opções extras se for Palavra Chave */}
                            {isSelected && option.id === 'keyword' && (
                                <div className="mt-4 ml-14 space-y-4 p-4 rounded-lg border bg-muted/10">
                                    <div className="grid gap-2">
                                        <Label htmlFor="keyword" className="text-xs">Palavras-chave</Label>
                                        <Textarea
                                            id="keyword"
                                            placeholder="Ex: QUERO, SIM, promoção"
                                            value={triggerKeyword}
                                            onChange={(e) => onTriggerKeywordChange(e.target.value)}
                                            className="min-h-[60px] text-sm"
                                        />
                                        <p className="text-[10px] text-muted-foreground">
                                            Separe as palavras por vírgula.
                                        </p>
                                    </div>

                                    <div className="grid gap-2">
                                        <Label className="text-xs">Regra</Label>
                                        <Select value={matchType} onValueChange={onMatchTypeChange}>
                                            <SelectTrigger className="h-9">
                                                <SelectValue placeholder="Selecione a regra" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="exact">Mensagem exata (só a palavra)</SelectItem>
                                                <SelectItem value="contains">Contém a palavra na frase</SelectItem>
                                                <SelectItem value="starts_with">Frase começa com a palavra</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            )}

                            {/* Mostrar opções se for Tag Adicionada */}
                            {isSelected && option.id === 'tag_added' && (
                                <div className="mt-4 ml-14 space-y-4 p-4 rounded-lg border bg-muted/10">
                                    <div className="grid gap-2">
                                        <Label className="text-xs">Tag</Label>
                                        <Select value={triggerKeyword} onValueChange={onTriggerKeywordChange}>
                                            <SelectTrigger className="h-9">
                                                <SelectValue placeholder="Selecione a tag" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {tags.map((tag) => (
                                                    <SelectItem key={tag.id} value={tag.id}>
                                                        <div className="flex items-center gap-2">
                                                            <div
                                                                className="w-3 h-3 rounded-full"
                                                                style={{ backgroundColor: tag.color || '#6366f1' }}
                                                            />
                                                            {tag.name}
                                                        </div>
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            )}

                            {/* Mensagem para Webhook */}
                            {isSelected && option.id === 'webhook' && (
                                <div className="mt-4 ml-14 p-4 rounded-lg border bg-primary/5 space-y-3">
                                    <p className="text-sm text-foreground font-medium">Como utilizar este webhook?</p>
                                    <p className="text-xs text-muted-foreground">
                                        Faça uma requisição HTTP <strong>POST</strong> para a URL abaixo enviando o número e os dados do contato. Cada contato cria/atualiza o cadastro, abre uma conversa e dispara o fluxo selecionado.
                                    </p>
                                    {webhookUrl ? (
                                        <>
                                            <div className="grid gap-1.5">
                                                <Label className="text-xs">URL do Webhook (POST)</Label>
                                                <div className="flex items-center gap-2">
                                                    <code className="flex-1 bg-background border rounded px-2 py-1.5 text-[10px] sm:text-xs text-muted-foreground break-all font-mono">
                                                        {webhookUrl}
                                                    </code>
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="icon"
                                                        className="h-8 w-8 shrink-0"
                                                        onClick={onCopyWebhookUrl}
                                                        title="Copiar URL"
                                                    >
                                                        {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                                                    </Button>
                                                </div>
                                            </div>

                                            <div className="bg-background border rounded p-3 mt-1">
                                                <code className="text-[10px] sm:text-xs text-muted-foreground break-all whitespace-pre-wrap font-mono">
                                                    {`curl -X POST "${webhookUrl}" \\
  -H "Content-Type: application/json" \\
  -d '{"phone": "5511999999999", "name": "João", "cpf": "123"}'`}
                                                </code>
                                            </div>

                                            <p className="text-[11px] text-muted-foreground">
                                                Para disparar para vários contatos de uma vez, envie uma lista: <code className="font-mono">[{`{"phone": "..."}`}, {`{"phone": "..."}`}]</code> (até 100 por chamada).
                                            </p>
                                            <p className="text-[11px] text-muted-foreground">
                                                Os campos enviados ficam disponíveis no fluxo como <code className="font-mono">{`{{phone}}`}</code>, <code className="font-mono">{`{{name}}`}</code>, <code className="font-mono">{`{{cpf}}`}</code> etc.
                                            </p>

                                            {onRotateWebhookUrl && (
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-7 px-2 text-xs text-muted-foreground"
                                                    onClick={onRotateWebhookUrl}
                                                    disabled={isRotatingWebhookUrl}
                                                >
                                                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                                                    Gerar nova URL
                                                </Button>
                                            )}
                                        </>
                                    ) : (
                                        <p className="text-xs text-muted-foreground italic mt-2">
                                            Salve a campanha primeiro para ver a URL do webhook.
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </RadioGroup>
        </div>
    );
}
