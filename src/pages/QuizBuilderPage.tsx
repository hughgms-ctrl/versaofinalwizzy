import { useState, useCallback } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Plus, Trash2, GripVertical, ArrowLeft, Save, Eye, Copy, ExternalLink,
  Type, AlignLeft, ListChecks, CircleDot, Star, Hash, Phone, Mail, Image,
  Calendar, ToggleLeft, ChevronDown, Settings2, Palette, Play
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuizzes, useQuizQuestions, type QuizQuestion } from '@/hooks/useQuizzes';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const QUESTION_TYPES = [
  { value: 'short_text', label: 'Texto curto', icon: Type },
  { value: 'long_text', label: 'Texto longo', icon: AlignLeft },
  { value: 'multiple_choice', label: 'Múltipla escolha', icon: ListChecks },
  { value: 'single_choice', label: 'Escolha única', icon: CircleDot },
  { value: 'rating', label: 'Avaliação', icon: Star },
  { value: 'number', label: 'Número', icon: Hash },
  { value: 'phone', label: 'Telefone', icon: Phone },
  { value: 'email', label: 'E-mail', icon: Mail },
  { value: 'date', label: 'Data', icon: Calendar },
  { value: 'yes_no', label: 'Sim / Não', icon: ToggleLeft },
  { value: 'image_choice', label: 'Escolha com imagem', icon: Image },
  { value: 'dropdown', label: 'Dropdown', icon: ChevronDown },
];

interface QuizBuilderProps {
  quizId: string;
}

export default function QuizBuilderPage() {
  const [searchParams] = useSearchParams();
  const quizId = searchParams.get('id');
  const navigate = useNavigate();

  if (!quizId) {
    navigate('/tools/quiz');
    return null;
  }

  return (
    <MainLayout>
      <QuizBuilder quizId={quizId} />
    </MainLayout>
  );
}

function QuizBuilder({ quizId }: QuizBuilderProps) {
  const navigate = useNavigate();
  const { data: quizzes, updateQuiz } = useQuizzes();
  const { data: questions, addQuestion, updateQuestion, deleteQuestion, reorderQuestions } = useQuizQuestions(quizId);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('build');

  const quiz = quizzes?.find(q => q.id === quizId);
  const selectedQuestion = questions?.find(q => q.id === selectedQuestionId);

  const handleAddQuestion = useCallback(async (type: string) => {
    const position = questions?.length ?? 0;
    const typeLabel = QUESTION_TYPES.find(t => t.value === type)?.label || type;
    const result = await addQuestion.mutateAsync({
      quiz_id: quizId,
      type,
      title: `${typeLabel}`,
      position,
      options: ['multiple_choice', 'single_choice', 'image_choice', 'dropdown'].includes(type)
        ? [{ label: 'Opção 1', value: 'option_1' }, { label: 'Opção 2', value: 'option_2' }]
        : [],
    });
    setSelectedQuestionId(result.id);
  }, [quizId, questions, addQuestion]);

  const handleSave = async () => {
    toast.success('Quiz salvo com sucesso!');
  };

  const handleToggleActive = async () => {
    if (!quiz) return;
    await updateQuiz.mutateAsync({ id: quizId, is_active: !quiz.is_active });
    toast.success(quiz.is_active ? 'Quiz desativado' : 'Quiz ativado');
  };

  const publicUrl = quiz?.public_token
    ? `${window.location.origin}/quiz/${quiz.public_token}`
    : '';

  const copyLink = () => {
    navigator.clipboard.writeText(publicUrl);
    toast.success('Link copiado!');
  };

  if (!quiz) return <div className="p-8 text-center text-muted-foreground">Carregando...</div>;

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)]">
      {/* Top toolbar */}
      <div className="flex items-center justify-between border-b bg-background px-4 py-2">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/tools/quiz')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Input
            value={quiz.name}
            onChange={(e) => updateQuiz.mutate({ id: quizId, name: e.target.value })}
            className="text-lg font-semibold border-none shadow-none h-auto p-0 focus-visible:ring-0 max-w-xs"
          />
          <Badge variant={quiz.is_active ? 'default' : 'secondary'}>
            {quiz.is_active ? 'Ativo' : 'Rascunho'}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {publicUrl && (
            <Button variant="outline" size="sm" onClick={copyLink}>
              <Copy className="h-3.5 w-3.5 mr-1.5" />
              Copiar link
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleToggleActive}>
            <Play className="h-3.5 w-3.5 mr-1.5" />
            {quiz.is_active ? 'Desativar' : 'Ativar'}
          </Button>
          <Button size="sm" onClick={handleSave}>
            <Save className="h-3.5 w-3.5 mr-1.5" />
            Salvar
          </Button>
        </div>
      </div>

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar - question types */}
        <div className="w-56 border-r bg-muted/30 flex flex-col">
          <div className="p-3 border-b">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Blocos</p>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {QUESTION_TYPES.map((type) => (
                <button
                  key={type.value}
                  onClick={() => handleAddQuestion(type.value)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg hover:bg-accent transition-colors text-left"
                >
                  <type.icon className="h-4 w-4 text-muted-foreground" />
                  <span>{type.label}</span>
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Center - canvas */}
        <div className="flex-1 overflow-auto bg-muted/20 p-6">
          <div className="max-w-2xl mx-auto space-y-3">
            {/* Welcome screen card */}
            <Card
              className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => setSelectedQuestionId('welcome')}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                    <Play className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Tela de boas-vindas</p>
                    <p className="text-xs text-muted-foreground">{(quiz.welcome_screen as any)?.title || 'Bem-vindo!'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Questions */}
            {questions?.map((question, index) => {
              const typeInfo = QUESTION_TYPES.find(t => t.value === question.type);
              const Icon = typeInfo?.icon || Type;
              return (
                <Card
                  key={question.id}
                  className={cn(
                    "cursor-pointer transition-all",
                    selectedQuestionId === question.id
                      ? "border-primary ring-1 ring-primary/20"
                      : "hover:border-primary/50"
                  )}
                  onClick={() => setSelectedQuestionId(question.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex items-center gap-1 pt-0.5">
                        <GripVertical className="h-4 w-4 text-muted-foreground/50 cursor-grab" />
                        <span className="text-xs font-medium text-muted-foreground w-5">{index + 1}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Icon className="h-4 w-4 text-primary" />
                          <span className="text-xs text-muted-foreground">{typeInfo?.label}</span>
                          {question.required && <Badge variant="outline" className="text-[10px] h-4">Obrigatório</Badge>}
                        </div>
                        <p className="font-medium text-sm truncate">{question.title || 'Sem título'}</p>
                        {question.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{question.description}</p>
                        )}
                        {['multiple_choice', 'single_choice', 'dropdown', 'image_choice'].includes(question.type) && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {(question.options as any[])?.slice(0, 4).map((opt: any, i: number) => (
                              <Badge key={i} variant="secondary" className="text-xs">{opt.label}</Badge>
                            ))}
                            {(question.options as any[])?.length > 4 && (
                              <Badge variant="secondary" className="text-xs">+{(question.options as any[]).length - 4}</Badge>
                            )}
                          </div>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 opacity-0 group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteQuestion.mutate(question.id);
                          if (selectedQuestionId === question.id) setSelectedQuestionId(null);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {/* End screen card */}
            <Card
              className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => setSelectedQuestionId('end')}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                    <Star className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Tela de finalização</p>
                    <p className="text-xs text-muted-foreground">{(quiz.end_screen as any)?.title || 'Obrigado!'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Add question button */}
            <Button
              variant="outline"
              className="w-full border-dashed"
              onClick={() => handleAddQuestion('short_text')}
            >
              <Plus className="h-4 w-4 mr-2" />
              Adicionar bloco
            </Button>
          </div>
        </div>

        {/* Right panel - properties */}
        <div className="w-80 border-l bg-background flex flex-col">
          <ScrollArea className="flex-1">
            {selectedQuestionId === 'welcome' ? (
              <WelcomeEditor quiz={quiz} onUpdate={(data) => updateQuiz.mutate({ id: quizId, welcome_screen: data })} />
            ) : selectedQuestionId === 'end' ? (
              <EndEditor quiz={quiz} onUpdate={(data) => updateQuiz.mutate({ id: quizId, end_screen: data })} />
            ) : selectedQuestion ? (
              <QuestionEditor
                question={selectedQuestion}
                onUpdate={(data) => updateQuestion.mutate({ id: selectedQuestion.id, ...data })}
                onDelete={() => {
                  deleteQuestion.mutate(selectedQuestion.id);
                  setSelectedQuestionId(null);
                }}
              />
            ) : (
              <QuizSettingsEditor quiz={quiz} onUpdate={(data) => updateQuiz.mutate({ id: quizId, ...data })} />
            )}
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}

function WelcomeEditor({ quiz, onUpdate }: { quiz: any; onUpdate: (data: any) => void }) {
  const screen = quiz.welcome_screen || {};
  return (
    <div className="p-4 space-y-4">
      <h3 className="font-semibold text-sm">Tela de boas-vindas</h3>
      <div className="space-y-3">
        <div>
          <Label className="text-xs">Título</Label>
          <Input value={screen.title || ''} onChange={(e) => onUpdate({ ...screen, title: e.target.value })} />
        </div>
        <div>
          <Label className="text-xs">Descrição</Label>
          <Textarea value={screen.description || ''} onChange={(e) => onUpdate({ ...screen, description: e.target.value })} />
        </div>
        <div>
          <Label className="text-xs">Texto do botão</Label>
          <Input value={screen.buttonText || 'Começar'} onChange={(e) => onUpdate({ ...screen, buttonText: e.target.value })} />
        </div>
        <div className="flex items-center justify-between">
          <Label className="text-xs">Mostrar tela</Label>
          <Switch checked={screen.showWelcome !== false} onCheckedChange={(v) => onUpdate({ ...screen, showWelcome: v })} />
        </div>
      </div>
    </div>
  );
}

function EndEditor({ quiz, onUpdate }: { quiz: any; onUpdate: (data: any) => void }) {
  const screen = quiz.end_screen || {};
  return (
    <div className="p-4 space-y-4">
      <h3 className="font-semibold text-sm">Tela de finalização</h3>
      <div className="space-y-3">
        <div>
          <Label className="text-xs">Título</Label>
          <Input value={screen.title || ''} onChange={(e) => onUpdate({ ...screen, title: e.target.value })} />
        </div>
        <div>
          <Label className="text-xs">Descrição</Label>
          <Textarea value={screen.description || ''} onChange={(e) => onUpdate({ ...screen, description: e.target.value })} />
        </div>
        <div>
          <Label className="text-xs">Texto do botão</Label>
          <Input value={screen.buttonText || 'Finalizar'} onChange={(e) => onUpdate({ ...screen, buttonText: e.target.value })} />
        </div>
        <div className="flex items-center justify-between">
          <Label className="text-xs">Mostrar tela</Label>
          <Switch checked={screen.showEndScreen !== false} onCheckedChange={(v) => onUpdate({ ...screen, showEndScreen: v })} />
        </div>
      </div>
    </div>
  );
}

function QuestionEditor({ question, onUpdate, onDelete }: { question: QuizQuestion; onUpdate: (data: Partial<QuizQuestion>) => void; onDelete: () => void }) {
  const typeInfo = QUESTION_TYPES.find(t => t.value === question.type);
  const hasOptions = ['multiple_choice', 'single_choice', 'image_choice', 'dropdown'].includes(question.type);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">{typeInfo?.label}</h3>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="space-y-3">
        <div>
          <Label className="text-xs">Pergunta</Label>
          <Input value={question.title} onChange={(e) => onUpdate({ title: e.target.value })} placeholder="Digite sua pergunta..." />
        </div>
        <div>
          <Label className="text-xs">Descrição (opcional)</Label>
          <Textarea value={question.description || ''} onChange={(e) => onUpdate({ description: e.target.value })} placeholder="Adicione contexto..." rows={2} />
        </div>

        <div>
          <Label className="text-xs">Tipo</Label>
          <Select value={question.type} onValueChange={(v) => onUpdate({ type: v })}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {QUESTION_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  <div className="flex items-center gap-2">
                    <t.icon className="h-3.5 w-3.5" />
                    {t.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between">
          <Label className="text-xs">Obrigatório</Label>
          <Switch checked={question.required} onCheckedChange={(v) => onUpdate({ required: v })} />
        </div>

        {hasOptions && (
          <>
            <Separator />
            <div>
              <Label className="text-xs mb-2 block">Opções</Label>
              <div className="space-y-2">
                {(question.options as any[])?.map((opt: any, i: number) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={opt.label}
                      onChange={(e) => {
                        const newOptions = [...(question.options as any[])];
                        newOptions[i] = { ...opt, label: e.target.value, value: e.target.value.toLowerCase().replace(/\s+/g, '_') };
                        onUpdate({ options: newOptions });
                      }}
                      className="h-8 text-sm"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 flex-shrink-0"
                      onClick={() => {
                        const newOptions = (question.options as any[]).filter((_, idx) => idx !== i);
                        onUpdate({ options: newOptions });
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-8 text-xs"
                  onClick={() => {
                    const count = (question.options as any[])?.length || 0;
                    onUpdate({
                      options: [...(question.options as any[] || []), { label: `Opção ${count + 1}`, value: `option_${count + 1}` }]
                    });
                  }}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Adicionar opção
                </Button>
              </div>
            </div>
          </>
        )}

        {question.type === 'rating' && (
          <>
            <Separator />
            <div>
              <Label className="text-xs">Escala máxima</Label>
              <Select
                value={String((question.settings as any)?.maxRating || 5)}
                onValueChange={(v) => onUpdate({ settings: { ...(question.settings as any), maxRating: parseInt(v) } })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[3, 5, 7, 10].map(n => (
                    <SelectItem key={n} value={String(n)}>{n} estrelas</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function QuizSettingsEditor({ quiz, onUpdate }: { quiz: any; onUpdate: (data: any) => void }) {
  const settings = quiz.settings || {};
  return (
    <div className="p-4 space-y-4">
      <h3 className="font-semibold text-sm flex items-center gap-2">
        <Settings2 className="h-4 w-4" />
        Configurações do Quiz
      </h3>
      <div className="space-y-3">
        <div>
          <Label className="text-xs">Descrição</Label>
          <Textarea
            value={quiz.description || ''}
            onChange={(e) => onUpdate({ description: e.target.value })}
            placeholder="Descrição do quiz..."
            rows={3}
          />
        </div>
        <Separator />
        <p className="text-xs font-semibold text-muted-foreground uppercase">Campos obrigatórios</p>
        <div className="flex items-center justify-between">
          <Label className="text-xs">Nome</Label>
          <Switch checked={settings.requireName !== false} onCheckedChange={(v) => onUpdate({ settings: { ...settings, requireName: v } })} />
        </div>
        <div className="flex items-center justify-between">
          <Label className="text-xs">Telefone</Label>
          <Switch checked={settings.requirePhone !== false} onCheckedChange={(v) => onUpdate({ settings: { ...settings, requirePhone: v } })} />
        </div>
        <div className="flex items-center justify-between">
          <Label className="text-xs">E-mail</Label>
          <Switch checked={settings.requireEmail === true} onCheckedChange={(v) => onUpdate({ settings: { ...settings, requireEmail: v } })} />
        </div>
        <Separator />
        <div className="flex items-center justify-between">
          <Label className="text-xs">Barra de progresso</Label>
          <Switch checked={settings.showProgressBar !== false} onCheckedChange={(v) => onUpdate({ settings: { ...settings, showProgressBar: v } })} />
        </div>
        <div className="flex items-center justify-between">
          <Label className="text-xs">Disparo automático WhatsApp</Label>
          <Switch checked={settings.autoTriggerWhatsApp !== false} onCheckedChange={(v) => onUpdate({ settings: { ...settings, autoTriggerWhatsApp: v } })} />
        </div>
      </div>
    </div>
  );
}
