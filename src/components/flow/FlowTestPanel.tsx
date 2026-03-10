import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import {
  Play, Send, Bot, Loader2, RotateCcw, X, CheckCheck,
  Video, FileText, Tag, GitBranch, ArrowRightLeft,
  Zap, MessageSquare, Users, Sparkles, Smartphone,
  ThumbsUp, ThumbsDown
} from 'lucide-react';
import { AIFeedbackDialog } from '@/components/conversations/AIFeedbackDialog';
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

interface SimMessage {
  id: string;
  type: 'user' | 'bot' | 'system' | 'action';
  content: string;
  mediaType?: 'image' | 'video' | 'audio' | 'document';
  mediaUrl?: string;
  timestamp: Date;
  status: 'sending' | 'sent' | 'delivered' | 'read';
  agentName?: string;
  actionIcon?: string;
  aiMetadata?: {
    agent_id?: string;
    flow_id?: string;
    node_id?: string;
    master_prompt_id?: string;
  };
}

interface SimState {
  currentNodeId: string | null;
  waitingForInput: boolean;
  inputVariable?: string;
  variables: Record<string, unknown>;
  pendingButtons?: Array<{ id: string; label: string }>;
  pendingList?: { title: string; buttonText: string; sections: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }> };
  activeFlowId: string;
  activeFlowData: any;
  activeAgentId?: string;
  activeAgentName?: string;
  activeAgentPrompt?: string;
  expectedOutcomes?: string[];
  parentFlowStack: Array<{ flowId: string; flowData: any; nodeId: string; nodes: Node[]; edges: Edge[] }>;
  followUpResolve?: ((responded: boolean) => void) | null;
}

// Preloaded org data
interface OrgContext {
  tags: Array<{ id: string; name: string; color?: string }>;
  pipelines: Array<{ id: string; name: string; columns: Array<{ id: string; name: string; order: number }> }>;
  agents: Array<{ id: string; name: string; prompt_base: string; persona?: string }>;
  trainingRules: Array<{ id: string; target_type: string; agent_id?: string; master_prompt_id?: string; flow_id?: string; node_id?: string; situation: string; rule: string; is_active: boolean }>;
  organizationId: string;
}

export function FlowTestPanel({ open, onOpenChange, flowId, flowName }: FlowTestPanelProps) {
  const { data: initialFlow } = useFlow(flowId);
  const [messages, setMessages] = useState<SimMessage[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isStarted, setIsStarted] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [orgContext, setOrgContext] = useState<OrgContext | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ id: string; content: string; metadata: any } | null>(null);

  const [simState, setSimState] = useState<SimState>({
    currentNodeId: null,
    waitingForInput: false,
    variables: {},
    activeFlowId: flowId,
    activeFlowData: null,
    parentFlowStack: [],
  });

  // Load flow data
  useEffect(() => {
    if (initialFlow && !simState.activeFlowData) {
      setSimState(prev => ({ ...prev, activeFlowData: initialFlow }));
    }
  }, [initialFlow]);

  // Load org context (tags, pipelines, agents, training rules)
  useEffect(() => {
    if (!initialFlow?.organization_id) return;
    const orgId = initialFlow.organization_id;

    Promise.all([
      supabase.from('tags').select('id, name, color').eq('organization_id', orgId),
      supabase.from('pipelines').select('id, name, columns:pipeline_columns(id, name, order)').eq('organization_id', orgId),
      supabase.from('ai_agents').select('id, name, prompt_base, persona').eq('organization_id', orgId).eq('is_active', true),
      supabase.from('agent_training_rules').select('*').eq('organization_id', orgId).eq('is_active', true),
    ]).then(([tagsRes, pipRes, agentsRes, rulesRes]) => {
      setOrgContext({
        tags: tagsRes.data || [],
        pipelines: (pipRes.data || []).map((p: any) => ({
          ...p,
          columns: (p.columns || []).sort((a: any, b: any) => a.order - b.order),
        })),
        agents: agentsRes.data || [],
        trainingRules: rulesRes.data || [],
        organizationId: orgId,
      });
    });
  }, [initialFlow?.organization_id]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      setTimeout(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
      }, 100);
    }
  }, [messages, isThinking, isProcessing]);

  // Focus input
  useEffect(() => {
    if (simState.waitingForInput && inputRef.current) inputRef.current.focus();
  }, [simState.waitingForInput]);

  // ===== HELPERS =====
  const addMsg = useCallback((msg: Omit<SimMessage, 'id' | 'timestamp' | 'status'>) => {
    const newId = `m-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newMsg: SimMessage = { ...msg, id: newId, timestamp: new Date(), status: msg.type === 'bot' ? 'sending' : 'sent' };
    setMessages(prev => [...prev, newMsg]);
    if (msg.type === 'bot') {
      setTimeout(() => setMessages(prev => prev.map(m => m.id === newId ? { ...m, status: 'delivered' } : m)), 600);
      setTimeout(() => setMessages(prev => prev.map(m => m.id === newId ? { ...m, status: 'read' } : m)), 1200);
    }
    return newId;
  }, []);

  const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

  const findNext = (nodeId: string, nodes: Node[], edges: Edge[], handle?: string): Node | null => {
    const edge = edges.find(e => e.source === nodeId && (handle ? e.sourceHandle === handle : true));
    return edge ? nodes.find(n => n.id === edge.target) || null : null;
  };

  const resolveTagName = (tagId: string) => orgContext?.tags.find(t => t.id === tagId)?.name || tagId;
  const resolvePipeline = (pipelineId: string) => orgContext?.pipelines.find(p => p.id === pipelineId);
  const resolveAgent = (agentId: string) => orgContext?.agents.find(a => a.id === agentId);

  // Ref to hold the follow-up resolve function (accessible from handleUserInput)
  const followUpResolveRef = useRef<((responded: boolean) => void) | null>(null);

  // ===== FOLLOW-UP MECHANISM =====
  // Waits for user response while sending follow-up messages on timers.
  // Returns true if user responded, false if all follow-ups exhausted (timeout).
  const waitForResponseWithFollowUps = async (
    remarketingSteps: Array<{ id?: string; delayMinutes: number; message: string }>,
    variableName: string
  ): Promise<boolean> => {
    // Enable user input
    setSimState(prev => ({ ...prev, waitingForInput: true, inputVariable: variableName }));

    // Create a promise that resolves when user responds or all follow-ups are sent + final wait
    return new Promise<boolean>((resolve) => {
      followUpResolveRef.current = resolve;
      setSimState(prev => ({ ...prev, followUpResolve: resolve }));

      // Run follow-ups in background
      (async () => {
        for (let i = 0; i < remarketingSteps.length; i++) {
          const step = remarketingSteps[i];
          // Accelerate delays for simulation: cap at 5 seconds per step
          const simDelay = Math.min((step.delayMinutes || 1) * 60 * 1000, 5000);
          addMsg({ type: 'action', content: `⏱️ Aguardando ${step.delayMinutes}min (simulado: ${Math.round(simDelay / 1000)}s)`, actionIcon: '⏳' });
          
          // Wait, but check if user responded
          const startTime = Date.now();
          while (Date.now() - startTime < simDelay) {
            if (!followUpResolveRef.current) return; // Already resolved (user responded)
            await wait(200);
          }
          if (!followUpResolveRef.current) return; // Already resolved

          // Send follow-up message
          if (step.message) {
            let text = step.message;
            addMsg({ type: 'bot', content: text });
          } else {
            addMsg({ type: 'action', content: `Follow-up #${i + 1} (sem mensagem configurada)`, actionIcon: '📩' });
          }
          await wait(400);
        }

        // All follow-ups sent, wait a final 3 seconds for last chance response
        addMsg({ type: 'action', content: `Última chance de resposta...`, actionIcon: '⏱️' });
        await wait(3000);
        
        // If still not resolved, timeout
        if (followUpResolveRef.current) {
          followUpResolveRef.current = null;
          setSimState(prev => ({ ...prev, followUpResolve: null, waitingForInput: false }));
          resolve(false); // timeout
        }
      })();
    });
  };

  // ===== TRAINING RULES (mirrors orchestrator logic) =====
  const buildTrainingRulesPrompt = (filters: { agentId?: string; flowId?: string; nodeId?: string }) => {
    if (!orgContext?.trainingRules.length) return '';
    const rules = orgContext.trainingRules.filter(r => {
      if (!r.is_active) return false;
      if (r.target_type === 'agent') return !r.agent_id || r.agent_id === filters.agentId;
      if (r.target_type === 'master_prompt') return true;
      if (r.target_type === 'flow_node') {
        if (!r.flow_id) return true;
        if (r.flow_id === filters.flowId) return !r.node_id || r.node_id === filters.nodeId;
        return false;
      }
      return true;
    });
    if (!rules.length) return '';
    let s = `\n## REGRAS APRENDIDAS (${rules.length}):\nEstas regras foram definidas pela equipe. Siga-as rigorosamente.\n\n`;
    rules.forEach(r => { s += `- **Situação:** ${r.situation}\n  **Regra:** ${r.rule}\n\n`; });
    return s;
  };

  // ===== AI CALL (mirrors agent-orchestrator prompt building) =====
  const callAI = async (nodeData: any, nodeId: string) => {
    setIsThinking(true);
    try {
      const agentId = nodeData.agentId;
      const agent = agentId ? resolveAgent(agentId) : null;
      const additionalPrompt = nodeData.additionalPrompt || nodeData.contextMessage || '';
      const masterPrompt = simState.activeFlowData?.master_prompt || '';

      // Build system prompt identical to agent-orchestrator
      let sysPrompt = '';
      if (masterPrompt) sysPrompt += `PERSONALIDADE E REGRAS GERAIS:\n${masterPrompt}\n\n---\n\n`;
      sysPrompt += `Você é o agente "${agent?.name || simState.activeAgentName || 'Assistente'}" neste momento da conversa.\n\n`;
      if (agent?.prompt_base) sysPrompt += `PROMPT DO AGENTE:\n${agent.prompt_base}\n\n`;
      if (agent?.persona) sysPrompt += `PERSONA: ${agent.persona}\n\n`;
      if (additionalPrompt) sysPrompt += `INSTRUÇÕES ESPECÍFICAS PARA ESTE MOMENTO:\n${additionalPrompt}\n\n`;

      // Training rules
      sysPrompt += buildTrainingRulesPrompt({
        agentId: agent?.id,
        flowId: simState.activeFlowId,
        nodeId,
      });

      // Expected outcomes
      const outcomes = nodeData.expectedOutcomes
        ? String(nodeData.expectedOutcomes).split(',').map((s: string) => s.trim()).filter(Boolean)
        : [];
      if (outcomes.length > 0) {
        sysPrompt += `\nRESULTADOS ESPERADOS: ${outcomes.join(', ')}\n`;
        sysPrompt += `Quando sua tarefa estiver concluída, inclua [RESULTADO: <valor>] no final da sua resposta com um dos resultados acima.\n\n`;
      }

      sysPrompt += `INSTRUÇÕES IMPORTANTES:\n`;
      sysPrompt += `- Responda SEMPRE em português brasileiro.\n`;
      sysPrompt += `- Leia TODA a conversa anterior antes de responder.\n`;
      sysPrompt += `- NUNCA envie mensagens em inglês, sem sentido, ou genéricas.\n`;
      sysPrompt += `- Mantenha a persona definida.\n`;
      sysPrompt += `- NÃO produza texto entre parênteses ou pensamentos internos.\n`;
      sysPrompt += `- Esta é uma SIMULAÇÃO DE TESTE. Responda como faria em um atendimento real.\n`;

      // Conversation history
      const history = messages
        .filter(m => m.type === 'user' || m.type === 'bot')
        .map(m => ({ role: m.type === 'user' ? 'user' : 'assistant', content: m.content }));

      const { data, error } = await supabase.functions.invoke('generate-agent-prompt', {
        body: {
          mode: 'chat',
          organizationId: orgContext?.organizationId,
          messages: history,
          systemPrompt: sysPrompt,
        },
      });

      setIsThinking(false);
      if (error) throw error;

      let reply = data?.content || 'Olá! Como posso ajudar?';

      // Check for outcome in reply
      const outcomeMatch = reply.match(/\[RESULTADO:\s*([^\]]+)\]/i);
      let detectedOutcome: string | null = null;
      if (outcomeMatch) {
        detectedOutcome = outcomeMatch[1].trim();
        reply = reply.replace(/\[RESULTADO:\s*[^\]]+\]/gi, '').trim();
      }

      addMsg({ type: 'bot', content: reply, agentName: agent?.name || simState.activeAgentName, aiMetadata: { agent_id: agent?.id || simState.activeAgentId, flow_id: simState.activeFlowId, node_id: nodeId, master_prompt_id: undefined } });

      // If outcome detected and we have outgoing edges, try to route
      if (detectedOutcome && simState.currentNodeId) {
        const nodes = simState.activeFlowData.nodes as Node[];
        const edges = simState.activeFlowData.edges as Edge[];
        const outEdge = edges.find(e => e.source === simState.currentNodeId! && e.sourceHandle === detectedOutcome)
          || edges.find(e => e.source === simState.currentNodeId! && e.sourceHandle === 'default')
          || edges.find(e => e.source === simState.currentNodeId!);
        if (outEdge) {
          const nextNode = nodes.find(n => n.id === outEdge.target);
          if (nextNode) {
            addMsg({ type: 'action', content: `Resultado: ${detectedOutcome} → Avançando fluxo`, actionIcon: '🎯' });
            await wait(800);
            await processNode(nextNode, nodes, edges);
            return;
          }
        }
      }

      // Keep waiting for user input (continuous AI conversation)
      setSimState(prev => ({ ...prev, waitingForInput: true, inputVariable: 'ai_query' }));
    } catch (err) {
      console.error('AI error:', err);
      setIsThinking(false);
      addMsg({ type: 'bot', content: '⚠️ Erro ao conectar com o agente de IA. Verifique suas configurações.' });
      setSimState(prev => ({ ...prev, waitingForInput: true, inputVariable: 'ai_query' }));
    }
  };

  // ===== CONDITION EVALUATION =====
  const evaluateCondition = async (nodeData: any, nodes: Node[], edges: Edge[], nodeId: string): Promise<string> => {
    const conditionType = nodeData.conditionType || 'custom';
    const conditionLabel = nodeData.conditionLabel || nodeData.condition || '';

    // For tag/pipeline conditions, evaluate locally
    if (conditionType === 'has_tag') {
      const tagId = nodeData.tagId;
      // In simulation, check if we've "added" this tag during the flow
      const hasTag = simState.variables[`_tag_${tagId}`] === true;
      return hasTag ? 'yes' : 'no';
    }

    if (conditionType === 'in_pipeline_stage') {
      const columnId = nodeData.columnId;
      const inStage = simState.variables[`_pipeline_col_${columnId}`] === true;
      return inStage ? 'yes' : 'no';
    }

    // For custom/AI-evaluated conditions, use AI
    try {
      const history = messages.filter(m => m.type === 'user' || m.type === 'bot').map(m => `${m.type === 'user' ? 'CLIENTE' : 'IA'}: ${m.content}`).join('\n');
      const outEdges = edges.filter(e => e.source === nodeId);
      const branches = outEdges.map(e => e.sourceHandle || 'default').filter(Boolean);

      const { data } = await supabase.functions.invoke('generate-agent-prompt', {
        body: {
          mode: 'chat',
          organizationId: orgContext?.organizationId,
          messages: [{ role: 'user', content: `Com base na conversa abaixo, avalie a condição: "${conditionLabel}"\n\nConversa:\n${history}\n\nResponda APENAS com uma das opções: ${branches.join(', ')}` }],
          systemPrompt: 'Você é um avaliador de condições. Responda APENAS com o nome do branch correto, nada mais.',
        },
      });
      return (data?.content || branches[0] || 'default').trim().toLowerCase();
    } catch {
      return 'default';
    }
  };

  // ===== PROCESS CONTENT BLOCK =====
  const processContentBlock = async (items: ContentItem[]) => {
    for (const item of items) {
      const delayMs = (item.delaySeconds || 2) * 1000;
      if (item.type === 'delay') {
        setIsProcessing(true);
        await wait(delayMs);
        setIsProcessing(false);
      } else if (item.type === 'text' && item.content) {
        setIsProcessing(true);
        await wait(Math.min(delayMs, 3000));
        let text = item.content;
        Object.entries(simState.variables).forEach(([k, v]) => {
          text = text.replace(new RegExp(`{{${k}}}`, 'g'), String(v));
        });
        addMsg({ type: 'bot', content: text });
        setIsProcessing(false);
        await wait(400);
      } else if (['image', 'video', 'audio', 'document'].includes(item.type)) {
        if (item.type === 'audio') { setIsRecording(true); await wait(delayMs); setIsRecording(false); }
        else { setIsProcessing(true); await wait(delayMs); setIsProcessing(false); }
        addMsg({
          type: 'bot',
          content: item.caption || `[${item.type.toUpperCase()}]`,
          mediaType: item.type as any,
          mediaUrl: item.mediaUrl,
        });
        await wait(400);
      }
    }
  };

  // ===== MAIN NODE PROCESSOR =====
  const processNode = async (node: Node, nodes: Node[], edges: Edge[]) => {
    setSimState(prev => ({ ...prev, currentNodeId: node.id }));
    window.dispatchEvent(new CustomEvent('flow:node:executing', { detail: { nodeId: node.id } }));

    const t = node.type as string;
    const d = node.data as Record<string, any>;

    const advanceOrEnd = async (outputHandle?: string) => {
      const next = findNext(node.id, nodes, edges, outputHandle);
      if (next) { await processNode(next, nodes, edges); }
      else { endFlow(); }
    };

    // Helper: handle nodes that wait for response with optional follow-ups
    const handleWaitWithFollowUps = async (variableName: string, outputHandle?: string) => {
      const steps = (d.remarketingSteps as Array<{ id?: string; delayMinutes: number; message: string }>) || [];
      if (steps.length > 0) {
        addMsg({ type: 'action', content: `Aguardando resposta com ${steps.length} follow-up(s)`, actionIcon: '📩' });
        const responded = await waitForResponseWithFollowUps(steps, variableName);
        if (responded) {
          addMsg({ type: 'action', content: `✓ Cliente respondeu`, actionIcon: '✅' });
          await wait(400);
          await advanceOrEnd('responded');
        } else {
          addMsg({ type: 'action', content: `✗ Timeout — sem resposta`, actionIcon: '⏱️' });
          await wait(400);
          await advanceOrEnd('timeout');
        }
      } else {
        // No follow-ups, just wait for regular input
        setSimState(prev => ({ ...prev, waitingForInput: true, inputVariable: variableName }));
      }
    };

    switch (t) {
      case 'start':
        await wait(600);
        await advanceOrEnd();
        break;

      case 'content-block': {
        const items = (d.items as ContentItem[]) || [];
        if (items.length > 0) await processContentBlock(items);
        const waitForResponse = !!d.waitForResponse;
        if (waitForResponse) {
          await handleWaitWithFollowUps(d.saveVariable || 'resposta');
        } else {
          await advanceOrEnd();
        }
        break;
      }

      case 'message-buttons': {
        const text = (d.text as string) || 'Escolha uma opção:';
        const buttons = (d.buttons as Array<{ id: string; label: string }>) || [];
        addMsg({ type: 'bot', content: text });
        await wait(400);
        if (buttons.filter(b => b.label).length > 0) {
          const steps = (d.remarketingSteps as any[]) || [];
          if (steps.length > 0) {
            // Show buttons AND start follow-up timer
            setSimState(prev => ({ ...prev, pendingButtons: buttons.filter(b => b.label) }));
            await handleWaitWithFollowUps('button_choice');
          } else {
            setSimState(prev => ({ ...prev, waitingForInput: true, pendingButtons: buttons.filter(b => b.label) }));
          }
        } else { await advanceOrEnd(); }
        break;
      }

      case 'message-list': {
        const bodyText = (d.body as string) || 'Selecione uma opção';
        const buttonText = (d.buttonText as string) || 'Ver opções';
        const sections = (d.sections as any[]) || [];
        addMsg({ type: 'bot', content: bodyText });
        await wait(400);
        const steps = (d.remarketingSteps as any[]) || [];
        if (steps.length > 0) {
          setSimState(prev => ({ ...prev, pendingList: { title: bodyText, buttonText, sections } }));
          await handleWaitWithFollowUps('list_choice');
        } else {
          setSimState(prev => ({ ...prev, waitingForInput: true, pendingList: { title: bodyText, buttonText, sections } }));
        }
        break;
      }

      case 'user-input': {
        const varName = (d.variableName as string) || 'resposta';
        addMsg({ type: 'action', content: `Aguardando resposta do cliente (${varName})`, actionIcon: '📝' });
        await handleWaitWithFollowUps(varName);
        break;
      }

      case 'action-delay': {
        const secs = Math.min(Number(d.seconds || d.delaySeconds) || 3, 10);
        addMsg({ type: 'action', content: `Aguardando ${secs}s...`, actionIcon: '⏳' });
        setIsProcessing(true);
        await wait(secs * 1000);
        setIsProcessing(false);
        await advanceOrEnd();
        break;
      }

      case 'action-tag': {
        const tagId = d.tagId || d.tagName;
        const action = d.action || 'add';
        const tagName = resolveTagName(tagId);
        addMsg({ type: 'action', content: `${action === 'remove' ? 'Removendo' : 'Adicionando'} tag: ${tagName}`, actionIcon: '🏷️' });
        setSimState(prev => ({ ...prev, variables: { ...prev.variables, [`_tag_${tagId}`]: action !== 'remove' } }));
        await wait(800);
        await advanceOrEnd();
        break;
      }

      case 'action-pipeline': {
        const pipeline = resolvePipeline(d.pipelineId);
        const colName = pipeline?.columns.find((c: any) => c.id === d.columnId)?.name || d.columnName || '...';
        addMsg({ type: 'action', content: `Movendo para ${pipeline?.name || 'Pipeline'} → ${colName}`, actionIcon: '📋' });
        setSimState(prev => ({ ...prev, variables: { ...prev.variables, [`_pipeline_col_${d.columnId}`]: true } }));
        await wait(800);
        await advanceOrEnd();
        break;
      }

      case 'condition': {
        addMsg({ type: 'action', content: `Avaliando condição: ${d.conditionLabel || d.condition || '...'}`, actionIcon: '🔀' });
        setIsProcessing(true);
        const branch = await evaluateCondition(d, nodes, edges, node.id);
        setIsProcessing(false);
        addMsg({ type: 'action', content: `Resultado: ${branch}`, actionIcon: '✓' });
        await wait(500);
        const outEdges = edges.filter(e => e.source === node.id);
        const targetEdge = outEdges.find(e => e.sourceHandle === branch)
          || outEdges.find(e => e.sourceHandle === 'default')
          || outEdges[0];
        if (targetEdge) {
          const next = nodes.find(n => n.id === targetEdge.target);
          if (next) { await processNode(next, nodes, edges); return; }
        }
        endFlow();
        break;
      }

      case 'action-flow': {
        const subFlowId = d.flowId;
        if (!subFlowId) {
          addMsg({ type: 'action', content: `⚠️ Nenhum fluxo selecionado`, actionIcon: '❌' });
          await advanceOrEnd();
          break;
        }

        addMsg({ type: 'action', content: `Iniciando sub-fluxo: ${d.flowName || d.label || '...'}`, actionIcon: '🔄' });
        setIsProcessing(true);
        try {
          const { data: subFlow, error } = await supabase.from('flows').select('*').eq('id', subFlowId).single();
          if (error) throw error;

          // Push current flow onto stack
          setSimState(prev => ({
            ...prev,
            parentFlowStack: [...prev.parentFlowStack, { flowId: prev.activeFlowId, flowData: prev.activeFlowData, nodeId: node.id, nodes, edges }],
            activeFlowId: subFlowId,
            activeFlowData: subFlow,
          }));

          const subNodes = (subFlow as any).nodes as Node[];
          const subEdges = (subFlow as any).edges as Edge[];
          const startNode = subNodes.find(n => n.type === 'start');
          setIsProcessing(false);
          if (startNode) await processNode(startNode, subNodes, subEdges);

          // After sub-flow completes, pop stack and restore parent context
          setSimState(prev => {
            const stack = [...prev.parentFlowStack];
            const parent = stack.pop();
            if (parent) {
              return { ...prev, parentFlowStack: stack, activeFlowId: parent.flowId, activeFlowData: parent.flowData };
            }
            return prev;
          });

          // Now handle waitForResponse + follow-ups on the action-flow node
          const waitForResp = d.waitForResponse !== false; // default true for action-flow
          const followUpSteps = (d.remarketingSteps as any[]) || [];

          if (waitForResp && followUpSteps.length > 0) {
            // Wait for user to respond with follow-up messages
            addMsg({ type: 'action', content: `Aguardando resposta com ${followUpSteps.length} follow-up(s)`, actionIcon: '📩' });
            const responded = await waitForResponseWithFollowUps(followUpSteps, 'resposta');
            if (responded) {
              addMsg({ type: 'action', content: `✓ Cliente respondeu`, actionIcon: '✅' });
              await wait(400);
              await advanceOrEnd('responded');
            } else {
              addMsg({ type: 'action', content: `✗ Timeout — sem resposta`, actionIcon: '⏱️' });
              await wait(400);
              await advanceOrEnd('timeout');
            }
          } else if (waitForResp) {
            // Wait for response but no follow-ups
            setSimState(prev => ({ ...prev, waitingForInput: true, inputVariable: 'resposta' }));
          } else {
            await advanceOrEnd();
          }
        } catch (err) {
          setIsProcessing(false);
          addMsg({ type: 'action', content: `❌ Erro ao carregar sub-fluxo`, actionIcon: '⚠️' });
          await advanceOrEnd();
        }
        break;
      }

      case 'ai-handoff': {
        const agentId = d.agentId;
        const agent = agentId ? resolveAgent(agentId) : null;
        const agentName = agent?.name || d.agentName || 'Agente IA';

        setSimState(prev => ({
          ...prev,
          activeAgentId: agentId,
          activeAgentName: agentName,
          activeAgentPrompt: d.additionalPrompt || '',
          expectedOutcomes: d.expectedOutcomes ? String(d.expectedOutcomes).split(',').map((s: string) => s.trim()).filter(Boolean) : [],
        }));

        addMsg({ type: 'action', content: `Transferindo para agente: ${agentName}`, actionIcon: '🤖' });
        await wait(600);

        // If there's already user messages, call AI immediately
        const hasUserMsg = messages.some(m => m.type === 'user');
        if (hasUserMsg) {
          await callAI(d, node.id);
        } else {
          // Wait for first user message
          setSimState(prev => ({ ...prev, waitingForInput: true, inputVariable: 'ai_query' }));
        }
        break;
      }

      case 'action-transfer': {
        addMsg({ type: 'action', content: `Transferindo para atendimento humano`, actionIcon: '👤' });
        await wait(800);
        addMsg({ type: 'system', content: 'Conversa transferida para um atendente humano' });
        endFlow();
        break;
      }

      case 'action-workspace': {
        addMsg({ type: 'action', content: `Atribuindo workspace`, actionIcon: '🏢' });
        await wait(600);
        await advanceOrEnd();
        break;
      }

      case 'action-webhook': {
        addMsg({ type: 'action', content: `Executando webhook: ${d.url || '...'}`, actionIcon: '🌐' });
        await wait(1000);
        await advanceOrEnd();
        break;
      }

      default:
        await advanceOrEnd();
    }
  };

  const endFlow = () => {
    addMsg({ type: 'system', content: 'Fluxo finalizado' });
    setSimState(prev => ({ ...prev, waitingForInput: false, currentNodeId: null }));
    setIsProcessing(false);
    setIsThinking(false);
  };

  // ===== START =====
  const startSimulation = async () => {
    if (!simState.activeFlowData) return;
    resetSimulation();
    setIsStarted(true);
    setIsProcessing(true);

    addMsg({ type: 'action', content: 'Simulando entrada do cliente...', actionIcon: '▶️' });
    await wait(600);
    addMsg({ type: 'user', content: 'Olá! Gostaria de falar sobre o meu caso.' });
    await wait(800);

    const { nodes, edges } = simState.activeFlowData;
    const start = (nodes as Node[]).find(n => n.type === 'start');
    if (start) await processNode(start, nodes as Node[], edges as Edge[]);
    setIsProcessing(false);
  };

  const resetSimulation = () => {
    followUpResolveRef.current = null;
    setMessages([]);
    setSimState({ currentNodeId: null, waitingForInput: false, variables: {}, activeFlowId: flowId, activeFlowData: initialFlow, parentFlowStack: [] });
    setIsStarted(false);
    setUserInput('');
    setIsThinking(false);
    setIsRecording(false);
  };

  // ===== USER INPUT =====
  const handleUserInput = async () => {
    if (!userInput.trim()) return;
    const val = userInput.trim();
    setUserInput('');
    addMsg({ type: 'user', content: val });

    // If there's an active follow-up sequence, resolve it (user responded!)
    if (followUpResolveRef.current) {
      const resolve = followUpResolveRef.current;
      followUpResolveRef.current = null;
      setSimState(prev => ({ ...prev, followUpResolve: null, waitingForInput: false, variables: { ...prev.variables, [simState.inputVariable || 'resposta']: val } }));
      resolve(true); // user responded
      return;
    }

    // Handle button selection
    if (simState.pendingButtons) {
      const matched = simState.pendingButtons.find(b => b.label.toLowerCase() === val.toLowerCase());
      if (!matched) {
        addMsg({ type: 'bot', content: 'Por favor, selecione uma das opções disponíveis.' });
        return;
      }
      setSimState(prev => ({ ...prev, waitingForInput: false, pendingButtons: undefined, variables: { ...prev.variables, button_choice: matched.label } }));
      await wait(300);
      const nodes = simState.activeFlowData.nodes as Node[];
      const edges = simState.activeFlowData.edges as Edge[];
      const cur = nodes.find(n => n.id === simState.currentNodeId);
      if (cur) {
        setIsProcessing(true);
        // Try to find edge matching button id or label
        const btnEdge = edges.find(e => e.source === cur.id && (e.sourceHandle === matched.id || e.sourceHandle === matched.label));
        const next = btnEdge ? nodes.find(n => n.id === btnEdge.target) : findNext(cur.id, nodes, edges);
        if (next) await processNode(next, nodes, edges);
        else endFlow();
        setIsProcessing(false);
      }
      return;
    }

    // Handle list selection
    if (simState.pendingList) {
      setSimState(prev => ({ ...prev, waitingForInput: false, pendingList: undefined, variables: { ...prev.variables, list_choice: val } }));
      await wait(300);
      const nodes = simState.activeFlowData.nodes as Node[];
      const edges = simState.activeFlowData.edges as Edge[];
      const cur = nodes.find(n => n.id === simState.currentNodeId);
      if (cur) {
        setIsProcessing(true);
        const next = findNext(cur.id, nodes, edges);
        if (next) await processNode(next, nodes, edges);
        else endFlow();
        setIsProcessing(false);
      }
      return;
    }

    // Handle AI conversation
    if (simState.inputVariable === 'ai_query') {
      const curNode = simState.activeFlowData?.nodes?.find((n: Node) => n.id === simState.currentNodeId);
      const nodeData = curNode?.data || {};
      await callAI(nodeData, simState.currentNodeId || '');
      return;
    }

    // Handle regular input
    setSimState(prev => ({
      ...prev,
      waitingForInput: false,
      inputVariable: undefined,
      variables: { ...prev.variables, [simState.inputVariable || 'resposta']: val },
    }));

    await wait(300);
    const nodes = simState.activeFlowData.nodes as Node[];
    const edges = simState.activeFlowData.edges as Edge[];
    const cur = nodes.find(n => n.id === simState.currentNodeId);
    if (cur) {
      setIsProcessing(true);
      const next = findNext(cur.id, nodes, edges);
      if (next) await processNode(next, nodes, edges);
      else endFlow();
      setIsProcessing(false);
    }
  };

  const handleButtonClick = async (btn: { id: string; label: string }) => {
    const val = btn.label;
    addMsg({ type: 'user', content: val });
    setUserInput('');

    // If follow-up sequence is active, resolve it
    if (followUpResolveRef.current) {
      const resolve = followUpResolveRef.current;
      followUpResolveRef.current = null;
      setSimState(prev => ({ ...prev, followUpResolve: null, waitingForInput: false, pendingButtons: undefined, variables: { ...prev.variables, button_choice: val } }));
      resolve(true);
      return;
    }

    setSimState(prev => ({ ...prev, waitingForInput: false, pendingButtons: undefined, variables: { ...prev.variables, button_choice: val } }));
    await wait(300);
    const nodes = simState.activeFlowData.nodes as Node[];
    const edges = simState.activeFlowData.edges as Edge[];
    const cur = nodes.find(n => n.id === simState.currentNodeId);
    if (cur) {
      setIsProcessing(true);
      const btnEdge = edges.find(e => e.source === cur.id && (e.sourceHandle === btn.id || e.sourceHandle === btn.label));
      const next = btnEdge ? nodes.find(n => n.id === btnEdge.target) : findNext(cur.id, nodes, edges);
      if (next) await processNode(next, nodes, edges);
      else endFlow();
      setIsProcessing(false);
    }
  };

  const handleListRowClick = async (row: { id: string; title: string }) => {
    addMsg({ type: 'user', content: row.title });

    // If follow-up sequence is active, resolve it
    if (followUpResolveRef.current) {
      const resolve = followUpResolveRef.current;
      followUpResolveRef.current = null;
      setSimState(prev => ({ ...prev, followUpResolve: null, waitingForInput: false, pendingList: undefined, variables: { ...prev.variables, list_choice: row.title } }));
      resolve(true);
      return;
    }

    setSimState(prev => ({ ...prev, waitingForInput: false, pendingList: undefined, variables: { ...prev.variables, list_choice: row.title } }));
    await wait(300);
    const nodes = simState.activeFlowData.nodes as Node[];
    const edges = simState.activeFlowData.edges as Edge[];
    const cur = nodes.find(n => n.id === simState.currentNodeId);
    if (cur) {
      setIsProcessing(true);
      const listEdge = edges.find(e => e.source === cur.id && (e.sourceHandle === row.id || e.sourceHandle === row.title));
      const next = listEdge ? nodes.find(n => n.id === listEdge.target) : findNext(cur.id, nodes, edges);
      if (next) await processNode(next, nodes, edges);
      else endFlow();
      setIsProcessing(false);
    }
  };

  // ===== RENDER =====
  const renderMediaPreview = (msg: SimMessage) => {
    if (!msg.mediaUrl) return null;
    switch (msg.mediaType) {
      case 'image': return <img src={msg.mediaUrl} alt="" className="max-w-full max-h-40 rounded-lg mb-1.5" />;
      case 'video': return <div className="bg-muted/50 rounded-lg p-3 flex items-center gap-2 mb-1.5"><Video className="h-6 w-6 text-muted-foreground" /><span className="text-xs text-muted-foreground">Vídeo</span></div>;
      case 'audio': return <audio src={msg.mediaUrl} controls className="max-w-full h-8 mb-1.5" />;
      case 'document': return <div className="bg-muted/50 rounded-lg p-3 flex items-center gap-2 mb-1.5"><FileText className="h-6 w-6 text-muted-foreground" /><span className="text-xs text-muted-foreground">Documento</span></div>;
      default: return null;
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-[440px] p-0 flex flex-col bg-[#0a0a0f] border-l border-white/[0.06] overflow-hidden">
        {/* Header */}
        <div className="relative px-5 py-4 flex items-center justify-between z-20 bg-gradient-to-b from-white/[0.04] to-transparent border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 flex items-center justify-center ring-1 ring-emerald-500/20">
                <Smartphone className="h-5 w-5 text-emerald-400" />
              </div>
              {isStarted && <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 border-2 border-[#0a0a0f] animate-pulse" />}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white/90 tracking-tight">Simulador</h3>
              <p className="text-[11px] text-white/40 font-medium truncate max-w-[200px]">{flowName}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {isStarted && (
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/5" onClick={resetSimulation}>
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/5" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Messages area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5 space-y-3 scroll-smooth" style={{ background: 'linear-gradient(180deg, #0a0a0f 0%, #0d0d15 100%)' }}>
          {!isStarted ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-emerald-500/15 to-emerald-500/5 flex items-center justify-center mb-5 ring-1 ring-emerald-500/10">
                <Zap className="h-7 w-7 text-emerald-400" />
              </div>
              <h3 className="text-base font-semibold text-white/90 mb-2">Testar Fluxo</h3>
              <p className="text-[13px] text-white/35 leading-relaxed mb-6 max-w-[280px]">
                Simule o atendimento completo: fluxos, agentes de IA, tags, pipeline — tudo como na produção.
              </p>
              <Button
                onClick={startSimulation}
                className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold px-8 h-11 rounded-xl shadow-lg shadow-emerald-500/20 gap-2 transition-all hover:shadow-emerald-500/30"
              >
                <Play className="h-4 w-4" />
                Iniciar Simulação
              </Button>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <div key={msg.id} className={cn(
                  "flex animate-in fade-in slide-in-from-bottom-2 duration-300",
                  msg.type === 'user' ? 'justify-end' : msg.type === 'system' || msg.type === 'action' ? 'justify-center' : 'justify-start'
                )}>
                  {msg.type === 'system' ? (
                    <div className="bg-white/[0.04] px-4 py-1.5 rounded-full">
                      <span className="text-[10px] font-medium text-white/30">{msg.content}</span>
                    </div>
                  ) : msg.type === 'action' ? (
                    <div className="flex items-center gap-2 bg-white/[0.03] border border-white/[0.06] px-3.5 py-1.5 rounded-xl">
                      <span className="text-xs">{msg.actionIcon}</span>
                      <span className="text-[11px] font-medium text-white/40">{msg.content}</span>
                    </div>
                  ) : (
                    <div className={cn(
                      "max-w-[82%] px-3.5 py-2.5 relative",
                      msg.type === 'bot'
                        ? 'bg-white/[0.06] rounded-2xl rounded-tl-md border border-white/[0.06]'
                        : 'bg-emerald-600/90 rounded-2xl rounded-tr-md'
                    )}>
                      {msg.type === 'bot' && msg.agentName && (
                        <div className="flex items-center gap-1 mb-1">
                          <Sparkles className="h-2.5 w-2.5 text-emerald-400" />
                          <span className="text-[10px] font-semibold text-emerald-400/80">{msg.agentName}</span>
                        </div>
                      )}
                      {renderMediaPreview(msg)}
                      <p className="text-[13px] leading-relaxed whitespace-pre-wrap text-white/85">{msg.content}</p>
                      <div className="flex items-center justify-between mt-1">
                        {msg.type === 'bot' && msg.aiMetadata && (
                          <div className="flex items-center gap-0.5">
                            <button
                              onClick={() => { setFeedbackMessage({ id: msg.id, content: msg.content, metadata: msg.aiMetadata }); setFeedbackDialogOpen(true); }}
                              className="p-1 rounded hover:bg-white/10 transition-colors group"
                              title="Treinar IA com esta mensagem"
                            >
                              <ThumbsDown className="h-3 w-3 text-white/20 group-hover:text-red-400 transition-colors" />
                            </button>
                            <button
                              onClick={() => { setFeedbackMessage({ id: msg.id, content: msg.content, metadata: msg.aiMetadata }); setFeedbackDialogOpen(true); }}
                              className="p-1 rounded hover:bg-white/10 transition-colors group"
                              title="Criar regra positiva"
                            >
                              <ThumbsUp className="h-3 w-3 text-white/20 group-hover:text-emerald-400 transition-colors" />
                            </button>
                          </div>
                        )}
                        {!msg.aiMetadata && <div />}
                        <div className="flex items-center gap-1 opacity-40">
                          <span className="text-[9px] text-white/60">{msg.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                          {msg.type === 'user' && <CheckCheck className={cn("h-3 w-3", msg.status === 'read' ? 'text-blue-400' : 'text-white/40')} />}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Typing / thinking indicator */}
              {(isProcessing || isThinking || isRecording) && (
                <div className="flex justify-start animate-in fade-in duration-300">
                  <div className="bg-white/[0.06] border border-white/[0.06] px-4 py-3 rounded-2xl rounded-tl-md">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Loader2 className="h-3 w-3 text-emerald-400 animate-spin" />
                      <span className="text-[10px] font-semibold text-emerald-400/80">
                        {isThinking ? (simState.activeAgentName || 'IA') + ' pensando' : isRecording ? 'Gravando áudio' : 'Digitando'}
                      </span>
                    </div>
                    <div className="flex gap-1">
                      {[0, 150, 300].map(delay => (
                        <span key={delay} className={cn("w-1.5 h-1.5 rounded-full animate-bounce [animation-duration:0.7s]", isRecording ? "bg-red-400" : "bg-emerald-400/60")} style={{ animationDelay: `${delay}ms` }} />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Input area */}
        {isStarted && (
          <div className="p-3 border-t border-white/[0.06] bg-white/[0.02] space-y-2.5">
            {/* Button options */}
            {simState.pendingButtons && simState.pendingButtons.length > 0 && !isProcessing && (
              <div className="flex flex-wrap gap-1.5 px-1 animate-in slide-in-from-bottom-3 duration-500">
                {simState.pendingButtons.map(btn => (
                  <Button key={btn.id} variant="outline" size="sm" onClick={() => handleButtonClick(btn)}
                    className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/50 rounded-xl text-xs font-semibold h-9 px-4 transition-all">
                    {btn.label}
                  </Button>
                ))}
              </div>
            )}

            {/* List options */}
            {simState.pendingList && !isProcessing && (
              <div className="space-y-1 px-1 animate-in slide-in-from-bottom-3 duration-500 max-h-48 overflow-y-auto">
                {simState.pendingList.sections.map((section, si) => (
                  <div key={si}>
                    {section.title && <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider px-2 py-1">{section.title}</p>}
                    {section.rows?.map(row => (
                      <Button key={row.id} variant="ghost" size="sm" onClick={() => handleListRowClick(row)}
                        className="w-full justify-start text-left text-white/70 hover:bg-white/5 rounded-lg h-auto py-2 px-3">
                        <div>
                          <p className="text-xs font-medium">{row.title}</p>
                          {row.description && <p className="text-[10px] text-white/30">{row.description}</p>}
                        </div>
                      </Button>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {/* Text input */}
            <form onSubmit={e => { e.preventDefault(); handleUserInput(); }} className="flex items-center gap-2">
              <div className="flex-1 bg-white/[0.04] rounded-xl px-3.5 h-10 flex items-center border border-white/[0.06] focus-within:border-emerald-500/30 transition-colors">
                <Input
                  ref={inputRef}
                  value={userInput}
                  onChange={e => setUserInput(e.target.value)}
                  placeholder={simState.waitingForInput ? "Digite sua mensagem..." : "Aguarde..."}
                  disabled={!simState.waitingForInput || isProcessing || isThinking}
                  className="border-none bg-transparent focus-visible:ring-0 px-0 h-full text-[13px] text-white/80 placeholder:text-white/20 font-medium"
                />
              </div>
              <Button
                type="submit"
                size="icon"
                disabled={!simState.waitingForInput || isProcessing || isThinking || !userInput.trim()}
                className="h-10 w-10 rounded-xl bg-emerald-500 hover:bg-emerald-600 shadow-lg shadow-emerald-500/15 transition-all disabled:opacity-30 disabled:bg-white/5 disabled:shadow-none"
              >
                <Send className="h-4 w-4 text-white" />
              </Button>
            </form>
          </div>
        )}
      </SheetContent>

      {/* AI Feedback Dialog - same as conversations */}
      {feedbackMessage && (
        <AIFeedbackDialog
          open={feedbackDialogOpen}
          onOpenChange={setFeedbackDialogOpen}
          messageId={feedbackMessage.id}
          originalMessage={feedbackMessage.content}
          metadata={feedbackMessage.metadata || {}}
          organizationId={orgContext?.organizationId || ''}
        />
      )}
    </Sheet>
  );
}
