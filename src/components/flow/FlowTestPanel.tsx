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
import { supabase } from '@/integrations/supabase/client';

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
  activeFlowId: string;
  activeFlowData: any;
}

const SYSTEM_LOG_ICONS = {
  tag: '🏷️',
  pipeline: '📋',
  flow: '🔄',
  wait: '⏳',
  agent: '🤖',
  master: '🧠',
  start: '▶️',
  finish: '✅'
};

export function FlowTestPanel({ open, onOpenChange, flowId, flowName }: FlowTestPanelProps) {
  const { data: flow } = useFlow(flowId);
  const [messages, setMessages] = useState<SimulatedMessage[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const { data: initialFlow } = useFlow(flowId);
  const [simulationState, setSimulationState] = useState<SimulationState>({
    currentNodeId: null,
    waitingForInput: false,
    variables: {},
    activeFlowId: flowId,
    activeFlowData: null
  });

  useEffect(() => {
    if (initialFlow && !simulationState.activeFlowData) {
      setSimulationState(prev => ({ ...prev, activeFlowData: initialFlow }));
    }
  }, [initialFlow]);
  const [isStarted, setIsStarted] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // States for AI thinking
  const [isThinking, setIsThinking] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
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
      activeFlowId: flowId,
      activeFlowData: initialFlow
    });
    setIsStarted(false);
    setUserInput('');
    setIsThinking(false);
    setIsRecording(false);
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

  const finalizeSimulation = (silent = false) => {
    if (!silent) {
      addMessage({
        type: 'system',
        content: `${SYSTEM_LOG_ICONS.finish} [IA_TRANSITION] O FLUXO TERMINOU. AGORA VOCÊ PODE FALAR COM A IA!`
      });
    }
    setSimulationState(prev => ({
      ...prev,
      waitingForInput: true,
      inputVariable: 'ai_query',
      currentNodeId: null
    }));
    setIsProcessing(false);
    setIsThinking(false);
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
      const waitTime = (item.delaySeconds || 2) * 1000;

      if (item.type === 'delay') {
        setIsProcessing(true);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        setIsProcessing(false);
      } else if (item.type === 'text' && item.content) {
        setIsProcessing(true);
        await new Promise(resolve => setTimeout(resolve, waitTime));

        // Replace variables in text
        let processedContent = item.content;
        Object.entries(simulationState.variables).forEach(([key, value]) => {
          processedContent = processedContent.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
        });
        addMessage({ type: 'bot', content: processedContent });
        setIsProcessing(false);
        await new Promise(resolve => setTimeout(resolve, 500));
      } else if (['image', 'video', 'audio', 'document'].includes(item.type)) {
        if (item.type === 'audio') {
          setIsRecording(true);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          setIsRecording(false);
        } else {
          setIsProcessing(true);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          setIsProcessing(false);
        }
        addMessage({
          type: 'bot',
          content: item.caption || `[${item.type.toUpperCase()}]`,
          mediaType: item.type as 'image' | 'video' | 'audio' | 'document',
          mediaUrl: item.mediaUrl,
        });
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  };

  const processNode = async (node: Node, nodes: Node[], edges: Edge[]) => {
    setSimulationState(prev => ({ ...prev, currentNodeId: node.id }));

    // Visual feedback on canvas
    window.dispatchEvent(new CustomEvent('flow:node:executing', { detail: { nodeId: node.id } }));

    const nodeType = node.type as string;
    const nodeData = node.data as Record<string, any>;

    switch (nodeType) {
      case 'start':
        const nextAfterStart = findNextNode(node.id, nodes, edges);
        if (nextAfterStart) {
          await new Promise(resolve => setTimeout(resolve, 800));
          await processNode(nextAfterStart, nodes, edges);
        } else {
          setSimulationState(prev => ({ ...prev, waitingForInput: true, inputVariable: 'ai_query' }));
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
          // Transition to continuous AI conversation
          addMessage({ type: 'system', content: `${SYSTEM_LOG_ICONS.finish} FLUXO FINALIZADO - AGENTE DE IA ASSUMINDO` });
          setSimulationState(prev => ({
            ...prev,
            waitingForInput: true,
            inputVariable: 'ai_query'
          }));
        }
        break;

      case 'message-buttons':
        const buttonText = (nodeData.text as string) || 'Escolha uma opção:';
        const buttons = (nodeData.buttons as Array<{ id: string; label: string }>) || [];

        addMessage({ type: 'bot', content: buttonText });
        await new Promise(resolve => setTimeout(resolve, 500));

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
          } else {
            addMessage({ type: 'system', content: `${SYSTEM_LOG_ICONS.finish} FLUXO FINALIZADO - AGENTE DE IA ASSUMINDO` });
            setSimulationState(prev => ({ ...prev, waitingForInput: true, inputVariable: 'ai_query' }));
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

      case 'wait':
      case 'action-delay':
        const seconds = Number(nodeData.seconds || nodeData.delaySeconds) || 5;
        addMessage({ type: 'system', content: `${SYSTEM_LOG_ICONS.wait} Aguardando ${seconds} segundos...` });
        setIsProcessing(true);
        await new Promise(resolve => setTimeout(resolve, seconds * 1000));
        setIsProcessing(false);
        const nextAfterWait = findNextNode(node.id, nodes, edges); // Define nextAfterWait
        if (nextAfterWait) {
          await processNode(nextAfterWait, nodes, edges);
        } else {
          finalizeSimulation();
        }
        break;

      case 'add-tag':
      case 'action-tag':
        addMessage({ type: 'system', content: `${SYSTEM_LOG_ICONS.tag} Atribuindo Tag: ${nodeData.tagName || 'Sem nome'}` });
        await new Promise(resolve => setTimeout(resolve, 1000));
        const nextAfterTag = findNextNode(node.id, nodes, edges); // Define nextAfterTag
        if (nextAfterTag) {
          await processNode(nextAfterTag, nodes, edges);
        } else {
          finalizeSimulation();
        }
        break;

      case 'pipeline-handoff':
      case 'action-pipeline':
        addMessage({ type: 'system', content: `${SYSTEM_LOG_ICONS.pipeline} Movendo para Pipeline: ${nodeData.pipelineName || '...'} -> ${nodeData.columnName || '...'}` });
        await new Promise(resolve => setTimeout(resolve, 1200));
        const nextAfterPipe = findNextNode(node.id, nodes, edges); // Define nextAfterPipe
        if (nextAfterPipe) {
          await processNode(nextAfterPipe, nodes, edges);
        } else {
          finalizeSimulation();
        }
        break;

      case 'sub-flow':
      case 'action-flow':
        const targetFlowId = nodeData.flowId;
        addMessage({ type: 'system', content: `${SYSTEM_LOG_ICONS.flow} Iniciando sub-fluxo: ${nodeData.flowName || '...'}` });
        setIsProcessing(true);

        try {
          const { data: subFlowData, error } = await supabase
            .from('flows' as any)
            .select('*')
            .eq('id', targetFlowId)
            .single();

          if (error) throw error;

          setSimulationState(prev => ({
            ...prev,
            activeFlowId: targetFlowId,
            activeFlowData: subFlowData
          }));

          const subNodes = (subFlowData as any).nodes as Node[];
          const subEdges = (subFlowData as any).edges as Edge[];
          const startNode = subNodes.find(n => n.type === 'start');

          if (startNode) {
            await new Promise(resolve => setTimeout(resolve, 1500));
            await processNode(startNode, subNodes, subEdges);
          }

          // CRITICAL: After sub-flow finishes, check if parent flow continues
          const nextInParent = findNextNode(node.id, nodes, edges);
          if (nextInParent) {
            await processNode(nextInParent, nodes, edges);
          } else {
            finalizeSimulation();
          }
        } catch (err) {
          console.error('Error loading sub-flow:', err);
          addMessage({ type: 'system', content: `❌ Erro ao carregar sub-fluxo: ${nodeData.flowName || 'ID não encontrado'}` });
          finalizeSimulation(true);
        }
        setIsProcessing(false);
        break;

      case 'ai-handoff':
      case 'ai-master':
        const isMaster = nodeType === 'ai-master';
        const agentName = isMaster ? "Orquestrador Master" : ((nodeData.agentName as string) || 'Especialista');
        const agentPrompt = isMaster ? (simulationState.activeFlowData?.master_prompt || '') : (nodeData.prompt as string || '');

        setCurrentAgentName(agentName);
        setIsThinking(true);
        addMessage({ type: 'system', content: `${isMaster ? SYSTEM_LOG_ICONS.master : SYSTEM_LOG_ICONS.agent} Transferindo para ${agentName}` });

        // First message for real AI simulation
        if (!messages.some(m => m.type === 'user')) {
          finalizeSimulation(true);
        } else {
          // If we already have a user message, trigger AI response immediately
          handleAIRealCall(agentPrompt, isMaster);
        }
        break;

      default:
        const nextNode = findNextNode(node.id, nodes, edges);
        if (nextNode) {
          await processNode(nextNode, nodes, edges);
        } else {
          // If no next node, transition to AI conversation instead of finishing
          addMessage({ type: 'system', content: `${SYSTEM_LOG_ICONS.finish} FLUXO FINALIZADO - AGENTE DE IA ASSUMINDO` });
          setIsProcessing(false);
          setSimulationState(prev => ({
            ...prev,
            waitingForInput: true,
            inputVariable: 'ai_query' // This enables continuous AI interaction
          }));
        }
    }
  };

  const handleAIRealCall = async (prompt: string, useMasterPrompt: boolean = false) => {
    setIsThinking(true);
    try {
      // Get conversation history from messages
      const history = messages
        .filter(m => m.type === 'user' || m.type === 'bot')
        .map(m => ({
          role: m.type === 'user' ? 'user' : 'assistant',
          content: m.content
        }));

      const organizationId = simulationState.activeFlowData?.organization_id;

      const systemPrompt = `Você é um agente de atendimento virtual inteligente para um escritório de advocacia.
      
PERSONALIDADE E REGRAS GERAIS:
${useMasterPrompt ? (simulationState.activeFlowData?.master_prompt || '') : ''}

INSTRUÇÕES DO AGENTE ATUAL:
${prompt}

Responda sempre em português brasileiro de forma profissional e prestativa.`;

      const { data, error } = await supabase.functions.invoke('generate-agent-prompt', {
        body: {
          mode: 'chat',
          organizationId,
          messages: history,
          systemPrompt
        }
      });

      if (error) throw error;

      setIsThinking(false);

      // Use the content returned by the Edge Function in chat mode
      const aiReply = data.content || "Entendido. Como posso ajudar agora?";

      addMessage({
        type: 'bot',
        content: aiReply
      });

      setSimulationState(prev => ({ ...prev, waitingForInput: true, inputVariable: 'ai_query' }));
    } catch (err) {
      console.error('AI Call error:', err);
      setIsThinking(false);
      addMessage({ type: 'bot', content: "⚠️ Erro técnico ao conectar com o Agente de IA. Verifique sua chave de API ou conexão." });
      setSimulationState(prev => ({ ...prev, waitingForInput: true, inputVariable: 'ai_query' }));
    }
  };

  const startSimulation = async () => {
    if (!simulationState.activeFlowData) return;
    resetSimulation();
    setIsStarted(true);
    setIsProcessing(true);

    addMessage({ type: 'system', content: `${SYSTEM_LOG_ICONS.start} Simulando entrada do usuário para ativar fluxo...` });
    await new Promise(resolve => setTimeout(resolve, 800));
    addMessage({ type: 'user', content: 'Olá! Gostaria de falar sobre o meu caso.' });
    await new Promise(resolve => setTimeout(resolve, 1000));

    addMessage({ type: 'system', content: `${SYSTEM_LOG_ICONS.start} Gatilho detectado. Iniciando execução de: "${flowName}"` });
    await new Promise(resolve => setTimeout(resolve, 800));

    const { nodes, edges } = simulationState.activeFlowData;
    const startNode = (nodes as Node[]).find(n => n.type === 'start');
    if (startNode) await processNode(startNode, nodes as Node[], edges as Edge[]);
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
        const isMaster = simulationState.inputVariable === 'master_query';
        const currentNode = (simulationState.activeFlowData.nodes as Node[]).find(n => n.id === simulationState.currentNodeId);
        const prompt = isMaster ? (simulationState.activeFlowData.master_prompt || '') : (currentNode?.data?.prompt as string || '');
        await handleAIRealCall(prompt, isMaster);
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
    const nodes = simulationState.activeFlowData.nodes as Node[];
    const edges = simulationState.activeFlowData.edges as Edge[];
    const currentNode = nodes.find(n => n.id === simulationState.currentNodeId);
    if (currentNode) {
      setIsProcessing(true);
      const nextNode = findNextNode(currentNode.id, nodes, edges);
      if (nextNode) {
        await processNode(nextNode, nodes, edges);
      } else {
        // Transition to continuous AI conversation
        addMessage({ type: 'system', content: `${SYSTEM_LOG_ICONS.finish} FLUXO FINALIZADO - AGENTE DE IA ASSUMINDO` });
        setSimulationState(prev => ({
          ...prev,
          waitingForInput: true,
          inputVariable: 'ai_query'
        }));
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
    const nodes = simulationState.activeFlowData.nodes as Node[];
    const edges = simulationState.activeFlowData.edges as Edge[];
    const currentNode = nodes.find(n => n.id === simulationState.currentNodeId);
    if (currentNode) {
      setIsProcessing(true);
      const nextNode = findNextNode(currentNode.id, nodes, edges);
      if (nextNode) {
        await processNode(nextNode, nodes, edges);
      } else {
        // Transition to continuous AI conversation
        addMessage({ type: 'system', content: `${SYSTEM_LOG_ICONS.finish} FLUXO FINALIZADO - AGENTE DE IA ASSUMINDO` });
        setSimulationState(prev => ({
          ...prev,
          waitingForInput: true,
          inputVariable: 'ai_query'
        }));
      }
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
              {(isProcessing || isThinking || isRecording) && (
                <div className="flex flex-col items-start animate-in fade-in duration-300">
                  <div className="bg-white dark:bg-[#202c33] px-4 py-3 rounded-2xl rounded-tl-none shadow-sm border border-[#0000000a]">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-4 w-4 rounded-full bg-[#ff2d85]/10 flex items-center justify-center">
                        <Loader2 className="h-3 w-3 text-[#ff2d85] animate-spin" />
                      </div>
                      <span className="text-[10px] font-bold text-[#ff2d85] uppercase tracking-tighter">
                        {isThinking ? (currentAgentName || "IA Processando") : isRecording ? "IA Gravando Áudio" : "IA Digitando"}
                      </span>
                    </div>
                    {isThinking && (
                      <div className="flex flex-col gap-2">
                        <div className="flex gap-1.5"><span className="w-1.5 h-1.5 bg-[#ff2d85] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} /><span className="w-1.5 h-1.5 bg-[#ff2d85] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} /><span className="w-1.5 h-1.5 bg-[#ff2d85] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} /></div>
                        <p className="text-[11px] text-muted-foreground italic font-medium">Analisando o contexto global para responder...</p>
                      </div>
                    )}
                    {(isProcessing || isRecording) && !isThinking && (
                      <div className="flex flex-col gap-2">
                        <div className="flex gap-1.5">
                          <span className={cn("w-1.5 h-1.5 rounded-full animate-bounce", isRecording ? "bg-red-500" : "bg-muted-foreground/30")} style={{ animationDelay: '0ms' }} />
                          <span className={cn("w-1.5 h-1.5 rounded-full animate-bounce", isRecording ? "bg-red-500" : "bg-muted-foreground/30")} style={{ animationDelay: '150ms' }} />
                          <span className={cn("w-1.5 h-1.5 rounded-full animate-bounce", isRecording ? "bg-red-500" : "bg-muted-foreground/30")} style={{ animationDelay: '300ms' }} />
                        </div>
                        {isRecording && <p className="text-[10px] text-muted-foreground italic">Gravando áudio de alta qualidade...</p>}
                      </div>
                    )}
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
              <Input ref={inputRef} value={userInput} onChange={(e) => setUserInput(e.target.value)} placeholder={simulationState.waitingForInput ? "Digite sua mensagem..." : "Conversa com IA liberada"} disabled={!simulationState.waitingForInput || isProcessing || isThinking} className="border-none bg-transparent focus-visible:ring-0 px-0 h-full text-[14px]" />
            </div>
            <Button type="submit" size="icon" disabled={!simulationState.waitingForInput || isProcessing || isThinking || !userInput.trim()} className="h-11 w-11 rounded-full bg-[#00a884] hover:bg-[#008f72] shadow-md flex-shrink-0"><Send className="h-5 w-5 text-white pr-0.5" /></Button>
          </form>
          <div className="text-center"><p className="text-[10px] text-muted-foreground opacity-60 font-medium">Wizzy Flow Simulator | © 2026</p></div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
