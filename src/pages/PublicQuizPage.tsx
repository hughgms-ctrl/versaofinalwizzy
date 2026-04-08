import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Star, ArrowRight, ArrowLeft, Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface QuizData {
  id: string;
  name: string;
  organization_id: string;
  theme: any;
  settings: any;
  welcome_screen: any;
  end_screen: any;
}

interface QuestionData {
  id: string;
  type: string;
  title: string;
  description: string | null;
  required: boolean;
  position: number;
  options: any[];
  settings: any;
}

export default function PublicQuizPage() {
  const { token } = useParams<{ token: string }>();
  const [quiz, setQuiz] = useState<QuizData | null>(null);
  const [questions, setQuestions] = useState<QuestionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(-1); // -1 = welcome
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [contact, setContact] = useState({ name: '', phone: '', email: '' });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [animDir, setAnimDir] = useState<'next' | 'prev'>('next');

  useEffect(() => {
    if (token) loadQuiz();
  }, [token]);

  const loadQuiz = async () => {
    try {
      const { data: q, error: e1 } = await supabase
        .from('quizzes').select('*').eq('public_token', token).eq('is_active', true).single();
      if (e1 || !q) throw new Error('Quiz não encontrado');
      const { data: qs } = await supabase
        .from('quiz_questions').select('*').eq('quiz_id', q.id).order('position', { ascending: true });
      setQuiz(q as any);
      setQuestions((qs || []) as any);
      if ((q as any).welcome_screen?.showWelcome === false) setStep(0);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const showContact = quiz?.settings?.requirePhone || quiz?.settings?.requireName || quiz?.settings?.requireEmail;
  const contactStepIdx = questions.length;
  const totalSteps = questions.length + (showContact ? 1 : 0);
  const progress = step < 0 ? 0 : Math.min(((step + 1) / totalSteps) * 100, 100);

  const goNext = useCallback(() => {
    setAnimDir('next');
    if (step < 0) { setStep(0); return; }

    // Handle content blocks that auto-advance
    const currentQ = questions[step];
    if (currentQ?.type === 'redirect' && currentQ.settings?.url) {
      setTimeout(() => window.open(currentQ.settings.url, '_self'), (currentQ.settings.delay || 3) * 1000);
    }

    if (step < questions.length - 1) { setStep(s => s + 1); return; }
    if (showContact && step === questions.length - 1) { setStep(contactStepIdx); return; }
    handleSubmit();
  }, [step, questions, showContact, contactStepIdx]);

  const goPrev = useCallback(() => {
    setAnimDir('prev');
    setStep(s => Math.max(-1, s - 1));
  }, []);

  const handleSubmit = async () => {
    if (!quiz) return;
    setSubmitting(true);
    try {
      const answersArray = questions
        .filter(q => !['statement', 'video', 'image', 'redirect'].includes(q.type))
        .map(q => ({
          question_id: q.id,
          question_title: q.title,
          type: q.type,
          answer: answers[q.id],
        }));

      await supabase.from('quiz_submissions').insert({
        quiz_id: quiz.id,
        organization_id: quiz.organization_id,
        respondent_name: contact.name || null,
        respondent_phone: contact.phone || null,
        respondent_email: contact.email || null,
        answers: answersArray,
        completed_at: new Date().toISOString(),
      });
      setSubmitted(true);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  // Auto-advance for content blocks (statement with button, video with button)
  const handleButtonClick = (optionUrl?: string) => {
    if (optionUrl) {
      window.open(optionUrl, '_blank');
      return;
    }
    goNext();
  };

  if (loading) return <FullScreenCenter><Loader2 className="h-8 w-8 animate-spin text-primary" /></FullScreenCenter>;
  if (error || !quiz) return (
    <FullScreenCenter>
      <h2 className="text-xl font-bold">Quiz não encontrado</h2>
      <p className="text-muted-foreground mt-2">Este quiz não existe ou não está ativo.</p>
    </FullScreenCenter>
  );

  // End screen
  if (submitted) {
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
  if (step < 0) {
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
          <Button size="lg" className="text-lg px-8 h-14" onClick={goNext}>
            {ws.buttonText || 'Começar'}
            <ArrowRight className="h-5 w-5 ml-2" />
          </Button>
        </div>
      </FullScreenCenter>
    );
  }

  // Contact step
  if (showContact && step === contactStepIdx) {
    return (
      <FullScreenStep progress={progress} showProgress={quiz.settings?.showProgressBar !== false} onPrev={goPrev} dir={animDir}>
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
            {submitting ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : null}
            {submitting ? 'Enviando...' : 'Enviar respostas'}
          </Button>
        </div>
      </FullScreenStep>
    );
  }

  // Question step
  const q = questions[step];
  if (!q) return null;
  const isContent = ['statement', 'video', 'image', 'redirect'].includes(q.type);

  return (
    <FullScreenStep
      progress={progress}
      showProgress={quiz.settings?.showProgressBar !== false}
      onPrev={step > 0 ? goPrev : undefined}
      dir={animDir}
    >
      {/* Video block */}
      {q.type === 'video' && q.settings?.url && (
        <div className="rounded-2xl overflow-hidden mb-6">
          <iframe src={toEmbedUrl(q.settings.url)} className="w-full aspect-video" allowFullScreen />
        </div>
      )}

      {/* Image block */}
      {q.type === 'image' && q.settings?.url && (
        <div className="rounded-2xl overflow-hidden mb-6">
          <img src={q.settings.url} alt={q.settings.alt || ''} className="w-full h-auto max-h-80 object-contain" />
        </div>
      )}

      {/* Title */}
      {q.title && (
        <div className="mb-6">
          {!isContent && <p className="text-xs text-muted-foreground mb-1">{step + 1} de {questions.length}</p>}
          <h2 className={cn("font-bold", isContent ? "text-2xl" : "text-xl")}>{q.title}</h2>
          {q.description && <p className="text-muted-foreground mt-1">{q.description}</p>}
        </div>
      )}

      {/* Statement / Video / Image with continue button */}
      {(q.type === 'statement' || q.type === 'video' || q.type === 'image') && (
        <Button size="lg" className="w-full h-14 text-lg" onClick={goNext}>
          {q.settings?.buttonText || 'Continuar'}
          <ArrowRight className="h-5 w-5 ml-2" />
        </Button>
      )}

      {/* Redirect */}
      {q.type === 'redirect' && (
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Redirecionando em {q.settings?.delay || 3}s...</p>
        </div>
      )}

      {/* Button block */}
      {q.type === 'button' && (
        <div className="space-y-3">
          {(q.options || []).map((opt: any, i: number) => (
            <Button
              key={i}
              variant="outline"
              className="w-full h-14 text-lg justify-start"
              onClick={() => {
                setAnswers(p => ({ ...p, [q.id]: opt.label }));
                if (opt.url) { window.open(opt.url, '_blank'); }
                else goNext();
              }}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      )}

      {/* Input questions */}
      {!isContent && q.type !== 'button' && (
        <div className="space-y-6">
          <QuestionInput question={q} value={answers[q.id]} onChange={(val) => setAnswers(p => ({ ...p, [q.id]: val }))} />
          <div className="flex gap-3">
            <Button size="lg" className="flex-1 h-14 text-lg" onClick={goNext}>
              {step === questions.length - 1 && !showContact ? 'Enviar' : 'OK'}
              <ArrowRight className="h-5 w-5 ml-2" />
            </Button>
          </div>
        </div>
      )}
    </FullScreenStep>
  );
}

// ---- Shared Components ----

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
              <ArrowLeft className="h-4 w-4" />Voltar
            </button>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

function QuestionInput({ question, value, onChange }: { question: QuestionData; value: any; onChange: (val: any) => void }) {
  switch (question.type) {
    case 'short_text':
    case 'phone':
    case 'email':
      return <Input value={value || ''} onChange={e => onChange(e.target.value)} placeholder="Digite sua resposta..." type={question.type === 'email' ? 'email' : 'text'} className="h-14 text-lg" />;
    case 'long_text':
      return <Textarea value={value || ''} onChange={e => onChange(e.target.value)} placeholder="Digite sua resposta..." rows={4} className="text-lg" />;
    case 'number':
      return <Input value={value || ''} onChange={e => onChange(e.target.value)} type="number" placeholder="0" className="h-14 text-lg" />;
    case 'date':
      return <Input value={value || ''} onChange={e => onChange(e.target.value)} type="date" className="h-14 text-lg" />;
    case 'single_choice':
    case 'dropdown':
      return (
        <RadioGroup value={value || ''} onValueChange={onChange} className="space-y-2">
          {(question.options || []).map((opt: any, i: number) => (
            <label key={i} className="flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer hover:bg-accent hover:border-primary/40 transition-all">
              <RadioGroupItem value={opt.value || opt.label} />
              <span className="text-base">{opt.label}</span>
            </label>
          ))}
        </RadioGroup>
      );
    case 'multiple_choice':
    case 'image_choice': {
      const sel = (value as string[]) || [];
      return (
        <div className="space-y-2">
          {(question.options || []).map((opt: any, i: number) => {
            const v = opt.value || opt.label;
            return (
              <label key={i} className={cn(
                "flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all",
                sel.includes(v) ? "border-primary bg-primary/5" : "hover:bg-accent hover:border-primary/40"
              )}>
                <Checkbox checked={sel.includes(v)} onCheckedChange={c => onChange(c ? [...sel, v] : sel.filter((x: string) => x !== v))} />
                <span className="text-base">{opt.label}</span>
              </label>
            );
          })}
        </div>
      );
    }
    case 'yes_no':
      return (
        <div className="grid grid-cols-2 gap-3">
          {['Sim', 'Não'].map(opt => (
            <Button key={opt} variant={value === opt ? 'default' : 'outline'} className="h-16 text-lg" onClick={() => onChange(opt)}>
              {opt}
            </Button>
          ))}
        </div>
      );
    case 'rating': {
      const max = question.settings?.maxRating || 5;
      return (
        <div className="flex gap-3 justify-center py-4">
          {Array.from({ length: max }, (_, i) => (
            <button key={i} onClick={() => onChange(i + 1)} className="transition-transform hover:scale-125 active:scale-95">
              <Star className={cn("h-10 w-10", (value || 0) > i ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground/30")} />
            </button>
          ))}
        </div>
      );
    }
    default:
      return <Input value={value || ''} onChange={e => onChange(e.target.value)} placeholder="Digite sua resposta..." className="h-14 text-lg" />;
  }
}

function toEmbedUrl(url: string): string {
  if (!url) return '';
  const ytMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([^&?]+)/);
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1`;
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=1`;
  return url;
}
