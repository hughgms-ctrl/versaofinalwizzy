import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Star, ArrowRight, ArrowLeft, Check, Loader2, Upload, Send } from 'lucide-react';
import { cn } from '@/lib/utils';

// ---- Types ----
interface QuizData {
  id: string;
  name: string;
  organization_id: string;
  theme: any;
  settings: any;
  welcome_screen: any;
  end_screen: any;
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

export default function PublicQuizPage() {
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
    if (token) loadQuiz();
  }, [token]);

  const loadQuiz = async () => {
    try {
      const { data: q, error: e1 } = await supabase
        .from('quizzes').select('*').eq('public_token', token).eq('is_active', true).single();
      if (e1 || !q) throw new Error('Quiz não encontrado');
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
      // No more edges — go to contact or end
      const showContact = quiz?.settings?.requirePhone || quiz?.settings?.requireName || quiz?.settings?.requireEmail;
      if (showContact) {
        setPhase('contact');
      } else {
        handleSubmit();
      }
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

      await supabase.from('quiz_submissions').insert({
        quiz_id: quiz.id,
        organization_id: quiz.organization_id,
        respondent_name: contact.name || null,
        respondent_phone: contact.phone || null,
        respondent_email: contact.email || null,
        answers: answersArray,
        metadata: variables,
        completed_at: new Date().toISOString(),
      });
      setPhase('end');
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  // ---- Logic block handlers ----
  const handleConditionBlock = useCallback((block: FlowBlock) => {
    const { variable, operator, value } = block.data;
    const varValue = variables[variable] ?? '';
    let result = false;

    switch (operator) {
      case 'equals': result = String(varValue) === String(value); break;
      case 'not_equals': result = String(varValue) !== String(value); break;
      case 'contains': result = String(varValue).toLowerCase().includes(String(value).toLowerCase()); break;
      case 'greater_than': result = Number(varValue) > Number(value); break;
      case 'less_than': result = Number(varValue) < Number(value); break;
      case 'is_set': result = varValue !== '' && varValue !== null && varValue !== undefined; break;
      case 'is_empty': result = varValue === '' || varValue === null || varValue === undefined; break;
      default: result = false;
    }

    // Follow true/false handle
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
      if (newTab) window.open(url, '_blank');
      else window.location.href = url;
    }
  }, []);

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

  // Auto-execute logic blocks when they become current
  useEffect(() => {
    if (phase !== 'flow' || !currentBlock) return;

    const logicAutoBlocks = ['quiz-logic-condition', 'quiz-logic-ab-test', 'quiz-logic-wait', 'quiz-logic-jump', 'quiz-event-pixel'];

    if (logicAutoBlocks.includes(currentBlock.type)) {
      const timer = setTimeout(() => {
        switch (currentBlock.type) {
          case 'quiz-logic-condition': handleConditionBlock(currentBlock); break;
          case 'quiz-logic-ab-test': handleABTestBlock(currentBlock); break;
          case 'quiz-logic-redirect': handleRedirectBlock(currentBlock); break;
          case 'quiz-logic-wait': handleWaitBlock(currentBlock); break;
          case 'quiz-logic-jump': {
            // Find group by label
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
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [phase, currentBlock, currentNodeId, currentBlockIdx]);

  // Also auto-execute redirect blocks
  useEffect(() => {
    if (phase !== 'flow' || !currentBlock) return;
    if (currentBlock.type === 'quiz-logic-redirect') {
      handleRedirectBlock(currentBlock);
    }
  }, [phase, currentBlock]);

  // ---- Rendering ----

  if (loading) return <FullScreenCenter><Loader2 className="h-8 w-8 animate-spin text-primary" /></FullScreenCenter>;
  if (error || !quiz) return (
    <FullScreenCenter>
      <h2 className="text-xl font-bold">Quiz não encontrado</h2>
      <p className="text-muted-foreground mt-2">Este quiz não existe ou não está ativo.</p>
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

  // Contact step
  if (phase === 'contact') {
    return (
      <FullScreenStep progress={progress} showProgress={quiz.settings?.showProgressBar !== false} onPrev={goBack} dir={animDir}>
        <div className="space-y-6">
          <h2 className="text-2xl font-bold">Seus dados</h2>
          <p className="text-muted-foreground">Preencha para finalizarmos.</p>
          <div className="space-y-4">
            {quiz.settings?.requireName && (
              <div><Label>Nome</Label>
                <Input value={contact.name} onChange={e => setContact(p => ({ ...p, name: e.target.value }))} placeholder="Seu nome" className="h-12 text-lg" /></div>
            )}
            {quiz.settings?.requirePhone && (
              <div><Label>Telefone (WhatsApp)</Label>
                <Input value={contact.phone} onChange={e => setContact(p => ({ ...p, phone: e.target.value }))} placeholder="(11) 99999-9999" className="h-12 text-lg" /></div>
            )}
            {quiz.settings?.requireEmail && (
              <div><Label>E-mail</Label>
                <Input value={contact.email} onChange={e => setContact(p => ({ ...p, email: e.target.value }))} placeholder="seu@email.com" type="email" className="h-12 text-lg" /></div>
            )}
          </div>
          <Button size="lg" className="w-full h-14 text-lg" onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Send className="h-5 w-5 mr-2" />}
            {submitting ? 'Enviando...' : 'Enviar respostas'}
          </Button>
        </div>
      </FullScreenStep>
    );
  }

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
      />
    </FullScreenStep>
  );
}

// ---- Block Renderer ----
function BlockRenderer({ block, answer, variables, onAnswer, onNext, isLast }: {
  block: FlowBlock;
  answer: any;
  variables: Record<string, any>;
  onAnswer: (val: any, varName?: string) => void;
  onNext: (handle?: string) => void;
  isLast: boolean;
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
    return (
      <div className="space-y-6">
        {d.url && (
          <div className="rounded-2xl overflow-hidden">
            <iframe
              src={toEmbedUrl(d.url) + (d.autoplay !== false ? '&autoplay=1' : '')}
              className="w-full aspect-video"
              allowFullScreen
              allow="autoplay; encrypted-media"
            />
          </div>
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
    return (
      <InputWrapper onNext={onNext}>
        {d.question && <h2 className="text-2xl font-bold">{interpolate(d.question, variables)}</h2>}
        <label className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-xl p-8 cursor-pointer hover:bg-accent/50 transition-colors">
          <Upload className="h-8 w-8 text-muted-foreground mb-2" />
          <span className="text-sm text-muted-foreground">{answer ? (answer as File)?.name || 'Arquivo selecionado' : 'Clique para enviar arquivo'}</span>
          {d.accept && <span className="text-xs text-muted-foreground/60 mt-1">Formatos: {d.accept}</span>}
          <input
            type="file"
            accept={d.accept || undefined}
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) onAnswer(file.name, d.variable);
            }}
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

  // Fallback for unknown blocks
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">Bloco desconhecido: {block.type}</p>
      <Button size="lg" onClick={() => onNext()}>Continuar</Button>
    </div>
  );
}

// ---- Helpers ----

function InputWrapper({ children, onNext, placeholder }: { children: React.ReactNode; onNext: (h?: string) => void; placeholder?: string }) {
  return (
    <div className="space-y-6">
      {children}
      <Button size="lg" className="w-full h-14 text-lg" onClick={() => onNext()}>
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
