import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ChevronLeft, HelpCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { InstagramMediaPicker } from '../InstagramMediaPicker';
import { InstagramPhonePreview, type PhonePreviewMode } from '../InstagramPhonePreview';
import { useInstagramMedia } from '@/hooks/useInstagramMedia';
import type { InstagramAccount } from '@/hooks/useInstagramAccounts';
import {
  KEYWORD_EXAMPLES,
  sectionsFor,
  validateGuided,
  type GuidedState,
  type OpeningMode,
  type PostScope,
} from './instagramTemplates';

/**
 * O formulário guiado — o segundo modo de montar automação, ao lado do
 * construtor de fluxos.
 *
 * A diferença não é de poder, é de forma: aqui a automação é uma sequência de
 * perguntas em português ("quando alguém faz um comentário…", "e esse
 * comentário possui…"), lidas de cima para baixo, com a prévia ao lado
 * mostrando o resultado a cada resposta. O fluxo continua sendo o caminho de
 * quem precisa ramificar.
 *
 * A prévia troca de tela sozinha conforme a seção que está sendo editada: quem
 * mexe no escopo quer ver a publicação, quem mexe no texto quer ver a conversa.
 * Um seletor manual existiria só porque foi mais fácil de programar.
 */

interface InstagramGuidedEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: GuidedState;
  onChange: (state: GuidedState) => void;
  accounts: InstagramAccount[];
  templateTitle: string;
  saving: boolean;
  onSave: () => void;
}

/** Um bloco de pergunta, com o título no tom da tela do ManyChat. */
function Section({
  title,
  children,
  onFocusCapture,
}: {
  title: string;
  children: React.ReactNode;
  onFocusCapture?: () => void;
}) {
  return (
    <section
      className="space-y-3"
      onFocusCapture={onFocusCapture}
      onMouseDown={onFocusCapture}
    >
      <h3 className="text-lg font-semibold leading-snug">{title}</h3>
      {children}
    </section>
  );
}

/**
 * Opção de rádio no formato de cartão.
 *
 * O conteúdo dependente (grade de posts, campo de palavras) fica DENTRO da
 * opção que o habilita, e não abaixo do grupo: assim a relação entre a escolha
 * e o que ela pede é visual, não uma inferência de quem lê.
 */
function RadioCard({
  value,
  checked,
  label,
  hint,
  children,
  onSelect,
}: {
  value: string;
  checked: boolean;
  label: React.ReactNode;
  hint?: string;
  children?: React.ReactNode;
  onSelect: () => void;
}) {
  return (
    <div
      // O cartão inteiro seleciona, não só o círculo: mirar num alvo de 16px é
      // a diferença entre a tela parecer travada e parecer responsiva. Só
      // quando ainda não está escolhido — senão cada clique num campo de dentro
      // reescreveria o estado sem motivo.
      onClick={() => { if (!checked) onSelect(); }}
      className={cn(
        'rounded-lg border p-3 transition',
        checked ? 'border-primary/50 bg-primary/[0.03]' : 'cursor-pointer hover:border-muted-foreground/30',
      )}
    >
      <div className="flex items-start gap-2.5">
        <RadioGroupItem value={value} id={`opt-${value}`} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <Label
            htmlFor={`opt-${value}`}
            className="cursor-pointer text-sm font-normal leading-snug"
          >
            {label}
          </Label>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
          {checked && children && <div className="mt-3">{children}</div>}
        </div>
      </div>
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="Ajuda">
            <HelpCircle className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs leading-relaxed">{children}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

const TRIGGER_TITLES: Record<string, { when: string; contains: string }> = {
  comment_keyword: {
    when: 'Quando alguém faz um comentário',
    contains: 'E esse comentário possui',
  },
  dm_keyword: {
    when: 'Quando alguém manda uma mensagem no direct',
    contains: 'E essa mensagem possui',
  },
  story_reply: {
    when: 'Quando alguém responde um story seu',
    contains: 'E essa resposta possui',
  },
  story_mention: {
    when: 'Quando alguém menciona seu perfil num story',
    contains: '',
  },
  first_message: {
    when: 'Quando um contato novo escreve pela primeira vez',
    contains: '',
  },
};

export function InstagramGuidedEditor({
  open,
  onOpenChange,
  state,
  onChange,
  accounts,
  templateTitle,
  saving,
  onSave,
}: InstagramGuidedEditorProps) {
  const [previewMode, setPreviewMode] = useState<PhonePreviewMode>('post');
  const sections = sectionsFor(state.triggerType);
  const titles = TRIGGER_TITLES[state.triggerType] || TRIGGER_TITLES.comment_keyword;

  const set = (patch: Partial<GuidedState>) => onChange({ ...state, ...patch });

  const account = accounts.find((a) => a.id === state.instagramAccountId);
  const { data: media = [] } = useInstagramMedia(state.instagramAccountId);
  const selectedMedia = useMemo(
    () => media.find((m) => m.id === state.mediaIds[0]) || null,
    [media, state.mediaIds],
  );

  // Gatilho sem publicação nunca tem o que mostrar na tela do post; abrir na
  // conversa evita um primeiro quadro vazio.
  const effectiveMode: PhonePreviewMode = sections.postScope ? previewMode : 'dm';

  const appendKeyword = (word: string) => {
    const current = state.keywords.split(',').map((k) => k.trim()).filter(Boolean);
    if (current.some((k) => k.toLowerCase() === word.toLowerCase())) return;
    set({ keywords: [...current, word].join(', ') });
  };

  const error = validateGuided(state);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[92vh] max-w-6xl flex-col gap-0 overflow-hidden p-0"
        // O título fica na barra própria abaixo, junto do botão de ativar —
        // como no ManyChat, onde a ação principal acompanha o nome.
      >
        <div className="flex items-center gap-3 border-b px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} aria-label="Voltar">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <Input
              value={state.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="Nome da automação"
              className="h-8 border-none px-0 text-base font-semibold shadow-none focus-visible:ring-0"
            />
            <p className="truncate text-xs text-muted-foreground">{templateTitle}</p>
          </div>
          <Button onClick={onSave} disabled={saving || !!error} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {state.id ? 'Salvar' : 'Ativar'}
          </Button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {/* ── Perguntas ─────────────────────────────────────────────── */}
          <div className="min-h-0 space-y-7 overflow-y-auto border-r p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              {accounts.length > 1 && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Conta do Instagram</Label>
                  <Select
                    value={state.instagramAccountId}
                    onValueChange={(v) => set({ instagramAccountId: v, mediaIds: [] })}
                  >
                    <SelectTrigger className="h-9"><SelectValue placeholder="Selecione a conta" /></SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>@{a.ig_username || a.id}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Trocar o gatilho reaproveita os textos já escritos — quem montou
                  para comentário e decidiu usar em story não recomeça do zero.
                  As seções que deixam de fazer sentido somem sozinhas. */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">O que dispara</Label>
                <Select
                  value={state.triggerType}
                  onValueChange={(v: GuidedState['triggerType']) => set({
                    triggerType: v,
                    // Escopo por post e palavra-chave não existem fora do
                    // comentário; carregá-los adiante gravaria configuração morta.
                    postScope: v === 'comment_keyword' ? state.postScope : 'all_posts',
                    keywordMode: sectionsFor(v).keywords ? state.keywordMode : 'any',
                  })}
                >
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="comment_keyword">Comentário em publicação</SelectItem>
                    <SelectItem value="dm_keyword">Mensagem no direct</SelectItem>
                    <SelectItem value="story_reply">Resposta a story</SelectItem>
                    <SelectItem value="story_mention">Menção em story</SelectItem>
                    <SelectItem value="first_message">Primeira mensagem do contato</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 1. Onde vale */}
            {sections.postScope && (
              <Section title={titles.when} onFocusCapture={() => setPreviewMode('post')}>
                <RadioGroup
                  value={state.postScope}
                  onValueChange={(v: PostScope) => set({ postScope: v })}
                  className="space-y-2"
                >
                  <RadioCard
                    value="specific_media"
                    checked={state.postScope === 'specific_media'}
                    label="uma publicação ou Reels específico"
                    onSelect={() => set({ postScope: 'specific_media' })}
                  >
                    {state.instagramAccountId ? (
                      <InstagramMediaPicker
                        compact
                        accountId={state.instagramAccountId}
                        value={state.mediaIds}
                        onChange={(ids) => set({ mediaIds: ids })}
                      />
                    ) : (
                      <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                        Escolha a conta para ver as publicações.
                      </p>
                    )}
                  </RadioCard>

                  <RadioCard
                    value="all_posts"
                    checked={state.postScope === 'all_posts'}
                    label={
                      <span className="inline-flex items-center gap-1.5">
                        qualquer publicação ou Reel
                        <Hint>
                          Vale para o perfil inteiro, inclusive publicações antigas.
                          Bom para palavras muito específicas ("orçamento"); arriscado
                          para palavras comuns.
                        </Hint>
                      </span>
                    }
                    onSelect={() => set({ postScope: 'all_posts' })}
                  />

                  <RadioCard
                    value="next_post"
                    checked={state.postScope === 'next_post'}
                    label={
                      <span className="inline-flex items-center gap-1.5">
                        próxima publicação ou Reel
                        <Hint>
                          Deixe pronta antes de publicar: assim que o post sair, a
                          Wizzy o encontra e prende a automação nele — sem você
                          precisar voltar aqui.
                        </Hint>
                      </span>
                    }
                    onSelect={() => set({ postScope: 'next_post' })}
                  >
                    {state.boundAt ? (
                      <Badge variant="secondary" className="font-normal">
                        Já vinculada à publicação de{' '}
                        {new Date(state.boundAt).toLocaleDateString('pt-BR')}
                      </Badge>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Aguardando você publicar. A automação começa a valer alguns
                        minutos depois que o post entrar no ar.
                      </p>
                    )}
                  </RadioCard>
                </RadioGroup>
              </Section>
            )}

            {/* 2. O que o texto precisa ter */}
            {sections.keywords && (
              <Section title={titles.contains} onFocusCapture={() => setPreviewMode('post')}>
                <RadioGroup
                  value={state.keywordMode}
                  onValueChange={(v: 'specific' | 'any') => set({ keywordMode: v })}
                  className="space-y-2"
                >
                  <RadioCard
                    value="specific"
                    checked={state.keywordMode === 'specific'}
                    label="uma palavra ou expressão específica"
                    onSelect={() => set({ keywordMode: 'specific' })}
                  >
                    <div className="space-y-2">
                      <Input
                        value={state.keywords}
                        onChange={(e) => set({ keywords: e.target.value })}
                        placeholder="Digite uma ou mais palavras"
                      />
                      <p className="text-xs text-muted-foreground">
                        Use vírgulas para separar as palavras
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">Por exemplo:</span>
                        {KEYWORD_EXAMPLES.map((word) => (
                          <button
                            key={word}
                            type="button"
                            onClick={() => appendKeyword(word)}
                            className="rounded-full border px-2.5 py-1 text-xs transition hover:border-primary hover:text-primary"
                          >
                            {word}
                          </button>
                        ))}
                      </div>
                      {state.keywords.split(',').filter((k) => k.trim()).length > 1 && (
                        <Select
                          value={state.matchType}
                          onValueChange={(v: 'any' | 'all') => set({ matchType: v })}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="any">Basta uma das palavras aparecer</SelectItem>
                            <SelectItem value="all">Precisa conter todas as palavras</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </RadioCard>

                  <RadioCard
                    value="any"
                    checked={state.keywordMode === 'any'}
                    label="qualquer palavra"
                    hint={
                      state.triggerType === 'comment_keyword'
                        ? 'Todo comentário dispara — inclusive críticas e spam. Combine com uma publicação específica.'
                        : undefined
                    }
                    onSelect={() => set({ keywordMode: 'any' })}
                  />
                </RadioGroup>

                {sections.commentActions && (
                  <div className="space-y-2 rounded-lg border p-3">
                    <div className="flex items-start gap-2.5">
                      <Checkbox
                        id="interact"
                        checked={state.interactWithComment}
                        onCheckedChange={(c) => set({ interactWithComment: !!c })}
                        className="mt-0.5"
                      />
                      <Label htmlFor="interact" className="cursor-pointer text-sm font-normal leading-snug">
                        interagir com os comentários deles na publicação
                      </Label>
                    </div>
                    {state.interactWithComment && (
                      <div className="pl-6">
                        <Textarea
                          value={state.publicReplyText}
                          onChange={(e) => set({ publicReplyText: e.target.value })}
                          rows={2}
                          placeholder="Resposta pública ao comentário"
                        />
                        <p className="mt-1 text-xs text-muted-foreground">
                          A Wizzy curte o comentário e responde publicamente. Deixe o
                          texto vazio para apenas curtir.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </Section>
            )}

            {/* 3. Primeira mensagem */}
            <Section title="Eles receberão" onFocusCapture={() => setPreviewMode('dm')}>
              <RadioGroup
                value={state.openingMode}
                onValueChange={(v: OpeningMode) => set({ openingMode: v })}
                className="space-y-2"
              >
                <RadioCard
                  value="welcome"
                  checked={state.openingMode === 'welcome'}
                  label={
                    <span className="inline-flex items-center gap-1.5">
                      uma mensagem de boas-vindas
                      <Hint>
                        A pessoa recebe a mensagem com um botão de resposta rápida.
                        Tocar nele é uma resposta de verdade — e é isso que abre a
                        janela de 24h do Instagram e libera o envio do link.
                      </Hint>
                    </span>
                  }
                  onSelect={() => set({ openingMode: 'welcome' })}
                >
                  <OpeningFields state={state} set={set} showButtonLabel />
                </RadioCard>

                <RadioCard
                  value="ask_follow"
                  checked={state.openingMode === 'ask_follow'}
                  label="uma DM solicitando que sigam seu perfil antes de receberem o link"
                  hint="O Instagram não informa quem segue a conta, então o pedido é uma cortesia: quem tocar no botão recebe o link de qualquer forma."
                  onSelect={() => set({ openingMode: 'ask_follow' })}
                >
                  <OpeningFields state={state} set={set} showButtonLabel />
                </RadioCard>

                <RadioCard
                  value="ask_email"
                  checked={state.openingMode === 'ask_email'}
                  label="uma DM solicitando o endereço de e-mail"
                  hint="A resposta é validada e salva no contato. Depois de responder, a pessoa recebe o link."
                  onSelect={() => set({ openingMode: 'ask_email' })}
                >
                  <div className="space-y-3">
                    <OpeningFields state={state} set={set} />
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">
                        Se a resposta não for um e-mail
                      </Label>
                      <Input
                        value={state.emailInvalidText}
                        onChange={(e) => set({ emailInvalidText: e.target.value })}
                        placeholder="Hmm, isso não parece um e-mail…"
                      />
                    </div>
                  </div>
                </RadioCard>
              </RadioGroup>
            </Section>

            {/* 4. Entrega */}
            <Section title="E então, eles vão receber" onFocusCapture={() => setPreviewMode('dm')}>
              <div className="space-y-2">
                <div className="rounded-lg border p-3">
                  <div className="flex items-start gap-2.5">
                    <Checkbox
                      id="link"
                      checked={state.linkEnabled}
                      onCheckedChange={(c) => set({ linkEnabled: !!c })}
                      className="mt-0.5"
                    />
                    <Label htmlFor="link" className="cursor-pointer text-sm font-normal leading-snug">
                      uma DM contendo um link
                    </Label>
                  </div>
                  {state.linkEnabled && (
                    <div className="mt-3 space-y-3 pl-6">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Escreva uma mensagem</Label>
                        <Textarea
                          value={state.linkMessage}
                          onChange={(e) => set({ linkMessage: e.target.value })}
                          rows={2}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Adicionar um link</Label>
                        <div className="grid grid-cols-[1fr_1.4fr] gap-2">
                          <Input
                            value={state.linkLabel}
                            onChange={(e) => set({ linkLabel: e.target.value })}
                            placeholder="Texto do botão"
                          />
                          <Input
                            value={state.linkUrl}
                            onChange={(e) => set({ linkUrl: e.target.value })}
                            placeholder="https://..."
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-lg border p-3">
                  <div className="flex items-start gap-2.5">
                    <Checkbox
                      id="reminder"
                      checked={state.reminderEnabled}
                      disabled={!state.linkEnabled}
                      onCheckedChange={(c) => set({ reminderEnabled: !!c })}
                      className="mt-0.5"
                    />
                    <Label
                      htmlFor="reminder"
                      className={cn(
                        'cursor-pointer text-sm font-normal leading-snug',
                        !state.linkEnabled && 'text-muted-foreground',
                      )}
                    >
                      uma DM de lembrete, caso o link não tenha sido acessado
                    </Label>
                  </div>
                  {!state.linkEnabled && (
                    <p className="mt-1 pl-6 text-xs text-muted-foreground">
                      Disponível quando houver um link — é o clique nele que a Wizzy
                      acompanha para saber quem precisa do lembrete.
                    </p>
                  )}
                  {state.linkEnabled && state.reminderEnabled && (
                    <div className="mt-3 space-y-2 pl-6">
                      <div className="flex items-center gap-2">
                        <span className="whitespace-nowrap text-xs text-muted-foreground">Esperar</span>
                        <Input
                          type="number"
                          min={1}
                          className="h-8 w-20"
                          value={state.reminderWaitValue}
                          onChange={(e) => set({ reminderWaitValue: e.target.value })}
                        />
                        <Select
                          value={state.reminderWaitUnit}
                          onValueChange={(v: 'minutes' | 'hours' | 'days') => set({ reminderWaitUnit: v })}
                        >
                          <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="minutes">Minutos</SelectItem>
                            <SelectItem value="hours">Horas</SelectItem>
                            <SelectItem value="days">Dias</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Textarea
                        value={state.reminderText}
                        onChange={(e) => set({ reminderText: e.target.value })}
                        rows={2}
                      />
                    </div>
                  )}
                </div>

                <div className="rounded-lg border p-3">
                  <div className="flex items-start gap-2.5">
                    <Checkbox
                      id="tag"
                      checked={state.tagEnabled}
                      onCheckedChange={(c) => set({ tagEnabled: !!c })}
                      className="mt-0.5"
                    />
                    <Label htmlFor="tag" className="cursor-pointer text-sm font-normal leading-snug">
                      uma etiqueta no contato, para encontrar essas pessoas depois
                    </Label>
                  </div>
                  {state.tagEnabled && (
                    <Input
                      value={state.tagName}
                      onChange={(e) => set({ tagName: e.target.value })}
                      placeholder="lead-instagram"
                      className="mt-3 ml-6 w-[calc(100%-1.5rem)]"
                    />
                  )}
                </div>
              </div>
            </Section>

            {error && (
              <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {error}
              </p>
            )}
          </div>

          {/* ── Prévia ────────────────────────────────────────────────── */}
          <div className="min-h-0 overflow-y-auto bg-muted/30 p-5">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Visualização</span>
              {sections.postScope && (
                <div className="flex rounded-md border bg-background p-0.5 text-xs">
                  {(['post', 'dm'] as PhonePreviewMode[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPreviewMode(m)}
                      className={cn(
                        'rounded px-2.5 py-1 transition',
                        effectiveMode === m ? 'bg-muted font-medium' : 'text-muted-foreground',
                      )}
                    >
                      {m === 'post' ? 'Publicação' : 'Conversa'}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <InstagramPhonePreview
              mode={effectiveMode}
              guided={state}
              accountUsername={account?.ig_username}
              accountAvatarUrl={account?.ig_profile_pic_url}
              media={selectedMedia}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Texto da primeira DM (+ rótulo do botão, quando ela leva um). */
function OpeningFields({
  state,
  set,
  showButtonLabel,
}: {
  state: GuidedState;
  set: (patch: Partial<GuidedState>) => void;
  showButtonLabel?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Textarea
        value={state.openingText}
        onChange={(e) => set({ openingText: e.target.value })}
        rows={5}
        placeholder="Escreva a mensagem que abre a conversa"
      />
      {showButtonLabel && state.linkEnabled && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Texto do botão de resposta</Label>
          <Input
            value={state.openingButtonLabel}
            onChange={(e) => set({ openingButtonLabel: e.target.value })}
            maxLength={20}
            placeholder="Me envie o link"
          />
        </div>
      )}
    </div>
  );
}
