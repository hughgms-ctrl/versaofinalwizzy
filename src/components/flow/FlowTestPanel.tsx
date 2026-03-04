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

  // States for AI thinking
  const [isThinking, setIsThinking] = useState(false);
  const [currentAgentName, setCurrentAgentName] = useState<string | null>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isThinking]);

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
    setIsThinking(false);
    setCurrentAgentName(null);
  };

  const addMessage = (msg: Omit<SimulatedMessage, 'id' | 'timestamp' | 'status'>) => {
    const newId = `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const newMsg: SimulatedMessage = {
      ...msg,
      id: newId,
      timestamp: new Date(),
      status: msg.type === 'bot' ? 'sending' : 'sent',
    };
    setMessages(prev => [...prev, newMsg]);

    // Simulate message delivery
    if (msg.type === 'bot') {
      setTimeout(() => {
        setMessages(prev => prev.map(m =>
          m.id === newId ? { ...m, status: 'delivered' as const } : m
        ));
      }, 500);
      setTimeout(() => {
        setMessages(prev => prev.map(m =>
          m.id === newId ? { ...m, status: 'read' as const } : m
        ));
      }, 1000);
    }

    return newId;
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
        setIsProcessing(true);
        await new Promise(resolve => setTimeout(resolve, (item.delaySeconds || 3) * 1000));
        setIsProcessing(false);
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

    // Visual feedback on canvas
    window.dispatchEvent(new CustomEvent('flow:node:executing', { detail: { nodeId: node.id } }));

    const nodeType = node.type as string;
    const nodeData = node.data as Record<string, unknown>;

    switch (nodeType) {
      case 'start':
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
        addMessage({ type: 'system', content: `📝 Aguardando sua resposta para: ${variableName}` });

        setSimulationState(prev => ({
          ...prev,
          waitingForInput: true,
          inputVariable: variableName,
        }));
        break;

      case 'condition':
        addMessage({ type: 'system', content: '🔀 Avaliando condição...' });
        await new Promise(resolve => setTimeout(resolve, 1000));

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

        addMessage({ type: 'system', content: `🔀 Resultado: ${conditionMet ? 'Verdadeiro' : 'Falso'}` });

        const nextAfterCondition = findNextNode(node.id, nodes, edges, conditionMet ? 'yes' : 'no');
        if (nextAfterCondition) {
          await processNode(nextAfterCondition, nodes, edges);
        } else {
          const defaultNext = findNextNode(node.id, nodes, edges);
          if (defaultNext) {
            await processNode(defaultNext, nodes, edges);
          }
        }
        break;

      case 'ai-handoff':
        setCurrentAgentName((nodeData.agentName as string) || 'Especialista');
        setIsThinking(true);
        addMessage({ type: 'system', content: `🤖 Transferindo para Agente: ${nodeData.agentName || 'IA'}` });

        await new Promise(resolve => setTimeout(resolve, 3000));
        setIsThinking(false);

        addMessage({
          type: 'bot',
          content: `[SIMULAÇÃO IA] Olá! Sou o agente ${nodeData.agentName || 'IA'} e estou assumindo seu atendimento. Como posso ajudar com base no contexto do fluxo?`
        });

        setSimulationState(prev => ({ ...prev, waitingForInput: true, inputVariable: 'ai_query' }));
        break;

      case 'ai-master':
        setCurrentAgentName("Agente Master / Orquestrador");
        setIsThinking(true);
        addMessage({ type: 'system', content: '🧠 Agente Master Ativado' });

        await new Promise(resolve => setTimeout(resolve, 4000));
        setIsThinking(false);

        addMessage({
          type: 'bot',
          content: "Olá! Sou o Orquestrador deste fluxo. Estou analisando seu histórico para decidir qual o melhor caminho ou agente para o seu caso."
        });

        setSimulationState(prev => ({ ...prev, waitingForInput: true, inputVariable: 'master_query' }));
        break;

      default:
        const nextNode = findNextNode(node.id, nodes, edges);
        if (nextNode) {
          await processNode(nextNode, nodes, edges);
        } else {
          addMessage({ type: 'system', content: '✅ Execução finalizada' });
        }
    }
  };

  const startSimulation = async () => {
    if (!flow?.nodes) return;
    resetSimulation();
    setIsStarted(true);
    setIsProcessing(true);
    addMessage({ type: 'system', content: `▶️ Conversa iniciada: "${flowName}"` });
    await new Promise(resolve => setTimeout(resolve, 500));
    const nodes = flow.nodes as Node[];
    const edges = flow.edges as Edge[];
    const startNode = nodes.find(n => n.type === 'start');
    if (startNode) await processNode(startNode, nodes, edges);
    setIsProcessing(false);
  };

  const handleUserInput = async () => {
    if (!userInput.trim() || !flow) return;
    const inputValue = userInput.trim();
    setUserInput('');
    addMessage({ type: 'user', content: inputValue });

    if (simulationState.pendingButtons) {
      const matchedButton = simulationState.pendingButtons.find(b =>
        b.label.toLowerCase() === inputValue.toLowerCase()
      );
      if (matchedButton) {
        setSimulationState(prev => ({
          ...prev,
          waitingForInput: false,
          pendingButtons: undefined,
          variables: { ...prev.variables, button_choice: matchedButton.label }
        }));
      } else {
        addMessage({ type: 'bot', content: 'Selecione uma das opções acima.' });
        return;
      }
    } else if (simulationState.inputVariable) {
      if (simulationState.inputVariable === 'ai_query' || simulationState.inputVariable === 'master_query') {
        setIsThinking(true);
        await new Promise(resolve => setTimeout(resolve, 2500));
        setIsThinking(false);
        addMessage({ type: 'bot', content: `Entendi o seu ponto sobre "${inputValue}". Como este é um ambiente de simulação, estou validando as regras do prompt que você configurou no nó.` });
        return;
      }
      setSimulationState(prev => ({
        ...prev,
        waitingForInput: false,
        inputVariable: undefined,
        variables: { ...prev.variables, [simulationState.inputVariable!]: inputValue }
      }));
    }

    await new Promise(resolve => setTimeout(resolve, 300));
    const nodes = flow.nodes as Node[];
    const edges = flow.edges as Edge[];
    const currentNode = nodes.find(n => n.id === simulationState.currentNodeId);
    if (currentNode) {
      setIsProcessing(true);
      const nextNode = findNextNode(currentNode.id, nodes, edges);
      if (nextNode) await processNode(nextNode, nodes, edges);
      else addMessage({ type: 'system', content: '✅ Fluxo finalizado' });
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
      if (nextNode) await processNode(nextNode, nodes, edges);
      else addMessage({ type: 'system', content: '✅ Fluxo finalizado' });
      setIsProcessing(false);
    }
  };

  const renderMediaPreview = (msg: SimulatedMessage) => {
    if (!msg.mediaUrl) return null;
    switch (msg.mediaType) {
      case 'image': return <img src={msg.mediaUrl} alt="Media" className="max-w-full max-h-40 rounded-lg mb-1" />;
      case 'video': return <div className="bg-muted rounded-lg p-2 flex items-center gap-2 mb-1"><Video className="h-8 w-8 text-muted-foreground" /><span className="text-xs text-muted-foreground">Vídeo</span></div>;
      case 'audio': return <audio src={msg.mediaUrl} controls className="max-w-full h-10 mb-1" />;
      case 'document': return <div className="bg-muted rounded-lg p-2 flex items-center gap-2 mb-1"><FileText className="h-8 w-8 text-muted-foreground" /><span className="text-xs text-muted-foreground">Documento</span></div>;
      default: return null;
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-[450px] p-0 flex flex-col bg-[#f0f2f5] dark:bg-background border-l border-border shadow-2xl">
        <div className="bg-[#075e54] dark:bg-[#202c33] text-white px-4 py-4 flex items-center justify-between shadow-md z-10">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-[#dfe5e7] dark:bg-[#6a7175] flex items-center justify-center overflow-hidden border border-white/10">
              <Bot className="h-6 w-6 text-[#54656f] dark:text-white/80" />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold leading-tight">Simulador de Atendimento</h3>
              <div className="flex items-center gap-1">
                <div className="h-2 w-2 rounded-full bg-[#25d366]" />
                <span className="text-[11px] text-white/80">Online | {flowName}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 h-8 w-8 rounded-full" onClick={resetSimulation} title="Reiniciar"><RotateCcw className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 h-8 w-8 rounded-full" onClick={() => onOpenChange(false)}><X className="h-4 w-4" /></Button>
          </div>
        </div>

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-4 space-y-4 relative scroll-smooth"
          style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='80' height='80' viewBox='0 0 80 80' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M10 10l5 5m-5 0l5-5m20 0l5 5m-5 0l5-5m20 0l5 5m-5 0l5-5m20 0l5 5m-5 0l5-5M10 30l5 5m-5 0l5-5m20 0l5 5m-5 0l5-5m20 0l5 5m-5 0l5-5m20 0l5 5m-5 0l5-5M10 50l5 5m-5 0l5-5m20 0l5 5m-5 0l5-5m20 0l5 5m-5 0l5-5m20 0l5 5m-5 0l5-5M10 70l5 5m-5 0l5-5m20 0l5 5m-5 0l5-5m20 0l5 5m-5 0l5-5m20 0l5 5m-5 0l5-5' stroke='%23000' stroke-opacity='0.03' fill='none' fill-rule='evenodd'/%3E%3C/svg%3E")` }}
        >
          {!isStarted ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8 bg-white/50 dark:bg-card/30 backdrop-blur-sm rounded-3xl border border-dashed border-border m-4">
              <div className="h-20 w-20 rounded-full bg-[#25d366]/10 flex items-center justify-center mb-6 ring-4 ring-[#25d366]/5"><Play className="h-10 w-10 text-[#25d366] fill-current pr-0.5" /></div>
              <h3 className="text-xl font-bold mb-3">Teste seu Fluxo</h3>
              <p className="text-sm text-muted-foreground mb-8 leading-relaxed">Inicie a simulação para ver como seu cliente interagirá com o fluxo e como os agentes responderão.</p>
              <Button onClick={startSimulation} className="bg-[#25d366] hover:bg-[#20bd5c] text-white font-bold px-10 h-12 rounded-full shadow-lg gap-2">Começar Simulação</Button>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <div key={msg.id} className={cn("flex flex-col animate-in fade-in slide-in-from-bottom-2 duration-300", msg.type === 'bot' ? 'items-start' : 'items-end', msg.type === 'system' && 'items-center my-4')}>
                  {msg.type === 'system' ? (<div className="bg-white/90 dark:bg-muted/80 backdrop-blur-sm px-4 py-1.5 rounded-full shadow-sm border border-border/50"><span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground/80">{msg.content}</span></div>) : (
                    <div className={cn("max-w-[85%] px-3.5 py-2.5 rounded-2xl shadow-sm relative", msg.type === 'bot' ? 'bg-white dark:bg-[#202c33] text-foreground rounded-tl-none border-t border-r border-[#0000000a]' : 'bg-[#dcf8c6] dark:bg-[#005c4b] text-foreground rounded-tr-none')}>
                      {msg.type === 'bot' && (<div className="flex items-center gap-1.5 mb-1 text-[10px] font-bold text-[#ff2d85]"><Bot className="h-3 w-3" /><span>Wizzy Bot</span></div>)}
                      {renderMediaPreview(msg)}
                      <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                      <div className="flex items-center justify-end gap-1.5 mt-1.5">
                        <span className="text-[9px] opacity-50 font-medium">{msg.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                        {msg.type === 'user' && <CheckCheck className="h-3.5 w-3.5 text-blue-500" />}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {(isProcessing || isThinking) && (
                <div className="flex flex-col items-start animate-in fade-in duration-300">
                  <div className="bg-white dark:bg-[#202c33] px-4 py-3 rounded-2xl rounded-tl-none shadow-sm border border-[#0000000a]">
                    <div className="flex items-center gap-2 mb-2"><div className="h-4 w-4 rounded-full bg-[#ff2d85]/10 flex items-center justify-center"><Loader2 className="h-3 w-3 text-[#ff2d85] animate-spin" /></div><span className="text-[10px] font-bold text-[#ff2d85] uppercase tracking-tighter">{isThinking ? (currentAgentName || "IA Processando") : "IA Digitanto"}</span></div>
                    {isThinking && (
                      <div className="flex flex-col gap-2">
                        <div className="flex gap-1.5"><span className="w-1.5 h-1.5 bg-[#ff2d85] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} /><span className="w-1.5 h-1.5 bg-[#ff2d85] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} /><span className="w-1.5 h-1.5 bg-[#ff2d85] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} /></div>
                        <p className="text-[11px] text-muted-foreground italic font-medium">Analizando o contexto global para responder...</p>
                      </div>
                    )}
                    {!isThinking && isProcessing && (<div className="flex gap-1.5"><span className="w-1.5 h-1.5 bg-muted-foreground/30 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} /><span className="w-1.5 h-1.5 bg-muted-foreground/30 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} /><span className="w-1.5 h-1.5 bg-muted-foreground/30 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} /></div>)}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="bg-[#f0f2f5] dark:bg-[#111b21] p-3 border-t border-border space-y-3">
          {simulationState.pendingButtons && simulationState.pendingButtons.length > 0 && !isProcessing && (
            <div className="flex flex-wrap gap-2 animate-in slide-in-from-bottom-4 duration-500">
              {simulationState.pendingButtons.map((btn) => (
                <Button key={btn.id} variant="outline" size="sm" className="bg-white dark:bg-[#202c33] border-none shadow-sm hover:bg-[#f0f2f5] text-[#00a884] font-bold rounded-full px-5 transition-all hover:scale-105" onClick={() => handleButtonClick(btn)}>{btn.label}</Button>
              ))}
            </div>
          )}
          <form onSubmit={(e) => { e.preventDefault(); handleUserInput(); }} className="flex items-center gap-2">
            <div className="flex-1 bg-white dark:bg-[#2a3942] rounded-full px-4 h-11 flex items-center shadow-sm border border-transparent focus-within:border-[#00a884]">
              <Input ref={inputRef} value={userInput} onChange={(e) => setUserInput(e.target.value)} placeholder={simulationState.waitingForInput ? "Digite sua mensagem..." : "Simulação finalizada"} disabled={!simulationState.waitingForInput || isProcessing || isThinking} className="border-none bg-transparent focus-visible:ring-0 px-0 h-full text-[14px]" />
            </div>
            <Button type="submit" size="icon" disabled={!simulationState.waitingForInput || isProcessing || isThinking || !userInput.trim()} className="h-11 w-11 rounded-full bg-[#00a884] hover:bg-[#008f72] shadow-md flex-shrink-0"><Send className="h-5 w-5 text-white pr-0.5" /></Button>
          </form>
          <div className="text-center"><p className="text-[10px] text-muted-foreground opacity-60 font-medium">Wizzy Flow Simulator | © 2026</p></div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
