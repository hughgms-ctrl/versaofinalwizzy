import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { 
  Play, 
  Send, 
  Bot, 
  User, 
  Loader2,
  RotateCcw,
  X,
  CheckCheck,
  Clock,
  Image as ImageIcon,
  Video,
  Music,
  FileText,
  Smartphone
} from 'lucide-react';
import { useFlow } from '@/hooks/useFlows';
import { Node, Edge } from '@xyflow/react';
import { ContentItem } from '@/types/flow';
import { cn } from '@/lib/utils';

interface FlowTestPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flowId: string;
  flowName: string;
}

interface SimulatedMessage {
  id: string;
  type: 'user' | 'bot' | 'system';
  content: string;
  mediaType?: 'image' | 'video' | 'audio' | 'document';
  mediaUrl?: string;
  timestamp: Date;
  status: 'sending' | 'sent' | 'delivered' | 'read';
}

interface SimulationState {
  currentNodeId: string | null;
  waitingForInput: boolean;
  inputVariable?: string;
  inputType?: string;
  variables: Record<string, unknown>;
  pendingButtons?: Array<{ id: string; label: string }>;
}

export function FlowTestPanel({ open, onOpenChange, flowId, flowName }: FlowTestPanelProps) {
  const { data: flow } = useFlow(flowId);
  const [messages, setMessages] = useState<SimulatedMessage[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [simulationState, setSimulationState] = useState<SimulationState>({
    currentNodeId: null,
    waitingForInput: false,
    variables: {},
  });
  const [isStarted, setIsStarted] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input when waiting for user input
  useEffect(() => {
    if (simulationState.waitingForInput && inputRef.current) {
      inputRef.current.focus();
    }
  }, [simulationState.waitingForInput]);

  const resetSimulation = () => {
    setMessages([]);
    setSimulationState({
      currentNodeId: null,
      waitingForInput: false,
      variables: {},
    });
    setIsStarted(false);
    setUserInput('');
  };

  const addMessage = (msg: Omit<SimulatedMessage, 'id' | 'timestamp' | 'status'>) => {
    const newMsg: SimulatedMessage = {
      ...msg,
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: new Date(),
      status: msg.type === 'bot' ? 'sending' : 'sent',
    };
    setMessages(prev => [...prev, newMsg]);

    // Simulate message delivery
    if (msg.type === 'bot') {
      setTimeout(() => {
        setMessages(prev => prev.map(m => 
          m.id === newMsg.id ? { ...m, status: 'delivered' as const } : m
        ));
      }, 500);
      setTimeout(() => {
        setMessages(prev => prev.map(m => 
          m.id === newMsg.id ? { ...m, status: 'read' as const } : m
        ));
      }, 1000);
    }

    return newMsg.id;
  };

  const findNextNode = (currentNodeId: string, nodes: Node[], edges: Edge[], outputHandle?: string): Node | null => {
    const outgoingEdge = edges.find(e => 
      e.source === currentNodeId && 
      (outputHandle ? e.sourceHandle === outputHandle : true)
    );
    if (!outgoingEdge) return null;
    return nodes.find(n => n.id === outgoingEdge.target) || null;
  };

  const processContentBlock = async (items: ContentItem[]) => {
    for (const item of items) {
      if (item.type === 'delay') {
        // Show typing indicator during delay
        addMessage({ type: 'system', content: '⏳ Digitando...' });
        await new Promise(resolve => setTimeout(resolve, (item.delaySeconds || 3) * 1000));
        setMessages(prev => prev.filter(m => m.content !== '⏳ Digitando...'));
      } else if (item.type === 'text' && item.content) {
        // Replace variables in text
        let processedContent = item.content;
        Object.entries(simulationState.variables).forEach(([key, value]) => {
          processedContent = processedContent.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
        });
        addMessage({ type: 'bot', content: processedContent });
        await new Promise(resolve => setTimeout(resolve, 800));
      } else if (['image', 'video', 'audio', 'document'].includes(item.type)) {
        addMessage({
          type: 'bot',
          content: item.caption || `[${item.type.toUpperCase()}]`,
          mediaType: item.type as 'image' | 'video' | 'audio' | 'document',
          mediaUrl: item.mediaUrl,
        });
        await new Promise(resolve => setTimeout(resolve, 800));
      }
    }
  };

  const processNode = async (node: Node, nodes: Node[], edges: Edge[]) => {
    setSimulationState(prev => ({ ...prev, currentNodeId: node.id }));

    const nodeType = node.type as string;
    const nodeData = node.data as Record<string, unknown>;

    switch (nodeType) {
      case 'start':
        // Just move to next node
        const nextAfterStart = findNextNode(node.id, nodes, edges);
        if (nextAfterStart) {
          await new Promise(resolve => setTimeout(resolve, 500));
          await processNode(nextAfterStart, nodes, edges);
        }
        break;

      case 'content-block':
        const items = (nodeData.items as ContentItem[]) || [];
        if (items.length > 0) {
          await processContentBlock(items);
        }
        const nextAfterContent = findNextNode(node.id, nodes, edges);
        if (nextAfterContent) {
          await processNode(nextAfterContent, nodes, edges);
        } else {
          addMessage({ type: 'system', content: '✅ Fluxo finalizado' });
          setSimulationState(prev => ({ ...prev, currentNodeId: null }));
        }
        break;

      case 'message-buttons':
        const buttonText = (nodeData.text as string) || 'Escolha uma opção:';
        const buttons = (nodeData.buttons as Array<{ id: string; label: string }>) || [];
        
        addMessage({ type: 'bot', content: buttonText });
        await new Promise(resolve => setTimeout(resolve, 300));
        
        if (buttons.length > 0) {
          setSimulationState(prev => ({
            ...prev,
            waitingForInput: true,
            pendingButtons: buttons.filter(b => b.label),
          }));
        } else {
          const nextAfterButtons = findNextNode(node.id, nodes, edges);
          if (nextAfterButtons) {
            await processNode(nextAfterButtons, nodes, edges);
          }
        }
        break;

      case 'user-input':
        const variableName = (nodeData.variableName as string) || 'resposta';
        const inputType = (nodeData.inputType as string) || 'text';
        const validationMessage = (nodeData.validationMessage as string);
        
        let promptText = '';
        switch (inputType) {
          case 'email': promptText = 'Digite seu e-mail:'; break;
          case 'phone': promptText = 'Digite seu telefone:'; break;
          case 'cpf': promptText = 'Digite seu CPF:'; break;
          case 'number': promptText = 'Digite um número:'; break;
          default: promptText = `Digite ${variableName}:`;
        }
        
        addMessage({ type: 'bot', content: promptText });
        
        setSimulationState(prev => ({
          ...prev,
          waitingForInput: true,
          inputVariable: variableName,
          inputType: inputType,
        }));
        break;

      case 'condition':
        const variable = (nodeData.variable as string) || '';
        const operator = (nodeData.operator as string) || 'equals';
        const value = (nodeData.value as string) || '';
        const varValue = simulationState.variables[variable];
        
        let conditionMet = false;
        switch (operator) {
          case 'equals': conditionMet = String(varValue) === value; break;
          case 'not_equals': conditionMet = String(varValue) !== value; break;
          case 'contains': conditionMet = String(varValue).includes(value); break;
          case 'greater_than': conditionMet = Number(varValue) > Number(value); break;
          case 'less_than': conditionMet = Number(varValue) < Number(value); break;
        }
        
        addMessage({ 
          type: 'system', 
          content: `🔀 Condição: ${variable} ${operator} "${value}" → ${conditionMet ? 'Sim' : 'Não'}` 
        });
        
        // Find next node based on condition (assuming 'yes' and 'no' handles)
        const nextAfterCondition = findNextNode(node.id, nodes, edges, conditionMet ? 'yes' : 'no');
        if (nextAfterCondition) {
          await processNode(nextAfterCondition, nodes, edges);
        } else {
          // Try default next
          const defaultNext = findNextNode(node.id, nodes, edges);
          if (defaultNext) {
            await processNode(defaultNext, nodes, edges);
          }
        }
        break;

      case 'action-tag':
        const action = (nodeData.action as string) || 'add';
        const tagId = (nodeData.tagId as string);
        addMessage({ 
          type: 'system', 
          content: `🏷️ Tag ${action === 'add' ? 'adicionada' : 'removida'}` 
        });
        const nextAfterTag = findNextNode(node.id, nodes, edges);
        if (nextAfterTag) {
          await processNode(nextAfterTag, nodes, edges);
        }
        break;

      case 'action-webhook':
        const webhookUrl = (nodeData.url as string) || '';
        addMessage({ 
          type: 'system', 
          content: `🌐 Webhook chamado: ${webhookUrl ? webhookUrl.slice(0, 30) + '...' : '(não configurado)'}` 
        });
        await new Promise(resolve => setTimeout(resolve, 500));
        const nextAfterWebhook = findNextNode(node.id, nodes, edges);
        if (nextAfterWebhook) {
          await processNode(nextAfterWebhook, nodes, edges);
        }
        break;

      case 'ai-handoff':
        addMessage({ type: 'system', content: '🤖 Conversa transferida para a IA' });
        setSimulationState(prev => ({ ...prev, currentNodeId: null }));
        break;

      default:
        addMessage({ type: 'system', content: `⚙️ Executando: ${nodeType}` });
        const nextNode = findNextNode(node.id, nodes, edges);
        if (nextNode) {
          await processNode(nextNode, nodes, edges);
        }
    }
  };

  const startSimulation = async () => {
    if (!flow?.nodes) return;

    resetSimulation();
    setIsStarted(true);
    setIsProcessing(true);

    addMessage({ type: 'system', content: `▶️ Iniciando simulação: "${flowName}"` });
    
    await new Promise(resolve => setTimeout(resolve, 500));

    // Find start node
    const nodes = flow.nodes as Node[];
    const edges = flow.edges as Edge[];
    const startNode = nodes.find(n => n.type === 'start');

    if (startNode) {
      await processNode(startNode, nodes, edges);
    } else {
      addMessage({ type: 'system', content: '❌ Nó inicial não encontrado' });
    }

    setIsProcessing(false);
  };

  const handleUserInput = async () => {
    if (!userInput.trim() || !flow) return;

    const inputValue = userInput.trim();
    setUserInput('');

    // Add user message
    addMessage({ type: 'user', content: inputValue });

    // If there are pending buttons, find the matching one
    if (simulationState.pendingButtons) {
      const matchedButton = simulationState.pendingButtons.find(b => 
        b.label.toLowerCase() === inputValue.toLowerCase()
      );
      
      if (matchedButton) {
        // Store the button choice
        setSimulationState(prev => ({
          ...prev,
          waitingForInput: false,
          pendingButtons: undefined,
          variables: { ...prev.variables, button_choice: matchedButton.label }
        }));
      } else {
        addMessage({ type: 'bot', content: 'Por favor, escolha uma das opções disponíveis.' });
        return;
      }
    } else if (simulationState.inputVariable) {
      // Store the variable
      setSimulationState(prev => ({
        ...prev,
        waitingForInput: false,
        inputVariable: undefined,
        inputType: undefined,
        variables: { ...prev.variables, [simulationState.inputVariable!]: inputValue }
      }));
    }

    // Continue to next node
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const nodes = flow.nodes as Node[];
    const edges = flow.edges as Edge[];
    const currentNode = nodes.find(n => n.id === simulationState.currentNodeId);
    
    if (currentNode) {
      setIsProcessing(true);
      const nextNode = findNextNode(currentNode.id, nodes, edges);
      if (nextNode) {
        await processNode(nextNode, nodes, edges);
      } else {
        addMessage({ type: 'system', content: '✅ Fluxo finalizado' });
      }
      setIsProcessing(false);
    }
  };

  const handleButtonClick = async (button: { id: string; label: string }) => {
    if (!flow) return;

    addMessage({ type: 'user', content: button.label });
    
    setSimulationState(prev => ({
      ...prev,
      waitingForInput: false,
      pendingButtons: undefined,
      variables: { ...prev.variables, button_choice: button.label }
    }));

    await new Promise(resolve => setTimeout(resolve, 300));
    
    const nodes = flow.nodes as Node[];
    const edges = flow.edges as Edge[];
    const currentNode = nodes.find(n => n.id === simulationState.currentNodeId);
    
    if (currentNode) {
      setIsProcessing(true);
      const nextNode = findNextNode(currentNode.id, nodes, edges);
      if (nextNode) {
        await processNode(nextNode, nodes, edges);
      } else {
        addMessage({ type: 'system', content: '✅ Fluxo finalizado' });
      }
      setIsProcessing(false);
    }
  };

  const renderMediaPreview = (msg: SimulatedMessage) => {
    if (!msg.mediaUrl) return null;

    switch (msg.mediaType) {
      case 'image':
        return (
          <img 
            src={msg.mediaUrl} 
            alt="Media" 
            className="max-w-full max-h-40 rounded-lg mb-1"
          />
        );
      case 'video':
        return (
          <div className="bg-muted rounded-lg p-2 flex items-center gap-2 mb-1">
            <Video className="h-8 w-8 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Vídeo</span>
          </div>
        );
      case 'audio':
        return (
          <audio src={msg.mediaUrl} controls className="max-w-full h-10 mb-1" />
        );
      case 'document':
        return (
          <div className="bg-muted rounded-lg p-2 flex items-center gap-2 mb-1">
            <FileText className="h-8 w-8 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Documento</span>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-[400px] p-0 flex flex-col">
        {/* Phone Frame Header */}
        <div className="bg-[#075e54] text-white px-4 py-3">
          <SheetHeader className="space-y-0">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center">
                <User className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <SheetTitle className="text-white text-base font-medium">
                  Contato Simulado
                </SheetTitle>
                <p className="text-white/70 text-xs">
                  Testando: {flowName}
                </p>
              </div>
              <Button 
                variant="ghost" 
                size="icon"
                className="text-white hover:bg-white/20"
                onClick={resetSimulation}
                title="Reiniciar simulação"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
          </SheetHeader>
        </div>

        {/* Chat Background */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-3 space-y-2"
          style={{
            backgroundImage: 'url("data:image/svg+xml,%3Csvg width="60" height="60" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"%3E%3Cg fill="none" fill-rule="evenodd"%3E%3Cg fill="%239C92AC" fill-opacity="0.08"%3E%3Cpath d="M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z"/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")',
            backgroundColor: 'hsl(var(--muted) / 0.3)',
          }}
        >
          {!isStarted ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Play className="h-8 w-8 text-primary" />
              </div>
              <h3 className="font-medium mb-2">Pronto para simular</h3>
              <p className="text-sm text-muted-foreground mb-4 max-w-[250px]">
                Clique no botão abaixo para iniciar a simulação do fluxo e ver como as mensagens serão enviadas.
              </p>
              <Button onClick={startSimulation} className="gap-2">
                <Play className="h-4 w-4" />
                Iniciar Simulação
              </Button>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "flex",
                    msg.type === 'bot' ? 'justify-end' : 'justify-start',
                    msg.type === 'system' && 'justify-center'
                  )}
                >
                  {msg.type === 'system' ? (
                    <div className="bg-muted/80 backdrop-blur-sm px-3 py-1 rounded-full">
                      <span className="text-xs text-muted-foreground">{msg.content}</span>
                    </div>
                  ) : (
                    <div
                      className={cn(
                        "max-w-[85%] px-3 py-2 rounded-lg shadow-sm relative",
                        msg.type === 'bot' 
                          ? 'bg-[#dcf8c6] text-foreground rounded-tr-none' 
                          : 'bg-card text-foreground rounded-tl-none'
                      )}
                    >
                      {renderMediaPreview(msg)}
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      <div className="flex items-center justify-end gap-1 mt-1">
                        <span className="text-[10px] text-muted-foreground">
                          {msg.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {msg.type === 'bot' && (
                          <CheckCheck 
                            className={cn(
                              "h-3 w-3",
                              msg.status === 'read' ? 'text-blue-500' : 'text-muted-foreground'
                            )} 
                          />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Typing indicator - now on the right side (you sending) */}
              {isProcessing && (
                <div className="flex justify-end">
                  <div className="bg-[#dcf8c6] px-4 py-3 rounded-lg rounded-tr-none shadow-sm">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-green-600/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 bg-green-600/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 bg-green-600/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Button choices */}
        {simulationState.pendingButtons && simulationState.pendingButtons.length > 0 && (
          <div className="px-3 py-2 border-t border-border bg-muted/30">
            <p className="text-xs text-muted-foreground mb-2">Escolha uma opção:</p>
            <div className="flex flex-wrap gap-2">
              {simulationState.pendingButtons.map((btn) => (
                <Button
                  key={btn.id}
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => handleButtonClick(btn)}
                  disabled={isProcessing}
                >
                  {btn.label}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Input Area */}
        <div className="bg-[#f0f0f0] dark:bg-muted px-3 py-2 border-t border-border">
          <form 
            onSubmit={(e) => { e.preventDefault(); handleUserInput(); }}
            className="flex gap-2"
          >
            <Input
              ref={inputRef}
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              placeholder={
                simulationState.waitingForInput 
                  ? simulationState.pendingButtons 
                    ? "Digite a opção ou clique acima..."
                    : `Digite ${simulationState.inputVariable || 'sua resposta'}...`
                  : "Aguardando..."
              }
              disabled={!simulationState.waitingForInput || isProcessing}
              className="flex-1 h-10 bg-white dark:bg-card"
            />
            <Button 
              type="submit"
              size="icon"
              disabled={!simulationState.waitingForInput || isProcessing || !userInput.trim()}
              className="h-10 w-10 rounded-full bg-[#075e54] hover:bg-[#064940]"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
