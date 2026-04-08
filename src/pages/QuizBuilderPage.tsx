import { useState, useCallback, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  Plus, Trash2, GripVertical, ArrowLeft, Save, Copy,
  Type, AlignLeft, ListChecks, CircleDot, Star, Hash, Phone, Mail, Image,
  Calendar, ToggleLeft, ChevronDown, Settings2, Play, Video, MousePointerClick,
  Link2, MessageSquare, ImageIcon, FileText, Sparkles, Eye
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuizzes, useQuizQuestions, type QuizQuestion } from '@/hooks/useQuizzes';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const BLOCK_CATEGORIES = [
  {
    label: 'Entrada',
    blocks: [
      { value: 'short_text', label: 'Texto curto', icon: Type },
      { value: 'long_text', label: 'Texto longo', icon: AlignLeft },
      { value: 'number', label: 'Número', icon: Hash },
      { value: 'phone', label: 'Telefone', icon: Phone },
      { value: 'email', label: 'E-mail', icon: Mail },
      { value: 'date', label: 'Data', icon: Calendar },
    ],
  },
  {
    label: 'Escolha',
    blocks: [
      { value: 'single_choice', label: 'Escolha única', icon: CircleDot },
      { value: 'multiple_choice', label: 'Múltipla escolha', icon: ListChecks },
      { value: 'dropdown', label: 'Dropdown', icon: ChevronDown },
      { value: 'yes_no', label: 'Sim / Não', icon: ToggleLeft },
      { value: 'rating', label: 'Avaliação', icon: Star },
      { value: 'image_choice', label: 'Escolha com imagem', icon: ImageIcon },
      { value: 'button', label: 'Botões', icon: MousePointerClick },
    ],
  },
  {
    label: 'Conteúdo',
    blocks: [
      { value: 'statement', label: 'Declaração', icon: MessageSquare },
      { value: 'video', label: 'Vídeo', icon: Video },
      { value: 'image', label: 'Imagem', icon: Image },
      { value: 'redirect', label: 'Redirecionar', icon: Link2 },
    ],
  },
];

const ALL_BLOCKS = BLOCK_CATEGORIES.flatMap(c => c.blocks);

export default function QuizBuilderPage() {
  const [searchParams] = useSearchParams();
  const quizId = searchParams.get('id');
  const navigate = useNavigate();

  useEffect(() => {
    if (!quizId) navigate('/tools/quiz');
  }, [quizId, navigate]);

  if (!quizId) return null;

  return (
    <MainLayout>
      <QuizBuilder quizId={quizId} />
    </MainLayout>
  );
}

function QuizBuilder({ quizId }: { quizId: string }) {
  const navigate = useNavigate();
  const { data: quizzes, updateQuiz } = useQuizzes();
  const { data: questions, addQuestion, updateQuestion, deleteQuestion } = useQuizQuestions(quizId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const quiz = quizzes?.find(q => q.id === quizId);
  const selectedQuestion = questions?.find(q => q.id === selectedId);

  const handleAddBlock = useCallback(async (type: string) => {
    const position = questions?.length ?? 0;
    const typeLabel = ALL_BLOCKS.find(t => t.value === type)?.label || type;
    const hasOptions = ['multiple_choice', 'single_choice', 'image_choice', 'dropdown', 'button'].includes(type);
    const result = await addQuestion.mutateAsync({
      quiz_id: quizId,
      type,
      title: type === 'statement' ? 'Sua mensagem aqui...' :
             type === 'video' ? '' :
             type === 'image' ? '' :
             type === 'redirect' ? '' :
             type === 'button' ? 'Escolha uma opção' :
             `${typeLabel}`,
      position,
      options: hasOptions
        ? [{ label: 'Opção 1', value: 'option_1' }, { label: 'Opção 2', value: 'option_2' }]
        : [],
      settings: type === 'video' ? { url: '', autoplay: true } :
                type === 'image' ? { url: '', alt: '' } :
                type === 'redirect' ? { url: '', delay: 3 } :
                type === 'button' ? { variant: 'default' } :
                {},
    });
    setSelectedId(result.id);
  }, [quizId, questions, addQuestion]);

  const handleToggleActive = async () => {
    if (!quiz) return;
    await updateQuiz.mutateAsync({ id: quizId, is_active: !quiz.is_active });
    toast.success(quiz.is_active ? 'Quiz desativado' : 'Quiz ativado');
  };

  const publicUrl = quiz?.public_token ? `${window.location.origin}/quiz/${quiz.public_token}` : '';

  if (!quiz) return <div className="p-8 text-center text-muted-foreground">Carregando...</div>;

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)]">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b bg-background px-4 py-2 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/tools/quiz')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Input
            value={quiz.name}
            onChange={(e) => updateQuiz.mutate({ id: quizId, name: e.target.value })}
            className="text-lg font-semibold border-none shadow-none h-auto p-0 focus-visible:ring-0 max-w-xs bg-transparent"
          />
          <Badge variant={quiz.is_active ? 'default' : 'secondary'}>
            {quiz.is_active ? 'Ativo' : 'Rascunho'}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
            <Eye className="h-3.5 w-3.5 mr-1.5" />
            Preview
          </Button>
          {publicUrl && (
            <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(publicUrl); toast.success('Link copiado!'); }}>
              <Copy className="h-3.5 w-3.5 mr-1.5" />
              Link
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleToggleActive}>
            <Play className="h-3.5 w-3.5 mr-1.5" />
            {quiz.is_active ? 'Desativar' : 'Ativar'}
          </Button>
        </div>
      </div>

      {/* Main */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left - Block palette */}
        <div className="w-56 border-r bg-muted/30 flex flex-col flex-shrink-0">
          <div className="p-3 border-b">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Blocos</p>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2">
              {BLOCK_CATEGORIES.map((cat) => (
                <div key={cat.label} className="mb-3">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase px-2 mb-1">{cat.label}</p>
                  <div className="space-y-0.5">
                    {cat.blocks.map((block) => (
                      <button
                        key={block.value}
                        onClick={() => handleAddBlock(block.value)}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg hover:bg-accent transition-colors text-left"
                      >
                        <block.icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span className="truncate">{block.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Center - Canvas (Typebot-style flow) */}
        <div className="flex-1 overflow-auto bg-muted/20 p-6">
          <div className="max-w-xl mx-auto space-y-2">
            {/* Welcome */}
            <FlowBlock
              selected={selectedId === 'welcome'}
              onClick={() => setSelectedId('welcome')}
              icon={<Play className="h-4 w-4 text-primary" />}
              label="Início"
              sublabel={(quiz.welcome_screen as any)?.title || 'Tela de boas-vindas'}
              color="bg-primary/10"
            />
            <FlowConnector />

            {/* Questions */}
            {questions?.map((question, index) => {
              const blockInfo = ALL_BLOCKS.find(t => t.value === question.type);
              const Icon = blockInfo?.icon || Type;
              return (
                <div key={question.id}>
                  <FlowBlock
                    selected={selectedId === question.id}
                    onClick={() => setSelectedId(question.id)}
                    icon={<Icon className="h-4 w-4 text-primary" />}
                    label={blockInfo?.label || question.type}
                    sublabel={question.title || 'Sem título'}
                    number={index + 1}
                    required={question.required}
                    onDelete={() => {
                      deleteQuestion.mutate(question.id);
                      if (selectedId === question.id) setSelectedId(null);
                    }}
                    color={
                      ['statement', 'video', 'image', 'redirect'].includes(question.type)
                        ? 'bg-blue-500/10'
                        : ['button', 'single_choice', 'multiple_choice', 'yes_no', 'rating', 'image_choice', 'dropdown'].includes(question.type)
                        ? 'bg-amber-500/10'
                        : 'bg-primary/10'
                    }
                    options={
                      ['multiple_choice', 'single_choice', 'dropdown', 'button', 'image_choice'].includes(question.type)
                        ? (question.options as any[])
                        : undefined
                    }
                    videoUrl={question.type === 'video' ? (question.settings as any)?.url : undefined}
                  />
                  <FlowConnector />
                </div>
              );
            })}

            {/* End */}
            <FlowBlock
              selected={selectedId === 'end'}
              onClick={() => setSelectedId('end')}
              icon={<Star className="h-4 w-4 text-primary" />}
              label="Fim"
              sublabel={(quiz.end_screen as any)?.title || 'Tela de finalização'}
              color="bg-primary/10"
            />

            {/* Add block */}
            <div className="pt-4">
              <Button
                variant="outline"
                className="w-full border-dashed h-12"
                onClick={() => handleAddBlock('short_text')}
              >
                <Plus className="h-4 w-4 mr-2" />
                Adicionar bloco
              </Button>
            </div>
          </div>
        </div>

        {/* Right - Properties */}
        <div className="w-80 border-l bg-background flex flex-col flex-shrink-0">
          <ScrollArea className="flex-1">
            {selectedId === 'welcome' ? (
              <WelcomeEditor quiz={quiz} onUpdate={(data) => updateQuiz.mutate({ id: quizId, welcome_screen: data })} />
            ) : selectedId === 'end' ? (
              <EndEditor quiz={quiz} onUpdate={(data) => updateQuiz.mutate({ id: quizId, end_screen: data })} />
            ) : selectedQuestion ? (
              <QuestionEditor
                question={selectedQuestion}
                onUpdate={(data) => updateQuestion.mutate({ id: selectedQuestion.id, ...data })}
                onDelete={() => {
                  deleteQuestion.mutate(selectedQuestion.id);
                  setSelectedId(null);
                }}
              />
            ) : (
              <QuizSettingsEditor quiz={quiz} onUpdate={(data) => updateQuiz.mutate({ id: quizId, ...data })} />
            )}
          </ScrollArea>
        </div>
      </div>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-sm h-[600px] p-0 overflow-hidden">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle className="text-sm">Preview do Quiz</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden">
            {previewOpen && (
              <iframe
                src={publicUrl || '#'}
                className="w-full h-full border-0"
                title="Quiz Preview"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---- Flow visual components ----

function FlowBlock({
  selected, onClick, icon, label, sublabel, number, required, onDelete, color, options, videoUrl
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  sublabel: string;
  number?: number;
  required?: boolean;
  onDelete?: () => void;
  color: string;
  options?: any[];
  videoUrl?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border-2 bg-card p-3 cursor-pointer transition-all shadow-sm hover:shadow-md",
        selected ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/40"
      )}
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        {number !== undefined && (
          <div className="flex items-center gap-1 pt-0.5">
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 cursor-grab" />
            <span className="text-[10px] font-bold text-muted-foreground/60 w-4">{number}</span>
          </div>
        )}
        <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0", color)}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase">{label}</span>
            {required && <Badge variant="outline" className="text-[9px] h-3.5 px-1">Obrigatório</Badge>}
          </div>
          <p className="text-sm font-medium truncate mt-0.5">{sublabel}</p>
          {videoUrl && (
            <div className="mt-2 rounded-lg bg-muted/50 p-2 flex items-center gap-2">
              <Video className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground truncate">{videoUrl || 'URL do vídeo não definida'}</span>
            </div>
          )}
          {options && options.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {options.slice(0, 4).map((opt: any, i: number) => (
                <Badge key={i} variant="secondary" className="text-[10px] font-normal">{opt.label}</Badge>
              ))}
              {options.length > 4 && <Badge variant="secondary" className="text-[10px]">+{options.length - 4}</Badge>}
            </div>
          )}
        </div>
        {onDelete && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 opacity-0 group-hover:opacity-100 hover:opacity-100 flex-shrink-0"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
          >
            <Trash2 className="h-3 w-3 text-destructive" />
          </Button>
        )}
      </div>
    </div>
  );
}

function FlowConnector() {
  return (
    <div className="flex justify-center py-0.5">
      <div className="w-0.5 h-6 bg-border rounded-full" />
    </div>
  );
}

// ---- Property editors ----

function WelcomeEditor({ quiz, onUpdate }: { quiz: any; onUpdate: (data: any) => void }) {
  const screen = quiz.welcome_screen || {};
  return (
    <div className="p-4 space-y-4">
      <h3 className="font-semibold text-sm flex items-center gap-2">
        <Play className="h-4 w-4 text-primary" />
        Tela de início
      </h3>
      <div className="space-y-3">
        <div><Label className="text-xs">Título</Label>
          <Input value={screen.title || ''} onChange={(e) => onUpdate({ ...screen, title: e.target.value })} /></div>
        <div><Label className="text-xs">Descrição</Label>
          <Textarea value={screen.description || ''} onChange={(e) => onUpdate({ ...screen, description: e.target.value })} rows={3} /></div>
        <div><Label className="text-xs">Texto do botão</Label>
          <Input value={screen.buttonText || 'Começar'} onChange={(e) => onUpdate({ ...screen, buttonText: e.target.value })} /></div>
        <div><Label className="text-xs">URL de imagem/vídeo (opcional)</Label>
          <Input value={screen.mediaUrl || ''} onChange={(e) => onUpdate({ ...screen, mediaUrl: e.target.value })} placeholder="https://..." /></div>
        <div className="flex items-center justify-between">
          <Label className="text-xs">Mostrar tela de início</Label>
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
      <h3 className="font-semibold text-sm flex items-center gap-2">
        <Star className="h-4 w-4 text-primary" />
        Tela de finalização
      </h3>
      <div className="space-y-3">
        <div><Label className="text-xs">Título</Label>
          <Input value={screen.title || ''} onChange={(e) => onUpdate({ ...screen, title: e.target.value })} /></div>
        <div><Label className="text-xs">Descrição</Label>
          <Textarea value={screen.description || ''} onChange={(e) => onUpdate({ ...screen, description: e.target.value })} rows={3} /></div>
        <div><Label className="text-xs">Texto do botão</Label>
          <Input value={screen.buttonText || 'Finalizar'} onChange={(e) => onUpdate({ ...screen, buttonText: e.target.value })} /></div>
        <div><Label className="text-xs">URL de redirecionamento (opcional)</Label>
          <Input value={screen.redirectUrl || ''} onChange={(e) => onUpdate({ ...screen, redirectUrl: e.target.value })} placeholder="https://..." /></div>
        <div className="flex items-center justify-between">
          <Label className="text-xs">Mostrar tela final</Label>
          <Switch checked={screen.showEndScreen !== false} onCheckedChange={(v) => onUpdate({ ...screen, showEndScreen: v })} />
        </div>
      </div>
    </div>
  );
}

function QuestionEditor({ question, onUpdate, onDelete }: { question: QuizQuestion; onUpdate: (data: Partial<QuizQuestion>) => void; onDelete: () => void }) {
  const blockInfo = ALL_BLOCKS.find(t => t.value === question.type);
  const hasOptions = ['multiple_choice', 'single_choice', 'image_choice', 'dropdown', 'button'].includes(question.type);
  const isContent = ['statement', 'video', 'image', 'redirect'].includes(question.type);
  const settings = (question.settings || {}) as Record<string, any>;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          {blockInfo && <blockInfo.icon className="h-4 w-4 text-primary" />}
          {blockInfo?.label || question.type}
        </h3>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="space-y-3">
        {/* Content blocks */}
        {question.type === 'video' && (
          <>
            <div><Label className="text-xs">URL do vídeo (YouTube, Vimeo, MP4)</Label>
              <Input value={settings.url || ''} onChange={(e) => onUpdate({ settings: { ...settings, url: e.target.value } })} placeholder="https://youtube.com/watch?v=..." /></div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Autoplay</Label>
              <Switch checked={settings.autoplay !== false} onCheckedChange={(v) => onUpdate({ settings: { ...settings, autoplay: v } })} />
            </div>
            <div><Label className="text-xs">Texto abaixo do vídeo (opcional)</Label>
              <Input value={question.title} onChange={(e) => onUpdate({ title: e.target.value })} placeholder="Assista e continue..." /></div>
            <div><Label className="text-xs">Texto do botão</Label>
              <Input value={settings.buttonText || 'Continuar'} onChange={(e) => onUpdate({ settings: { ...settings, buttonText: e.target.value } })} /></div>
          </>
        )}

        {question.type === 'image' && (
          <>
            <div><Label className="text-xs">URL da imagem</Label>
              <Input value={settings.url || ''} onChange={(e) => onUpdate({ settings: { ...settings, url: e.target.value } })} placeholder="https://..." /></div>
            <div><Label className="text-xs">Texto alternativo</Label>
              <Input value={settings.alt || ''} onChange={(e) => onUpdate({ settings: { ...settings, alt: e.target.value } })} /></div>
            <div><Label className="text-xs">Legenda (opcional)</Label>
              <Input value={question.title} onChange={(e) => onUpdate({ title: e.target.value })} /></div>
          </>
        )}

        {question.type === 'statement' && (
          <>
            <div><Label className="text-xs">Mensagem</Label>
              <Textarea value={question.title} onChange={(e) => onUpdate({ title: e.target.value })} rows={4} placeholder="Sua mensagem..." /></div>
            <div><Label className="text-xs">Texto do botão</Label>
              <Input value={settings.buttonText || 'Continuar'} onChange={(e) => onUpdate({ settings: { ...settings, buttonText: e.target.value } })} /></div>
          </>
        )}

        {question.type === 'redirect' && (
          <>
            <div><Label className="text-xs">URL de redirecionamento</Label>
              <Input value={settings.url || ''} onChange={(e) => onUpdate({ settings: { ...settings, url: e.target.value } })} placeholder="https://..." /></div>
            <div><Label className="text-xs">Mensagem (opcional)</Label>
              <Input value={question.title} onChange={(e) => onUpdate({ title: e.target.value })} placeholder="Você será redirecionado..." /></div>
            <div><Label className="text-xs">Delay (segundos)</Label>
              <Input type="number" value={settings.delay || 3} onChange={(e) => onUpdate({ settings: { ...settings, delay: parseInt(e.target.value) || 0 } })} /></div>
          </>
        )}

        {/* Input/choice blocks */}
        {!isContent && (
          <>
            <div><Label className="text-xs">Pergunta</Label>
              <Input value={question.title} onChange={(e) => onUpdate({ title: e.target.value })} placeholder="Digite sua pergunta..." /></div>
            <div><Label className="text-xs">Descrição (opcional)</Label>
              <Textarea value={question.description || ''} onChange={(e) => onUpdate({ description: e.target.value })} placeholder="Contexto..." rows={2} /></div>

            <div><Label className="text-xs">Tipo</Label>
              <Select value={question.type} onValueChange={(v) => onUpdate({ type: v })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ALL_BLOCKS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      <div className="flex items-center gap-2"><t.icon className="h-3.5 w-3.5" />{t.label}</div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-xs">Obrigatório</Label>
              <Switch checked={question.required} onCheckedChange={(v) => onUpdate({ required: v })} />
            </div>
          </>
        )}

        {/* Options editor */}
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
                    {question.type === 'button' && (
                      <Input
                        value={opt.url || ''}
                        onChange={(e) => {
                          const newOptions = [...(question.options as any[])];
                          newOptions[i] = { ...opt, url: e.target.value };
                          onUpdate({ options: newOptions });
                        }}
                        className="h-8 text-sm w-32"
                        placeholder="URL (opcional)"
                      />
                    )}
                    <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0"
                      onClick={() => onUpdate({ options: (question.options as any[]).filter((_, idx) => idx !== i) })}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" className="w-full h-8 text-xs"
                  onClick={() => {
                    const count = (question.options as any[])?.length || 0;
                    onUpdate({ options: [...(question.options as any[] || []), { label: `Opção ${count + 1}`, value: `option_${count + 1}` }] });
                  }}>
                  <Plus className="h-3 w-3 mr-1" />Adicionar opção
                </Button>
              </div>
            </div>
          </>
        )}

        {question.type === 'rating' && (
          <>
            <Separator />
            <div><Label className="text-xs">Escala máxima</Label>
              <Select value={String(settings.maxRating || 5)} onValueChange={(v) => onUpdate({ settings: { ...settings, maxRating: parseInt(v) } })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[3, 5, 7, 10].map(n => <SelectItem key={n} value={String(n)}>{n} estrelas</SelectItem>)}
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
        Configurações
      </h3>
      <div className="space-y-3">
        <div><Label className="text-xs">Descrição</Label>
          <Textarea value={quiz.description || ''} onChange={(e) => onUpdate({ description: e.target.value })} rows={3} /></div>
        <Separator />
        <p className="text-xs font-semibold text-muted-foreground uppercase">Dados do respondente</p>
        <div className="flex items-center justify-between">
          <Label className="text-xs">Pedir nome</Label>
          <Switch checked={settings.requireName !== false} onCheckedChange={(v) => onUpdate({ settings: { ...settings, requireName: v } })} />
        </div>
        <div className="flex items-center justify-between">
          <Label className="text-xs">Pedir telefone (WhatsApp)</Label>
          <Switch checked={settings.requirePhone !== false} onCheckedChange={(v) => onUpdate({ settings: { ...settings, requirePhone: v } })} />
        </div>
        <div className="flex items-center justify-between">
          <Label className="text-xs">Pedir e-mail</Label>
          <Switch checked={settings.requireEmail === true} onCheckedChange={(v) => onUpdate({ settings: { ...settings, requireEmail: v } })} />
        </div>
        <Separator />
        <p className="text-xs font-semibold text-muted-foreground uppercase">Comportamento</p>
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
