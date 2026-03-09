import { useState, useEffect } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    Sparkles,
    Send,
    Loader2,
    Bot,
    User,
    Wand2,
    Copy,
    Check
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { TrainingRulesList } from '@/components/agents/TrainingRulesList';

interface MasterPromptDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    prompt: string;
    onSave: (newPrompt: string) => void;
    organizationId?: string;
    flowId?: string;
}

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

export function MasterPromptDialog({
    open,
    onOpenChange,
    prompt: initialPrompt,
    onSave,
    organizationId,
    flowId,
}: MasterPromptDialogProps) {
    const [localPrompt, setLocalPrompt] = useState(initialPrompt);
    const [chatMessages, setChatMessages] = useState<Message[]>([]);
    const [userInput, setUserInput] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [hasCopied, setHasCopied] = useState(false);

    useEffect(() => {
        if (open) {
            setLocalPrompt(initialPrompt);
        }
    }, [open, initialPrompt]);

    const handleSendMessage = async () => {
        if (!userInput.trim() || isGenerating) return;

        const newMessage: Message = { role: 'user', content: userInput };
        setChatMessages((prev) => [...prev, newMessage]);
        setUserInput('');
        setIsGenerating(true);

        try {
            const { data, error } = await supabase.functions.invoke('generate-agent-prompt', {
                body: {
                    userDescription: userInput,
                    agentName: 'Mestre',
                    agentRole: 'Orquestrador Global',
                    organizationId: organizationId,
                },
            });

            if (error) throw error;

            if (data?.prompt) {
                setChatMessages((prev) => [
                    ...prev,
                    { role: 'assistant', content: data.prompt }
                ]);
            }
        } catch (error) {
            console.error('Error calling AI assistant:', error);
            toast.error('Erro ao chamar assistente de IA');
            setChatMessages((prev) => [
                ...prev,
                { role: 'assistant', content: 'Desculpe, tive um erro ao processar sua solicitação.' }
            ]);
        } finally {
            setIsGenerating(false);
        }
    };

    const applyAISuggestion = (content: string) => {
        setLocalPrompt(content);
        toast.success('Sugestão aplicada ao prompt mestre!');
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(localPrompt);
        setHasCopied(true);
        setTimeout(() => setHasCopied(false), 2000);
        toast.success('Prompt copiado!');
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-5xl h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
                <DialogHeader className="p-6 border-b">
                    <DialogTitle className="flex items-center gap-2 text-xl">
                        <Wand2 className="h-5 w-5 text-indigo-500" />
                        Prompt Mestre
                    </DialogTitle>
                    <p className="text-sm text-muted-foreground">
                        Defina a personalidade e as regras globais que todos os agentes do fluxo devem seguir.
                    </p>
                </DialogHeader>

                <div className="flex-1 flex overflow-hidden">
                    {/* Lado Esquerdo: Editor Principal */}
                    <div className="flex-1 flex flex-col p-6 border-r bg-muted/5">
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-sm font-medium">Conteúdo do Prompt</label>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleCopy}
                                className="h-8 gap-1.5 transition-all"
                            >
                                {hasCopied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                                {hasCopied ? 'Copiado' : 'Copiar'}
                            </Button>
                        </div>
                        <Textarea
                            value={localPrompt}
                            onChange={(e) => setLocalPrompt(e.target.value)}
                            placeholder="Ex: Você é um assistente jurídico especializado em direito previdenciário. Mantenha um tom profissional e acolhedor..."
                            className="flex-1 resize-none font-mono text-sm leading-relaxed focus-visible:ring-indigo-500/30"
                        />
                    </div>

                    {/* Lado Direito: Assistente de IA */}
                    <div className="w-[350px] flex flex-col bg-background">
                        <div className="p-4 border-b bg-indigo-50/50 dark:bg-indigo-900/10 flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-indigo-500" />
                            <span className="text-sm font-semibold text-indigo-700 dark:text-indigo-400">Assistente de IA</span>
                        </div>

                        <ScrollArea className="flex-1 p-4">
                            <div className="space-y-4">
                                {chatMessages.length === 0 && (
                                    <div className="text-center py-8 px-4">
                                        <Bot className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                                        <p className="text-xs text-muted-foreground">
                                            Diga o que você espera do seu fluxo e eu te ajudo a estruturar o prompt perfeito.
                                        </p>
                                    </div>
                                )}

                                {chatMessages.map((msg, i) => (
                                    <div
                                        key={i}
                                        className={`flex flex-col gap-1.5 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                                    >
                                        <div className="flex items-center gap-1.5">
                                            {msg.role === 'assistant' ? <Bot className="h-3 w-3 text-indigo-500" /> : <User className="h-3 w-3 text-muted-foreground" />}
                                            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                                {msg.role === 'user' ? 'Você' : 'Assistente'}
                                            </span>
                                        </div>
                                        <div className={`
                      text-xs p-3 rounded-2xl max-w-[90%]
                      ${msg.role === 'user'
                                                ? 'bg-indigo-600 text-white rounded-tr-none'
                                                : 'bg-muted text-foreground rounded-tl-none border shadow-sm'}
                    `}>
                                            {msg.content}

                                            {msg.role === 'assistant' && (
                                                <Button
                                                    size="sm"
                                                    variant="secondary"
                                                    onClick={() => applyAISuggestion(msg.content)}
                                                    className="w-full mt-3 h-7 text-[10px] gap-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border-none"
                                                >
                                                    <Check className="h-3 w-3" />
                                                    Aplicar Sugestão
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                ))}

                                {isGenerating && (
                                    <div className="flex flex-col gap-1.5 items-start">
                                        <div className="flex items-center gap-1.5">
                                            <Bot className="h-3 w-3 text-indigo-500" />
                                            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Assistente</span>
                                        </div>
                                        <div className="bg-muted p-3 rounded-2xl rounded-tl-none border shadow-sm flex items-center gap-2">
                                            <Loader2 className="h-3 w-3 animate-spin text-indigo-500" />
                                            <span className="text-xs text-muted-foreground italic">Escrevendo...</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </ScrollArea>

                        <div className="p-4 border-t">
                            <div className="relative">
                                <Textarea
                                    value={userInput}
                                    onChange={(e) => setUserInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleSendMessage();
                                        }
                                    }}
                                    placeholder="Peça ajuda para a IA..."
                                    className="min-h-[80px] pr-10 py-3 text-xs leading-relaxed focus-visible:ring-indigo-500/30 resize-none opacity-80 focus:opacity-100 transition-opacity"
                                />
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={handleSendMessage}
                                    disabled={!userInput.trim() || isGenerating}
                                    className="absolute right-2 bottom-2 h-7 w-7 text-indigo-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                                >
                                    {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                </Button>
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-2 text-center italic">
                                Pressione Enter para enviar
                            </p>
                        </div>
                    </div>
                </div>

                <DialogFooter className="p-4 border-t bg-muted/30">
                    <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isGenerating}>
                        Cancelar
                    </Button>
                    <Button
                        className="bg-indigo-600 hover:bg-indigo-700 gap-1.5 shadow-lg shadow-indigo-500/20"
                        onClick={() => {
                            onSave(localPrompt);
                            onOpenChange(false);
                        }}
                        disabled={isGenerating}
                    >
                        <Check className="h-4 w-4" />
                        Salvar Prompt Mestre
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
