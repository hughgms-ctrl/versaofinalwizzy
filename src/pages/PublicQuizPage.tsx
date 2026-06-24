import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Star, ArrowRight, ArrowLeft, Check, Loader2, Upload, Send, CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// ---- Types ----
interface QuizData {
  id: string;
  name: string;
  organization_id: string;
  theme: any;
  settings: any;
  welcome_screen: any;
  end_screen: any;
  workspace_id?: string | null;
}

interface FlowBlock {
  id: string;
  type: string;
  data: Record<string, any>;
}

interface FlowNode {
  id: string;
  type: string;
  data: {
    label?: string;
    blocks?: FlowBlock[];
  };
  position: { x: number; y: number };
}

interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
}

// A "step" in the public quiz is one block from a group node
interface Step {
  nodeId: string;
  blockIndex: number;
  block: FlowBlock;
}

export default function PublicQuizPage({ inlineQuiz, inlineNodes, inlineEdges }: { inlineQuiz?: any; inlineNodes?: any[]; inlineEdges?: any[] } = {}) {
  const { token } = useParams<{ token: string }>();
  const [quiz, setQuiz] = useState<QuizData | null>(null);
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [edges, setEdges] = useState<FlowEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Navigation state
  const [phase, setPhase] = useState<'welcome' | 'flow' | 'contact' | 'end'>('welcome');
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(null);
  const [currentBlockIdx, setCurrentBlockIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [variables, setVariables] = useState<Record<string, any>>({});
  const [contact, setContact] = useState({ name: '', phone: '', email: '' });
  const [submitting, setSubmitting] = useState(false);
  const [animDir, setAnimDir] = useState<'next' | 'prev'>('next');
  const [history, setHistory] = useState<Array<{ nodeId: string; blockIdx: number }>>([]);
  const [stepsVisited, setStepsVisited] = useState(0);
  const [waitCountdown, setWaitCountdown] = useState<number | null>(null);

  // Track pixel fires
  const firedPixels = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (inlineQuiz) {
      setQuiz(inlineQuiz);
      setNodes(inlineNodes || []);
      setEdges(inlineEdges || []);
      setLoading(false);
      if (inlineQuiz.welcome_screen?.showWelcome === false) {
        startFlow(inlineNodes || [], inlineEdges || []);
      }
      return;
    }
    if (token) loadQuiz();
  }, [token, inlineQuiz]);

  const loadQuiz = async () => {
    try {
      const { data: q, error: e1 } = await supabase
        .from('quizzes').select('*').eq('public_token', token).eq('is_active', true).single();
      if (e1 || !q) throw new Error('Wizzy Quiz não encontrado');
      const quizData = q as any;
      setQuiz(quizData);

      const theme = quizData.theme || {};
      setNodes(theme.nodes || []);
      setEdges(theme.edges || []);

      if (quizData.welcome_screen?.showWelcome === false) {
        startFlow(theme.nodes || [], theme.edges || []);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const startFlow = useCallback((flowNodes?: FlowNode[], flowEdges?: FlowEdge[]) => {
    const ns = flowNodes || nodes;
    const es = flowEdges || edges;
    // Find start node and follow first edge
    const startNode = ns.find(n => n.type === 'quiz-start');
    if (!startNode) { setPhase('end'); return; }
    const firstEdge = es.find(e => e.source === startNode.id);
    if (!firstEdge) { setPhase('end'); return; }
    setCurrentNodeId(firstEdge.target);
    setCurrentBlockIdx(0);
    setPhase('flow');
    setAnimDir('next');
  }, [nodes, edges]);

  // Get current block
  const currentNode = nodes.find(n => n.id === currentNodeId);
  const currentBlocks = (currentNode?.data?.blocks as FlowBlock[]) || [];
  const currentBlock = currentBlocks[currentBlockIdx] || null;

  // Estimate total blocks for progress
  const totalBlocks = nodes.filter(n => n.type === 'quiz-group').reduce((sum, n) => sum + ((n.data.blocks as any[])?.length || 0), 0);
  const progress = totalBlocks > 0 ? Math.min((stepsVisited / totalBlocks) * 100, 100) : 0;

  // Navigate to next block/node
  const goToNextBlock = useCallback((selectedHandle?: string) => {
    if (!currentNodeId) return;
    setAnimDir('next');
    setHistory(prev => [...prev, { nodeId: currentNodeId, blockIdx: currentBlockIdx }]);
    setStepsVisited(prev => prev + 1);

    const blocks = (currentNode?.data?.blocks as FlowBlock[]) || [];

    // If there are more blocks in this group, go to next block
    if (currentBlockIdx < blocks.length - 1) {
      setCurrentBlockIdx(prev => prev + 1);
      return;
    }

    // Otherwise follow edge to next node
    let nextEdge: FlowEdge | undefined;
    if (selectedHandle) {
      nextEdge = edges.find(e => e.source === currentNodeId && e.sourceHandle === selectedHandle);
    }
    if (!nextEdge) {
      nextEdge = edges.find(e => e.source === currentNodeId);
    }

    if (nextEdge) {
      setCurrentNodeId(nextEdge.target);
      setCurrentBlockIdx(0);
    } else {
      // No more edges — submit and go to end
      handleSubmit();
    }
  }, [currentNodeId, currentBlockIdx, currentNode, edges, quiz]);

  const goBack = useCallback(() => {
    setAnimDir('prev');
    const prev = history[history.length - 1];
    if (!prev) {
      setPhase('welcome');
      return;
    }
    setHistory(h => h.slice(0, -1));
    setCurrentNodeId(prev.nodeId);
    setCurrentBlockIdx(prev.blockIdx);
    setPhase('flow');
  }, [history]);

  // Save variable
  const setVariable = useCallback((name: string, value: any) => {
    if (name) {
      setVariables(prev => ({ ...prev, [name]: value }));
    }
  }, []);

  // Handle answer for a block
  const setBlockAnswer = useCallback((blockId: string, value: any, variableName?: string) => {
    setAnswers(prev => ({ ...prev, [blockId]: value }));
    if (variableName) setVariable(variableName, value);
  }, [setVariable]);

  // Handle submit
  const handleSubmit = async () => {
    if (!quiz) return;
    setSubmitting(true);
    try {
      const answersArray = Object.entries(answers).map(([blockId, answer]) => ({
        block_id: blockId,
        answer,
      }));

      // Use variables for contact info (name, phone, email come from input blocks now)
      await supabase.from('quiz_submissions').insert({
        quiz_id: quiz.id,
        organization_id: quiz.organization_id,
        respondent_name: variables['nome'] || variables['name'] || null,
        respondent_phone: variables['phone'] || variables['telefone'] || variables['whatsapp'] || null,
        respondent_email: variables['email'] || null,
        answers: answersArray,
        metadata: variables,
        completed_at: new Date().toISOString(),
      });

      // Call public quiz-actions edge function to save lead info, description, attachments, and associate to workspace
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const url = `https://${projectId}.supabase.co/functions/v1/quiz-actions`;
      
      const respondentPhone = variables['phone'] || variables['telefone'] || variables['whatsapp'] || '';
      
      if (respondentPhone) {
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            organization_id: quiz.organization_id,
            quiz_id: quiz.id,
            action: 'submit_quiz',
            contact_name: variables['nome'] || variables['name'] || '',
            contact_email: variables['email'] || '',
            contact_phone: respondentPhone,
            workspace_id: quiz.workspace_id || '',
            variables: variables
          }),
        }).catch((e) => console.error('Error sending quiz-actions submission:', e));
      }

      setPhase('end');
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  // ---- Logic block handlers ----
  const handleConditionBlock = useCallback((block: FlowBlock) => {
    const { variable, operator, value, compareType } = block.data;
    let rawValue = variables[variable] ?? '';
    let result = false;

    // Extract comparable value from date objects (flexible precision)
    const extractDateValue = (v: any): string => {
      if (typeof v === 'object' && v?.value) return String(v.value);
      return String(v);
    };

    const resolvedVar = extractDateValue(rawValue);
    const resolvedVal = String(value);

    if (compareType === 'date') {
      // Normalize to comparable date strings (YYYY-MM-DD, YYYY-MM, or YYYY)
      const dVar = resolvedVar.replace(/T.*/, '');
      const dVal = resolvedVal.replace(/T.*/, '');
      switch (operator) {
        case 'equals': result = dVar === dVal; break;
        case 'not_equals': result = dVar !== dVal; break;
        case 'greater_than': result = dVar > dVal; break;
        case 'less_than': result = dVar < dVal; break;
        case 'greater_equal': result = dVar >= dVal; break;
        case 'less_equal': result = dVar <= dVal; break;
        case 'is_set': result = dVar !== '' && dVar !== 'Não sei'; break;
        case 'is_empty': result = dVar === '' || dVar === 'Não sei'; break;
        default: result = false;
      }
    } else if (compareType === 'number') {
      const nVar = Number(resolvedVar);
      const nVal = Number(resolvedVal);
      switch (operator) {
        case 'equals': result = nVar === nVal; break;
        case 'not_equals': result = nVar !== nVal; break;
        case 'greater_than': result = nVar > nVal; break;
        case 'less_than': result = nVar < nVal; break;
        case 'greater_equal': result = nVar >= nVal; break;
        case 'less_equal': result = nVar <= nVal; break;
        case 'is_set': result = resolvedVar !== '' && !isNaN(nVar); break;
        case 'is_empty': result = resolvedVar === '' || isNaN(nVar); break;
        default: result = false;
      }
    } else {
      // Text comparison (default)
      switch (operator) {
        case 'equals': result = resolvedVar === resolvedVal; break;
        case 'not_equals': result = resolvedVar !== resolvedVal; break;
        case 'contains': result = resolvedVar.toLowerCase().includes(resolvedVal.toLowerCase()); break;
        case 'greater_than': result = resolvedVar > resolvedVal; break;
        case 'less_than': result = resolvedVar < resolvedVal; break;
        case 'greater_equal': result = resolvedVar >= resolvedVal; break;
        case 'less_equal': result = resolvedVar <= resolvedVal; break;
        case 'is_set': result = resolvedVar !== '' && resolvedVar !== null && resolvedVar !== undefined; break;
        case 'is_empty': result = resolvedVar === '' || resolvedVar === null || resolvedVar === undefined; break;
        default: result = false;
      }
    }

    goToNextBlock(result ? 'true' : 'false');
  }, [variables, goToNextBlock]);

  const handleABTestBlock = useCallback((block: FlowBlock) => {
    const percentA = block.data.percentA || 50;
    const isA = Math.random() * 100 < percentA;
    goToNextBlock(isA ? 'a' : 'b');
  }, [goToNextBlock]);

  const handleRedirectBlock = useCallback((block: FlowBlock) => {
    const { url, newTab } = block.data;
    if (url) {
      const interpolatedUrl = interpolate(url, variables);
      if (newTab) {
        window.open(interpolatedUrl, '_blank');
        // Continue flow after opening in new tab
        setTimeout(() => goToNextBlock(), 100);
      } else {
        window.location.href = interpolatedUrl;
      }
    } else {
      goToNextBlock();
    }
  }, [goToNextBlock, variables]);

  const handleWaitBlock = useCallback((block: FlowBlock) => {
    const seconds = block.data.seconds || 3;
    setWaitCountdown(seconds);
    const interval = setInterval(() => {
      setWaitCountdown(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(interval);
          goToNextBlock();
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }, [goToNextBlock]);

  const handlePixelBlock = useCallback((block: FlowBlock) => {
    const { platform, pixelId, eventName } = block.data;
    const key = `${platform}-${pixelId}-${eventName}`;
    if (firedPixels.current.has(key)) {
      goToNextBlock();
      return;
    }
    firedPixels.current.add(key);

    if (platform === 'facebook' && pixelId) {
      // Fire Facebook Pixel
      try {
        if ((window as any).fbq) {
          (window as any).fbq('trackSingle', pixelId, eventName || 'PageView');
        } else {
          // Load pixel script dynamically
          const script = document.createElement('script');
          script.innerHTML = `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixelId}');fbq('track','${eventName || 'PageView'}');`;
          document.head.appendChild(script);
        }
      } catch {}
    } else if (platform === 'google' && pixelId) {
      // Fire Google Tag
      try {
        if ((window as any).gtag) {
          (window as any).gtag('event', eventName || 'page_view', { send_to: pixelId });
        } else {
          const script = document.createElement('script');
          script.src = `https://www.googletagmanager.com/gtag/js?id=${pixelId}`;
          script.async = true;
          document.head.appendChild(script);
          const script2 = document.createElement('script');
          script2.innerHTML = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${pixelId}');gtag('event','${eventName || 'page_view'}');`;
          document.head.appendChild(script2);
        }
      } catch {}
    }

    // Auto-advance after pixel fire
    setTimeout(() => goToNextBlock(), 100);
  }, [goToNextBlock]);

  const handleWhatsAppTrigger = useCallback((block: FlowBlock) => {
    const { waNumber, waMessage, useContactPhone, tagIds, workspaceId, pipelineId, columnId } = block.data;
    const targetPhone = useContactPhone ? (variables['phone'] || variables['telefone'] || variables['whatsapp'] || '') : (waNumber || '');
    const contactPhone = variables['phone'] || variables['telefone'] || variables['whatsapp'] || '';
    
    if (targetPhone || tagIds?.length || workspaceId || pipelineId) {
      const message = interpolate(waMessage || '', variables);
      const phone = String(targetPhone).replace(/\D/g, '');
      
      // Use public quiz-actions edge function (no auth needed)
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const url = `https://${projectId}.supabase.co/functions/v1/quiz-actions`;
      
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: quiz?.organization_id,
          quiz_id: quiz?.id,
          action: phone ? 'send_whatsapp' : 'crm_action',
          phone,
          message,
          contact_name: variables['nome'] || variables['name'] || '',
          contact_email: variables['email'] || '',
          contact_phone: contactPhone,
          tag_ids: tagIds || [],
          workspace_id: workspaceId || '',
          pipeline_id: pipelineId || '',
          column_id: columnId || '',
        }),
      }).catch(() => {});
    }
    setTimeout(() => goToNextBlock(), 100);
  }, [goToNextBlock, variables, quiz]);

  const handleCrmAction = useCallback((block: FlowBlock) => {
    const { tagIds, workspaceId, pipelineId, columnId } = block.data;
    const contactPhone = variables['phone'] || variables['telefone'] || variables['whatsapp'] || '';
    
    if (contactPhone && (tagIds?.length || workspaceId || pipelineId)) {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const url = `https://${projectId}.supabase.co/functions/v1/quiz-actions`;
      
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: quiz?.organization_id,
          quiz_id: quiz?.id,
          action: 'crm_action',
          contact_name: variables['nome'] || variables['name'] || '',
          contact_email: variables['email'] || '',
          contact_phone: contactPhone,
          tag_ids: tagIds || [],
          workspace_id: workspaceId || '',
          pipeline_id: pipelineId || '',
          column_id: columnId || '',
        }),
      }).catch(() => {});
    }
    setTimeout(() => goToNextBlock(), 100);
  }, [goToNextBlock, variables, quiz]);

  // Auto-execute logic blocks when they become current
  useEffect(() => {
    if (phase !== 'flow' || !currentBlock) return;

    const logicAutoBlocks = ['quiz-logic-condition', 'quiz-logic-ab-test', 'quiz-logic-wait', 'quiz-logic-jump', 'quiz-logic-redirect', 'quiz-event-pixel', 'quiz-event-whatsapp-trigger', 'quiz-event-crm-action'];

    if (logicAutoBlocks.includes(currentBlock.type)) {
      const timer = setTimeout(() => {
        switch (currentBlock.type) {
          case 'quiz-logic-condition': handleConditionBlock(currentBlock); break;
          case 'quiz-logic-ab-test': handleABTestBlock(currentBlock); break;
          case 'quiz-logic-redirect': handleRedirectBlock(currentBlock); break;
          case 'quiz-logic-wait': handleWaitBlock(currentBlock); break;
          case 'quiz-logic-jump': {
            const targetLabel = currentBlock.data.targetGroup;
            const targetNode = nodes.find(n => n.data.label === targetLabel);
            if (targetNode) {
              setHistory(prev => [...prev, { nodeId: currentNodeId!, blockIdx: currentBlockIdx }]);
              setCurrentNodeId(targetNode.id);
              setCurrentBlockIdx(0);
            } else {
              goToNextBlock();
            }
            break;
          }
          case 'quiz-event-pixel': handlePixelBlock(currentBlock); break;
          case 'quiz-event-whatsapp-trigger': handleWhatsAppTrigger(currentBlock); break;
          case 'quiz-event-crm-action': handleCrmAction(currentBlock); break;
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [phase, currentBlock]);

  // ---- Rendering ----

  if (loading) return <FullScreenCenter><Loader2 className="h-8 w-8 animate-spin text-primary" /></FullScreenCenter>;
  if (error || !quiz) return (
    <FullScreenCenter>
      <h2 className="text-xl font-bold">Wizzy Quiz não encontrado</h2>
      <p className="text-muted-foreground mt-2">Este Wizzy Quiz não existe ou não está ativo.</p>
    </FullScreenCenter>
  );

  // End screen
  if (phase === 'end') {
    const es = quiz.end_screen || {};
    return (
      <FullScreenCenter>
        <div className="max-w-md w-full text-center space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mx-auto">
            <Check className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold">{es.title || 'Obrigado!'}</h1>
          <p className="text-muted-foreground text-lg">{es.description || 'Suas respostas foram enviadas com sucesso.'}</p>
          {es.redirectUrl && (
            <Button size="lg" onClick={() => window.open(es.redirectUrl, '_self')}>
              {es.buttonText || 'Continuar'}
            </Button>
          )}
        </div>
      </FullScreenCenter>
    );
  }

  // Welcome screen
  if (phase === 'welcome') {
    const ws = quiz.welcome_screen || {};
    return (
      <FullScreenCenter>
        <div className="max-w-lg w-full text-center space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 px-4">
          {ws.mediaUrl && (
            <div className="rounded-2xl overflow-hidden max-h-64 mx-auto">
              {ws.mediaUrl.includes('youtube') || ws.mediaUrl.includes('vimeo')
                ? <iframe src={toEmbedUrl(ws.mediaUrl)} className="w-full aspect-video rounded-2xl" allowFullScreen />
                : <img src={ws.mediaUrl} alt="" className="w-full h-auto object-cover rounded-2xl" />}
            </div>
          )}
          <h1 className="text-4xl font-bold tracking-tight">{ws.title || quiz.name}</h1>
          {ws.description && <p className="text-lg text-muted-foreground">{ws.description}</p>}
          <Button size="lg" className="text-lg px-8 h-14" onClick={() => startFlow()}>
            {ws.buttonText || 'Começar'}
            <ArrowRight className="h-5 w-5 ml-2" />
          </Button>
        </div>
      </FullScreenCenter>
    );
  }

  // Contact step (legacy — kept for backwards compatibility but no longer auto-triggered)

  // Flow step — render current block
  if (!currentBlock) return null;

  // Wait block rendering
  if (currentBlock.type === 'quiz-logic-wait' && waitCountdown !== null) {
    return (
      <FullScreenStep progress={progress} showProgress={quiz.settings?.showProgressBar !== false} dir={animDir}>
        <div className="text-center space-y-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
          <p className="text-lg text-muted-foreground">Aguarde {waitCountdown}s...</p>
        </div>
      </FullScreenStep>
    );
  }

  return (
    <FullScreenStep
      progress={progress}
      showProgress={quiz.settings?.showProgressBar !== false}
      onPrev={history.length > 0 ? goBack : undefined}
      dir={animDir}
    >
      <BlockRenderer
        block={currentBlock}
        answer={answers[currentBlock.id]}
        variables={variables}
        onAnswer={(val, varName) => setBlockAnswer(currentBlock.id, val, varName)}
        onNext={(handle) => goToNextBlock(handle)}
        isLast={false}
        quiz={quiz}
      />
    </FullScreenStep>
  );
}

// ---- Block Renderer ----
function BlockRenderer({ block, answer, variables, onAnswer, onNext, isLast, quiz }: {
  block: FlowBlock;
  answer: any;
  variables: Record<string, any>;
  onAnswer: (val: any, varName?: string) => void;
  onNext: (handle?: string) => void;
  isLast: boolean;
  quiz: QuizData | null;
}) {
  const d = block.data || {};

  // ---- BUBBLES ----
  if (block.type === 'quiz-bubble-text') {
    return (
      <div className="space-y-6">
        <div className="text-lg leading-relaxed whitespace-pre-wrap">{interpolate(d.content || '', variables)}</div>
        <Button size="lg" className="w-full h-14 text-lg" onClick={() => onNext()}>
          Continuar <ArrowRight className="h-5 w-5 ml-2" />
        </Button>
      </div>
    );
  }

  if (block.type === 'quiz-bubble-image') {
    return (
      <div className="space-y-6">
        {d.url && (
          <div className="rounded-2xl overflow-hidden">
            <img src={d.url} alt={d.alt || ''} className="w-full h-auto max-h-80 object-contain" />
          </div>
        )}
        <Button size="lg" className="w-full h-14 text-lg" onClick={() => onNext()}>
          Continuar <ArrowRight className="h-5 w-5 ml-2" />
        </Button>
      </div>
    );
  }

  if (block.type === 'quiz-bubble-video') {
    const isVertical = d.orientation === 'vertical';
    const isMP4 = d.url && (d.url.endsWith('.mp4') || d.url.endsWith('.webm') || d.url.endsWith('.mov'));
    const embedUrl = d.url ? toEmbedUrl(d.url) + (d.autoplay !== false ? '&autoplay=1' : '') : '';
    
    return (
      <div className="space-y-6">
        {d.url && (
          <div className={cn(
            "rounded-2xl overflow-hidden",
            isVertical ? "aspect-[9/16] max-w-[360px] mx-auto" : "aspect-video w-full"
          )}>
            {isMP4 ? (
              <video
                src={d.url}
                className="w-full h-full object-cover rounded-2xl"
                autoPlay={d.autoplay !== false}
                controls
                playsInline
              />
            ) : (
              <iframe
                src={embedUrl}
                className="w-full h-full"
                allowFullScreen
                allow="autoplay; encrypted-media"
              />
            )}
          </div>
        )}
        {d.showWhatsapp && d.waNumber && (
          <a
            href={`https://wa.me/${d.waNumber}?text=${encodeURIComponent(d.waMessage || '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full h-14 text-lg font-semibold rounded-lg bg-[#25D366] hover:bg-[#1da851] text-white transition-colors"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6 fill-current"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            {d.waButtonText || 'Falar no WhatsApp'}
          </a>
        )}
        <Button size="lg" className="w-full h-14 text-lg" onClick={() => onNext()}>
          Continuar <ArrowRight className="h-5 w-5 ml-2" />
        </Button>
      </div>
    );
  }

  if (block.type === 'quiz-bubble-audio') {
    return (
      <div className="space-y-6">
        {d.url && <audio controls src={d.url} className="w-full" autoPlay={d.autoplay !== false} />}
        <Button size="lg" className="w-full h-14 text-lg" onClick={() => onNext()}>
          Continuar <ArrowRight className="h-5 w-5 ml-2" />
        </Button>
      </div>
    );
  }

  if (block.type === 'quiz-bubble-embed') {
    return (
      <div className="space-y-6">
        {d.url && (
          d.url.startsWith('<') ? (
            <div className="rounded-2xl overflow-hidden" dangerouslySetInnerHTML={{ __html: d.url }} />
          ) : (
            <iframe src={d.url} className="w-full aspect-video rounded-2xl" allowFullScreen />
          )
        )}
        <Button size="lg" className="w-full h-14 text-lg" onClick={() => onNext()}>
          Continuar <ArrowRight className="h-5 w-5 ml-2" />
        </Button>
      </div>
    );
  }

  // ---- INPUTS ----
  if (block.type === 'quiz-input-text') {
    return (
      <InputWrapper onNext={onNext}>
        {d.question && <h2 className="text-2xl font-bold">{interpolate(d.question, variables)}</h2>}
        <Input
          value={answer || ''}
          onChange={e => onAnswer(e.target.value, d.variable)}
          placeholder={d.placeholder || 'Digite sua resposta...'}
          className="h-14 text-lg"
          autoFocus
        />
      </InputWrapper>
    );
  }

  if (block.type === 'quiz-input-number') {
    return (
      <InputWrapper onNext={onNext}>
        {d.question && <h2 className="text-2xl font-bold">{interpolate(d.question, variables)}</h2>}
        <Input
          type="number"
          value={answer || ''}
          onChange={e => onAnswer(e.target.value, d.variable)}
          placeholder={d.placeholder || 'Digite um número...'}
          className="h-14 text-lg"
          autoFocus
        />
      </InputWrapper>
    );
  }

  if (block.type === 'quiz-input-email') {
    return (
      <InputWrapper onNext={onNext}>
        {d.question && <h2 className="text-2xl font-bold">{interpolate(d.question, variables)}</h2>}
        <Input
          type="email"
          value={answer || ''}
          onChange={e => onAnswer(e.target.value, d.variable)}
          placeholder={d.placeholder || 'Digite seu email...'}
          className="h-14 text-lg"
          autoFocus
        />
      </InputWrapper>
    );
  }

  if (block.type === 'quiz-input-website') {
    return (
      <InputWrapper onNext={onNext}>
        {d.question && <h2 className="text-2xl font-bold">{interpolate(d.question, variables)}</h2>}
        <Input
          type="url"
          value={answer || ''}
          onChange={e => onAnswer(e.target.value, d.variable)}
          placeholder={d.placeholder || 'Digite uma URL...'}
          className="h-14 text-lg"
          autoFocus
        />
      </InputWrapper>
    );
  }

  if (block.type === 'quiz-input-phone') {
    return (
      <InputWrapper onNext={onNext}>
        {d.question && <h2 className="text-2xl font-bold">{interpolate(d.question, variables)}</h2>}
        <Input
          type="tel"
          value={answer || ''}
          onChange={e => onAnswer(e.target.value, d.variable)}
          placeholder={d.placeholder || 'Digite seu telefone...'}
          className="h-14 text-lg"
          autoFocus
        />
      </InputWrapper>
    );
  }

  if (block.type === 'quiz-input-date') {
    return (
      <DateBlockRenderer
        block={block}
        answer={answer}
        variables={variables}
        onAnswer={onAnswer}
        onNext={onNext}
      />
    );
  }

  if (block.type === 'quiz-input-time') {
    return (
      <InputWrapper onNext={onNext}>
        {d.question && <h2 className="text-2xl font-bold">{interpolate(d.question, variables)}</h2>}
        <Input
          type="time"
          value={answer || ''}
          onChange={e => onAnswer(e.target.value, d.variable)}
          className="h-14 text-lg"
        />
      </InputWrapper>
    );
  }

  if (block.type === 'quiz-input-file') {
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setUploading(true);
      setUploadError(null);
      try {
        const safeName = file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
        const storagePath = `quiz-uploads/${quiz?.id || 'unknown'}/${Date.now()}-${safeName}`;
        
        const { error: uploadErr } = await supabase.storage
          .from('contact-files')
          .upload(storagePath, file);

        if (uploadErr) throw uploadErr;

        const { data: { publicUrl } } = supabase.storage
          .from('contact-files')
          .getPublicUrl(storagePath);

        const fileValue = {
          name: file.name,
          url: publicUrl,
          storagePath: storagePath,
          size: file.size,
          type: file.type
        };

        onAnswer(fileValue, d.variable);
      } catch (err: any) {
        console.error('Erro ao enviar arquivo:', err);
        setUploadError(err.message || 'Erro ao enviar arquivo');
      } finally {
        setUploading(false);
      }
    };

    const fileAnswer = answer && typeof answer === 'object' ? answer : null;

    return (
      <InputWrapper onNext={onNext} disabled={uploading}>
        {d.question && <h2 className="text-2xl font-bold">{interpolate(d.question, variables)}</h2>}
        <label className={cn(
          "flex flex-col items-center justify-center border-2 border-dashed border-border rounded-xl p-8 cursor-pointer hover:bg-accent/50 transition-colors",
          uploading && "opacity-60 cursor-not-allowed pointer-events-none"
        )}>
          {uploading ? (
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
          ) : (
            <Upload className="h-8 w-8 text-muted-foreground mb-2" />
          )}
          <span className="text-sm text-muted-foreground">
            {uploading 
              ? 'Enviando arquivo...' 
              : fileAnswer 
                ? fileAnswer.name || 'Arquivo selecionado' 
                : 'Clique para enviar arquivo'}
          </span>
          {d.accept && <span className="text-xs text-muted-foreground/60 mt-1">Formatos: {d.accept}</span>}
          {uploadError && <span className="text-xs text-destructive mt-2">{uploadError}</span>}
          <input
            type="file"
            accept={d.accept || undefined}
            className="hidden"
            disabled={uploading}
            onChange={handleFileChange}
          />
        </label>
      </InputWrapper>
    );
  }

  if (block.type === 'quiz-input-buttons') {
    const options = (d.options as any[]) || [];
    return (
      <div className="space-y-4">
        {d.question && <h2 className="text-2xl font-bold">{interpolate(d.question, variables)}</h2>}
        <div className="space-y-3">
          {options.map((opt: any, idx: number) => (
            <Button
              key={idx}
              variant={answer === opt.label ? 'default' : 'outline'}
              className="w-full h-14 text-lg justify-start"
              onClick={() => {
                onAnswer(opt.label, d.variable);
                if (opt.url) {
                  window.open(opt.url, '_blank');
                }
                setTimeout(() => onNext(`option-${idx}`), 150);
              }}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>
    );
  }

  if (block.type === 'quiz-input-pic-choice') {
    const options = (d.options as any[]) || [];
    return (
      <div className="space-y-4">
        {d.question && <h2 className="text-2xl font-bold">{interpolate(d.question, variables)}</h2>}
        <div className="grid grid-cols-2 gap-3">
          {options.map((opt: any, idx: number) => (
            <button
              key={idx}
              onClick={() => {
                onAnswer(opt.label, d.variable);
                setTimeout(() => onNext(`option-${idx}`), 150);
              }}
              className={cn(
                "rounded-xl border-2 overflow-hidden transition-all text-center",
                answer === opt.label ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-primary/40'
              )}
            >
              {opt.imageUrl && (
                <img src={opt.imageUrl} alt={opt.label} className="w-full h-32 object-cover" />
              )}
              <div className="p-3">
                <span className="text-sm font-medium">{opt.label}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (block.type === 'quiz-input-rating') {
    const max = d.maxRating || 5;
    return (
      <div className="space-y-6">
        {d.question && <h2 className="text-2xl font-bold">{interpolate(d.question, variables)}</h2>}
        <div className="flex gap-3 justify-center py-4">
          {Array.from({ length: max }, (_, i) => (
            <button
              key={i}
              onClick={() => onAnswer(i + 1, d.variable)}
              className="transition-transform hover:scale-125 active:scale-95"
            >
              <Star className={cn("h-10 w-10", (answer || 0) > i ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground/30")} />
            </button>
          ))}
        </div>
        {answer && (
          <Button size="lg" className="w-full h-14 text-lg" onClick={() => onNext()}>
            OK <ArrowRight className="h-5 w-5 ml-2" />
          </Button>
        )}
      </div>
    );
  }

  // Contact info grouped block
  if (block.type === 'quiz-input-contact-info') {
    const showName = d.showName !== false;
    const showPhone = d.showPhone !== false;
    const showEmail = d.showEmail !== false;
    const contactData = answer || {};
    
    return (
      <div className="space-y-6">
        {d.question && <h2 className="text-2xl font-bold">{interpolate(d.question, variables)}</h2>}
        <div className="space-y-4">
          {showName && (
            <div>
              <Label className="text-sm font-medium">Nome {d.nameRequired !== false && <span className="text-destructive">*</span>}</Label>
              <Input
                value={contactData.name || ''}
                onChange={e => onAnswer({ ...contactData, name: e.target.value }, 'nome')}
                placeholder="Seu nome"
                className="h-14 text-lg mt-1"
                autoFocus
              />
            </div>
          )}
          {showPhone && (
            <div>
              <Label className="text-sm font-medium">WhatsApp {d.phoneRequired !== false && <span className="text-destructive">*</span>}</Label>
              <Input
                type="tel"
                value={contactData.phone || ''}
                onChange={e => onAnswer({ ...contactData, phone: e.target.value }, 'whatsapp')}
                placeholder="(11) 99999-9999"
                className="h-14 text-lg mt-1"
              />
            </div>
          )}
          {showEmail && (
            <div>
              <Label className="text-sm font-medium">Email {d.emailRequired && <span className="text-destructive">*</span>}</Label>
              <Input
                type="email"
                value={contactData.email || ''}
                onChange={e => onAnswer({ ...contactData, email: e.target.value }, 'email')}
                placeholder="seu@email.com"
                className="h-14 text-lg mt-1"
              />
            </div>
          )}
        </div>
        <Button size="lg" className="w-full h-14 text-lg" onClick={() => {
          // Save individual variables
          if (contactData.name) variables['nome'] = contactData.name;
          if (contactData.phone) {
            variables['phone'] = contactData.phone;
            variables['telefone'] = contactData.phone;
            variables['whatsapp'] = contactData.phone;
          }
          if (contactData.email) variables['email'] = contactData.email;
          onNext();
        }}>
          Continuar <ArrowRight className="h-5 w-5 ml-2" />
        </Button>
      </div>
    );
  }

  // Fallback for unknown blocks
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">Bloco desconhecido: {block.type}</p>
      <Button size="lg" onClick={() => onNext()}>Continuar</Button>
    </div>
  );
}

// ---- Helpers ----

// Date block with flexible precision (exact, month/year, year only, unknown)
function DateBlockRenderer({ block, answer, variables, onAnswer, onNext }: {
  block: FlowBlock; answer: any; variables: Record<string, any>;
  onAnswer: (val: any, varName?: string) => void; onNext: (h?: string) => void;
}) {
  const d = block.data || {};
  const allowFlexible = d.allowFlexible !== false;
  const allowUnknown = d.allowUnknown !== false;
  const isRange = d.isRange === true;
  const withTime = d.withTime === true;
  const buttonLabel = d.buttonLabel || 'Enviar';
  const minDate = d.minDate ? new Date(d.minDate + 'T00:00:00') : undefined;
  const maxDate = d.maxDate ? new Date(d.maxDate + 'T00:00:00') : undefined;

  const [showFlexible, setShowFlexible] = useState(false);
  const [flexMode, setFlexMode] = useState<'month_year' | 'year' | null>(null);
  const [timeValue, setTimeValue] = useState('');
  const [rangeFrom, setRangeFrom] = useState<Date | undefined>();
  const [rangeTo, setRangeTo] = useState<Date | undefined>();
  const [showCalendar, setShowCalendar] = useState(false);
  const [flexMonth, setFlexMonth] = useState('');
  const [flexYear, setFlexYear] = useState('');
  const [flexYearOnly, setFlexYearOnly] = useState('');

  const currentAnswer = typeof answer === 'object' ? answer : { precision: 'exact', value: answer || '' };

  const currentYear = new Date().getFullYear();
  const months = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];
  const years = Array.from({ length: 126 }, (_, i) => currentYear - i);

  const selectedDate = currentAnswer.precision === 'exact' && currentAnswer.value
    ? new Date((currentAnswer.value as string).split('T')[0] + 'T00:00:00')
    : undefined;

  const handleExactSelect = (date: Date | undefined) => {
    if (date) {
      const val = format(date, 'yyyy-MM-dd');
      const finalValue = withTime && timeValue ? `${val}T${timeValue}` : val;
      onAnswer({ precision: 'exact', value: finalValue }, d.variable);
    }
    setShowCalendar(false);
  };

  const handleFlexSubmit = () => {
    if (flexMode === 'month_year' && flexMonth && flexYear) {
      onAnswer({ precision: 'month_year', value: `${flexYear}-${flexMonth}` }, d.variable);
      onNext('date-answered');
    } else if (flexMode === 'year' && flexYearOnly) {
      onAnswer({ precision: 'year', value: flexYearOnly }, d.variable);
      onNext('date-answered');
    } else if (flexYear && !flexMonth) {
      // If only year filled in month_year mode, treat as year
      onAnswer({ precision: 'year', value: flexYear }, d.variable);
      onNext('date-answered');
    }
  };

  // Range mode
  if (isRange) {
    return (
      <div className="space-y-6">
        {d.question && <h2 className="text-2xl font-bold">{interpolate(d.question, variables)}</h2>}
        <div className="space-y-4">
          <div>
            <Label className="text-sm font-medium mb-1 block">{d.fromLabel || 'De:'}</Label>
            <div className="flex justify-center">
              <Calendar mode="single" selected={rangeFrom} onSelect={setRangeFrom} locale={ptBR}
                fromDate={minDate} toDate={maxDate} className="rounded-md border pointer-events-auto" />
            </div>
          </div>
          <div>
            <Label className="text-sm font-medium mb-1 block">{d.toLabel || 'Até:'}</Label>
            <div className="flex justify-center">
              <Calendar mode="single" selected={rangeTo} onSelect={setRangeTo} locale={ptBR}
                fromDate={minDate} toDate={maxDate} className="rounded-md border pointer-events-auto" />
            </div>
          </div>
        </div>
        {withTime && (
          <Input type="time" value={timeValue} onChange={e => setTimeValue(e.target.value)} className="h-12 text-lg" placeholder="Horário" />
        )}
        <Button size="lg" className="w-full h-14 text-lg" onClick={() => {
          const from = rangeFrom ? format(rangeFrom, 'yyyy-MM-dd') : '';
          const to = rangeTo ? format(rangeTo, 'yyyy-MM-dd') : '';
          onAnswer({ precision: 'range', value: `${from} ~ ${to}` }, d.variable);
          onNext('date-answered');
        }}>
          {buttonLabel}
        </Button>
        {allowUnknown && (
          <Button variant="ghost" size="lg" className="w-full h-12 text-muted-foreground" onClick={() => {
            onAnswer({ precision: 'unknown', value: 'Não sei' }, d.variable);
            onNext('date-unknown');
          }}>
            Não sei
          </Button>
        )}
      </div>
    );
  }

  // Default mode: Calendar first, then "Não sei data exata" reveals flexible options
  return (
    <div className="space-y-6">
      {d.question && <h2 className="text-2xl font-bold">{interpolate(d.question, variables)}</h2>}

      {/* Date input field with calendar toggle */}
      {!showFlexible && (
        <div className="space-y-3">
          {/* Typeable date input with inline calendar icon */}
          <div className="relative">
            <Input
              type="text"
              inputMode="numeric"
              value={selectedDate ? format(selectedDate, "dd/MM/yyyy", { locale: ptBR }) : (answer?.typedValue || '')}
              placeholder="dd/mm/aaaa"
              className="h-14 text-lg pr-12"
              maxLength={10}
              onChange={(e) => {
                const prev = answer?.typedValue || '';
                let digits = e.target.value.replace(/\D/g, '');
                if (digits.length > 8) digits = digits.slice(0, 8);
                let masked = '';
                if (digits.length > 4) {
                  masked = digits.slice(0, 2) + '/' + digits.slice(2, 4) + '/' + digits.slice(4);
                } else if (digits.length > 2) {
                  masked = digits.slice(0, 2) + '/' + digits.slice(2);
                } else {
                  masked = digits;
                }
                onAnswer({ ...currentAnswer, typedValue: masked }, d.variable);
                if (digits.length === 8) {
                  const dd = parseInt(digits.slice(0, 2), 10);
                  const mm = parseInt(digits.slice(2, 4), 10);
                  const yyyy = parseInt(digits.slice(4, 8), 10);
                  if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12 && yyyy >= 1900 && yyyy <= 2100) {
                    const parsed = new Date(`${yyyy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}T00:00:00`);
                    if (!isNaN(parsed.getTime()) && parsed.getDate() === dd) {
                      const val = format(parsed, 'yyyy-MM-dd');
                      onAnswer({ precision: 'exact', value: val }, d.variable);
                    }
                  }
                }
              }}
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted transition-colors"
              onClick={() => setShowCalendar(!showCalendar)}
            >
              <CalendarIcon className="h-5 w-5 text-muted-foreground" />
            </button>
          </div>

          {showCalendar && (
            <div className="flex justify-center animate-in fade-in slide-in-from-top-2 duration-200">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={handleExactSelect}
                locale={ptBR}
                className="rounded-md border pointer-events-auto"
              />
            </div>
          )}

          {selectedDate && (
            <p className="text-center text-sm text-muted-foreground">
              Selecionado: {format(selectedDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
            </p>
          )}

          {/* Submit exact date */}
          {selectedDate && (
            <Button size="lg" className="w-full h-14 text-lg" onClick={() => onNext('date-answered')}>
              {buttonLabel} <ArrowRight className="h-5 w-5 ml-2" />
            </Button>
          )}

          {/* "Não sei data exata" button */}
          {allowFlexible && (
            <Button
              variant="outline"
              size="lg"
              className="w-full h-12 text-muted-foreground"
              onClick={() => { setShowFlexible(true); setShowCalendar(false); }}
            >
              Não sei a data exata
            </Button>
          )}

          {/* "Não sei" (unknown) button — only if no flexible */}
          {!allowFlexible && allowUnknown && (
            <Button variant="ghost" size="lg" className="w-full h-12 text-muted-foreground" onClick={() => {
              onAnswer({ precision: 'unknown', value: 'Não sei' }, d.variable);
              onNext('date-unknown');
            }}>
              Não sei
            </Button>
          )}
        </div>
      )}

      {/* Flexible precision: Month/Year or Year only */}
      {showFlexible && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <p className="text-sm text-muted-foreground">Selecione o que lembrar:</p>

          <div className="grid grid-cols-2 gap-2">
            <Button
              variant={flexMode === 'month_year' ? 'default' : 'outline'}
              className="h-12"
              onClick={() => setFlexMode('month_year')}
            >
              Mês e Ano
            </Button>
            <Button
              variant={flexMode === 'year' ? 'default' : 'outline'}
              className="h-12"
              onClick={() => setFlexMode('year')}
            >
              Apenas Ano
            </Button>
          </div>

          {/* Month + Year selects */}
          {flexMode === 'month_year' && (
            <div className="flex gap-3 animate-in fade-in duration-200">
              <Select value={flexMonth} onValueChange={setFlexMonth}>
                <SelectTrigger className="h-14 text-base flex-1"><SelectValue placeholder="Mês" /></SelectTrigger>
                <SelectContent>
                  {months.map((label, i) => (
                    <SelectItem key={i} value={String(i + 1).padStart(2, '0')}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={flexYear} onValueChange={setFlexYear}>
                <SelectTrigger className="h-14 text-base w-28"><SelectValue placeholder="Ano" /></SelectTrigger>
                <SelectContent>
                  {years.map(y => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Year only select */}
          {flexMode === 'year' && (
            <div className="animate-in fade-in duration-200">
              <Select value={flexYearOnly} onValueChange={setFlexYearOnly}>
                <SelectTrigger className="h-14 text-lg"><SelectValue placeholder="Selecione o ano" /></SelectTrigger>
                <SelectContent>
                  {years.map(y => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Submit flexible */}
          {flexMode && (
            <Button size="lg" className="w-full h-14 text-lg" onClick={handleFlexSubmit}>
              {buttonLabel} <ArrowRight className="h-5 w-5 ml-2" />
            </Button>
          )}

          {/* Back to exact date */}
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-muted-foreground"
            onClick={() => { setShowFlexible(false); setFlexMode(null); }}
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar para data exata
          </Button>

          {/* "Não sei" (unknown) */}
          {allowUnknown && (
            <Button variant="ghost" size="lg" className="w-full h-12 text-muted-foreground" onClick={() => {
              onAnswer({ precision: 'unknown', value: 'Não sei' }, d.variable);
              onNext('date-unknown');
            }}>
              Não sei
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function InputWrapper({ children, onNext, placeholder, disabled }: { children: React.ReactNode; onNext: (h?: string) => void; placeholder?: string; disabled?: boolean }) {
  return (
    <div className="space-y-6">
      {children}
      <Button size="lg" className="w-full h-14 text-lg" onClick={() => onNext()} disabled={disabled}>
        OK <ArrowRight className="h-5 w-5 ml-2" />
      </Button>
    </div>
  );
}

function FullScreenCenter({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex items-center justify-center bg-background p-4">{children}</div>;
}

function FullScreenStep({ children, progress, showProgress, onPrev, dir }: {
  children: React.ReactNode; progress: number; showProgress: boolean; onPrev?: () => void; dir: string;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      {showProgress && <Progress value={progress} className="h-1 rounded-none flex-shrink-0" />}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className={cn(
          "max-w-lg w-full animate-in duration-300",
          dir === 'next' ? "fade-in slide-in-from-right-8" : "fade-in slide-in-from-left-8"
        )}>
          {onPrev && (
            <button onClick={onPrev} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
              <ArrowLeft className="h-4 w-4" /> Voltar
            </button>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

function interpolate(text: string, variables: Record<string, any>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? `{{${key}}}`);
}

function toEmbedUrl(url: string): string {
  if (!url) return '';
  const ytMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([^&?]+)/);
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1`;
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=1`;
  return url;
}
