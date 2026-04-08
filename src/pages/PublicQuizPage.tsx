import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import { Star, ArrowRight, ArrowLeft, Check } from 'lucide-react';
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
  const [currentStep, setCurrentStep] = useState(-1); // -1 = welcome
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [contactInfo, setContactInfo] = useState({ name: '', phone: '', email: '' });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) return;
    loadQuiz();
  }, [token]);

  const loadQuiz = async () => {
    try {
      const { data: quizData, error: qErr } = await supabase
        .from('quizzes')
        .select('*')
        .eq('public_token', token)
        .eq('is_active', true)
        .single();
      if (qErr || !quizData) throw new Error('Quiz não encontrado');

      const { data: questionsData } = await supabase
        .from('quiz_questions')
        .select('*')
        .eq('quiz_id', quizData.id)
        .order('position', { ascending: true });

      setQuiz(quizData as any);
      setQuestions((questionsData || []) as any);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const totalSteps = questions.length + (quiz?.settings?.requirePhone || quiz?.settings?.requireName ? 1 : 0);
  const showContactStep = quiz?.settings?.requirePhone || quiz?.settings?.requireName || quiz?.settings?.requireEmail;
  const contactStepIndex = questions.length;
  const progress = currentStep < 0 ? 0 : ((currentStep + 1) / (totalSteps + 1)) * 100;

  const handleSubmit = async () => {
    if (!quiz) return;
    setSubmitting(true);
    try {
      const answersArray = questions.map(q => ({
        question_id: q.id,
        question_title: q.title,
        type: q.type,
        answer: answers[q.id],
      }));

      await supabase.from('quiz_submissions').insert({
        quiz_id: quiz.id,
        organization_id: quiz.organization_id,
        respondent_name: contactInfo.name || null,
        respondent_phone: contactInfo.phone || null,
        respondent_email: contactInfo.email || null,
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

  const goNext = () => {
    if (currentStep < 0) {
      setCurrentStep(0);
    } else if (showContactStep && currentStep === contactStepIndex) {
      handleSubmit();
    } else if (!showContactStep && currentStep === questions.length - 1) {
      handleSubmit();
    } else if (showContactStep && currentStep === questions.length - 1) {
      setCurrentStep(contactStepIndex);
    } else {
      setCurrentStep(prev => prev + 1);
    }
  };

  const goPrev = () => setCurrentStep(prev => Math.max(-1, prev - 1));

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Carregando quiz...</div>
      </div>
    );
  }

  if (error || !quiz) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <h2 className="text-xl font-bold">Quiz não encontrado</h2>
          <p className="text-muted-foreground mt-2">Este quiz não existe ou não está ativo.</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    const endScreen = quiz.end_screen || {};
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mx-auto">
            <Check className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">{endScreen.title || 'Obrigado!'}</h1>
          <p className="text-muted-foreground">{endScreen.description || 'Suas respostas foram enviadas com sucesso.'}</p>
        </div>
      </div>
    );
  }

  // Welcome screen
  if (currentStep < 0) {
    const ws = quiz.welcome_screen || {};
    if (ws.showWelcome === false) {
      setCurrentStep(0);
      return null;
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="max-w-md w-full text-center space-y-6">
          <h1 className="text-3xl font-bold">{ws.title || quiz.name}</h1>
          {ws.description && <p className="text-muted-foreground">{ws.description}</p>}
          <Button size="lg" onClick={goNext}>
            {ws.buttonText || 'Começar'}
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </div>
    );
  }

  // Contact info step
  if (showContactStep && currentStep === contactStepIndex) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        {quiz.settings?.showProgressBar && <Progress value={progress} className="h-1 rounded-none" />}
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="max-w-md w-full space-y-6">
            <h2 className="text-xl font-bold">Seus dados</h2>
            <p className="text-muted-foreground text-sm">Preencha para finalizarmos o quiz.</p>
            <div className="space-y-4">
              {quiz.settings?.requireName && (
                <div>
                  <Label>Nome</Label>
                  <Input value={contactInfo.name} onChange={(e) => setContactInfo(prev => ({ ...prev, name: e.target.value }))} placeholder="Seu nome" />
                </div>
              )}
              {quiz.settings?.requirePhone && (
                <div>
                  <Label>Telefone (WhatsApp)</Label>
                  <Input value={contactInfo.phone} onChange={(e) => setContactInfo(prev => ({ ...prev, phone: e.target.value }))} placeholder="(11) 99999-9999" />
                </div>
              )}
              {quiz.settings?.requireEmail && (
                <div>
                  <Label>E-mail</Label>
                  <Input value={contactInfo.email} onChange={(e) => setContactInfo(prev => ({ ...prev, email: e.target.value }))} placeholder="seu@email.com" type="email" />
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={goPrev}><ArrowLeft className="h-4 w-4 mr-2" />Voltar</Button>
              <Button className="flex-1" onClick={goNext} disabled={submitting}>
                {submitting ? 'Enviando...' : 'Enviar respostas'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Question step
  const question = questions[currentStep];
  if (!question) return null;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {quiz.settings?.showProgressBar && <Progress value={progress} className="h-1 rounded-none" />}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="max-w-lg w-full space-y-6">
          <div>
            <p className="text-xs text-muted-foreground mb-1">{currentStep + 1} de {questions.length}</p>
            <h2 className="text-xl font-bold">{question.title}</h2>
            {question.description && <p className="text-muted-foreground text-sm mt-1">{question.description}</p>}
          </div>

          <QuestionInput
            question={question}
            value={answers[question.id]}
            onChange={(val) => setAnswers(prev => ({ ...prev, [question.id]: val }))}
          />

          <div className="flex gap-3">
            {currentStep > 0 && (
              <Button variant="outline" onClick={goPrev}>
                <ArrowLeft className="h-4 w-4 mr-2" />Voltar
              </Button>
            )}
            <Button className="flex-1" onClick={goNext}>
              {currentStep === questions.length - 1 && !showContactStep ? 'Enviar' : 'Próximo'}
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
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
      return <Input value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder="Digite sua resposta..." type={question.type === 'email' ? 'email' : 'text'} />;

    case 'long_text':
      return <Textarea value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder="Digite sua resposta..." rows={4} />;

    case 'number':
      return <Input value={value || ''} onChange={(e) => onChange(e.target.value)} type="number" placeholder="0" />;

    case 'date':
      return <Input value={value || ''} onChange={(e) => onChange(e.target.value)} type="date" />;

    case 'single_choice':
    case 'dropdown':
      return (
        <RadioGroup value={value || ''} onValueChange={onChange} className="space-y-2">
          {(question.options || []).map((opt: any, i: number) => (
            <label key={i} className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-accent transition-colors">
              <RadioGroupItem value={opt.value || opt.label} />
              <span className="text-sm">{opt.label}</span>
            </label>
          ))}
        </RadioGroup>
      );

    case 'multiple_choice':
      const selected = (value as string[]) || [];
      return (
        <div className="space-y-2">
          {(question.options || []).map((opt: any, i: number) => {
            const optValue = opt.value || opt.label;
            const isChecked = selected.includes(optValue);
            return (
              <label key={i} className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-accent transition-colors">
                <Checkbox
                  checked={isChecked}
                  onCheckedChange={(checked) => {
                    if (checked) onChange([...selected, optValue]);
                    else onChange(selected.filter((v: string) => v !== optValue));
                  }}
                />
                <span className="text-sm">{opt.label}</span>
              </label>
            );
          })}
        </div>
      );

    case 'yes_no':
      return (
        <div className="flex gap-3">
          {['Sim', 'Não'].map((opt) => (
            <Button
              key={opt}
              variant={value === opt ? 'default' : 'outline'}
              className="flex-1 h-12"
              onClick={() => onChange(opt)}
            >
              {opt}
            </Button>
          ))}
        </div>
      );

    case 'rating':
      const maxRating = question.settings?.maxRating || 5;
      return (
        <div className="flex gap-2 justify-center">
          {Array.from({ length: maxRating }, (_, i) => (
            <button
              key={i}
              onClick={() => onChange(i + 1)}
              className="transition-transform hover:scale-110"
            >
              <Star className={cn("h-8 w-8", (value || 0) > i ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground/30")} />
            </button>
          ))}
        </div>
      );

    default:
      return <Input value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder="Digite sua resposta..." />;
  }
}
