import type {
  InstagramAutomationRule,
  InstagramRuleAction,
  InstagramTriggerType,
} from '@/hooks/useInstagramAutomationRules';

/**
 * Modelos prontos e o estado do formulário guiado.
 *
 * O Wizzy Engage passa a ter os dois modos que o ManyChat tem: o construtor
 * visual (aba Fluxos) para quem precisa de ramificação, e este — um modelo
 * pronto em que a pessoa só responde perguntas. O segundo é o que faz o cliente
 * novo ter sucesso na primeira semana; o primeiro é o teto.
 *
 * Aqui ficam três coisas, juntas de propósito: o catálogo de modelos, o formato
 * do estado guiado e a tradução entre esse estado e a regra gravada no banco.
 * Elas mudam sempre pelo mesmo motivo — um campo novo na tela é um campo novo
 * na regra — e separá-las obrigaria a abrir três arquivos para cada ajuste.
 *
 * O motor não sabe que modelos existem: tudo isto vira `instagram_automation_rules`
 * comum. Um modelo é um ponto de partida, não um tipo novo de automação.
 */

export type PostScope = 'specific_media' | 'all_posts' | 'next_post';
export type KeywordMode = 'specific' | 'any';

/**
 * O que a pessoa recebe na PRIMEIRA mensagem.
 *
 * A distinção existe porque cada modo abre a janela de 24h de um jeito
 * diferente — e a janela é o que decide se o resto da automação chega:
 *
 *   welcome     — chip de resposta rápida. Tocar é mensagem de verdade: abre a
 *                 janela e o link sai em seguida.
 *   ask_follow  — igual ao welcome, com o pedido de seguir no texto. A Meta não
 *                 expõe se alguém segue a conta, então isto é uma cortesia, não
 *                 uma condição verificável (o ManyChat funciona igual).
 *   ask_email   — a DM pergunta o e-mail. A resposta é uma mensagem de verdade,
 *                 então também abre a janela — e ainda deixa o dado.
 */
export type OpeningMode = 'welcome' | 'ask_follow' | 'ask_email';

export interface GuidedState {
  id?: string;
  templateId: string;
  name: string;
  instagramAccountId: string;
  triggerType: InstagramTriggerType;

  // 1. Onde vale
  postScope: PostScope;
  mediaIds: string[];
  /** Só leitura: post que o vinculador escolheu quando o escopo é next_post. */
  boundAt?: string | null;

  // 2. O que o texto precisa ter
  keywordMode: KeywordMode;
  keywords: string;
  matchType: 'any' | 'all';
  interactWithComment: boolean;
  publicReplyText: string;

  // 3. Primeira mensagem
  openingMode: OpeningMode;
  openingText: string;
  openingButtonLabel: string;
  emailInvalidText: string;

  // 4. Entrega
  linkEnabled: boolean;
  linkMessage: string;
  linkLabel: string;
  linkUrl: string;

  reminderEnabled: boolean;
  reminderText: string;
  reminderWaitValue: string;
  reminderWaitUnit: 'minutes' | 'hours' | 'days';

  tagEnabled: boolean;
  tagName: string;
}

export interface InstagramTemplate {
  id: string;
  title: string;
  /** Frase curta da linha, no tom de "o que isto faz por mim". */
  description: string;
  /**
   * O mecanismo, em três passos.
   *
   * Substituiu o emoji que ilustrava cada modelo. Emoji decora e não informa —
   * e, repetido em sete cartões iguais, vira ruído. Os passos ocupam o mesmo
   * espaço dizendo a única coisa que a pessoa precisa saber para escolher: o
   * que dispara, o que a pessoa recebe e o que acontece depois.
   */
  steps: [string, string, string];
  /** Agrupador da lista. É taxonomia real (de onde nasce), não rótulo decorativo. */
  group: 'comment' | 'message';
  badge?: string;
  triggerType: InstagramTriggerType;
  defaults: Partial<GuidedState>;
}

/** Chips de exemplo abaixo do campo de palavras-chave, como no ManyChat. */
export const KEYWORD_EXAMPLES = ['Preço', 'Link', 'Comprar', 'Eu quero'];

const BASE: GuidedState = {
  templateId: 'blank',
  name: '',
  instagramAccountId: '',
  triggerType: 'comment_keyword',

  postScope: 'specific_media',
  mediaIds: [],
  boundAt: null,

  keywordMode: 'specific',
  keywords: '',
  matchType: 'any',
  interactWithComment: true,
  publicReplyText: 'Te chamei no direct!',

  openingMode: 'welcome',
  // Sem emoji nos textos padrão, e o calor fica por conta das palavras.
  //
  // Eles voltariam à tela pela porta dos fundos: o cartão do modelo mostra a
  // primeira linha desta mensagem, então um emoji aqui é um emoji na galeria.
  // Quem quiser continua livre para pôr o seu — o campo é de quem edita.
  openingText:
    'Oi! Que bom que você comentou.\n\nToca no botão abaixo e eu te mando o link agora mesmo.',
  openingButtonLabel: 'Me envie o link',
  emailInvalidText: 'Hmm, isso não parece um e-mail. Pode mandar de novo?',

  linkEnabled: true,
  linkMessage: 'Perfeito, aqui está o link:',
  linkLabel: 'Acessar',
  linkUrl: '',

  reminderEnabled: false,
  reminderText: 'Ainda dá tempo de conferir o que te enviei.',
  reminderWaitValue: '60',
  reminderWaitUnit: 'minutes',

  tagEnabled: false,
  tagName: '',
};

export const INSTAGRAM_TEMPLATES: InstagramTemplate[] = [
  {
    id: 'comment-to-link',
    title: 'Enviar links automaticamente por DM',
    description: 'Quem comenta uma palavra recebe o link no direct, sem você digitar nada.',
    steps: ['comentário com palavra-chave', 'DM de boas-vindas', 'link'],
    group: 'comment',
    badge: 'Mais usado',
    triggerType: 'comment_keyword',
    defaults: {
      name: 'Comentou → recebe o link',
    },
  },
  {
    id: 'comment-to-email',
    title: 'Capturar e-mails a partir dos comentários',
    description: 'A DM pede o e-mail antes de entregar o material. O endereço fica salvo no contato.',
    steps: ['comentário com palavra-chave', 'DM pedindo o e-mail', 'link'],
    group: 'comment',
    triggerType: 'comment_keyword',
    defaults: {
      name: 'Comentou → deixa o e-mail',
      openingMode: 'ask_email',
      openingText:
        'Oi! Que bom que você se interessou.\n\nMe manda aqui o seu melhor e-mail que eu te envio o material na sequência.',
      linkMessage: 'Anotado. Aqui está o que prometi:',
      linkLabel: 'Receber material',
      tagEnabled: true,
      tagName: 'lead-instagram',
    },
  },
  {
    id: 'comment-ask-follow',
    title: 'Pedir para seguirem antes de mandar o link',
    description: 'A DM convida a seguir o perfil e só entrega o link depois da confirmação.',
    steps: ['comentário com palavra-chave', 'DM convidando a seguir', 'link'],
    group: 'comment',
    triggerType: 'comment_keyword',
    defaults: {
      name: 'Comentou → segue → recebe o link',
      openingMode: 'ask_follow',
      openingText:
        'Oi! Já separei o link para você.\n\nMe segue aqui para não perder os próximos e toca no botão abaixo que eu te mando agora.',
      openingButtonLabel: 'Já estou seguindo',
    },
  },
  {
    id: 'story-leads',
    title: 'Gerar leads com stories',
    description: 'Quem responde ao seu story entra na conversa e recebe o que você oferecer.',
    steps: ['resposta a story', 'DM de boas-vindas', 'link'],
    group: 'message',
    triggerType: 'story_reply',
    defaults: {
      name: 'Respondeu o story → recebe o link',
      keywordMode: 'any',
      openingText:
        'Que bom que você respondeu!\n\nToca no botão abaixo que eu te mando o link agora mesmo.',
    },
  },
  {
    id: 'answer-all-dms',
    title: 'Responder todas as suas DMs',
    description: 'Ninguém fica sem resposta: toda mensagem nova recebe um retorno na hora.',
    steps: ['qualquer mensagem no direct', 'resposta imediata', 'time assume'],
    group: 'message',
    triggerType: 'dm_keyword',
    defaults: {
      name: 'Resposta automática no direct',
      keywordMode: 'any',
      openingText:
        'Oi! Recebi sua mensagem. Já já alguém do time te responde por aqui.\n\nSe quiser adiantar, me conta o que você precisa.',
      linkEnabled: false,
    },
  },
  {
    id: 'welcome-new',
    title: 'Dar boas-vindas a quem chega pela primeira vez',
    description: 'Dispara só na primeira mensagem de cada pessoa — a apresentação da sua marca.',
    steps: ['primeira mensagem do contato', 'apresentação', 'time assume'],
    group: 'message',
    triggerType: 'first_message',
    defaults: {
      name: 'Boas-vindas ao contato novo',
      openingText:
        'Seja muito bem-vindo(a)!\n\nEu sou o atendimento por aqui. Me conta o que você procura que eu te ajudo.',
      linkEnabled: false,
    },
  },
  {
    id: 'story-mention-thanks',
    title: 'Agradecer quem menciona você no story',
    description: 'Cada menção vira uma conversa aberta, em vez de passar batido.',
    steps: ['menção no story', 'agradecimento', 'conversa aberta'],
    group: 'message',
    triggerType: 'story_mention',
    defaults: {
      name: 'Mencionou no story → agradecimento',
      openingText: 'Vi que você me marcou no seu story. Muito obrigado!',
      linkEnabled: false,
    },
  },
];

/** Modelo em branco: quem já sabe o que quer não precisa desmontar um pronto. */
export const BLANK_TEMPLATE: InstagramTemplate = {
  id: 'blank',
  title: 'Começar do zero',
  description: 'Escolha cada etapa você mesmo, a partir de um formulário vazio.',
  steps: ['você escolhe', 'você escreve', 'você entrega'],
  group: 'comment',
  triggerType: 'comment_keyword',
  defaults: { name: '' },
};

/** Rótulos dos grupos da galeria de modelos. */
export const TEMPLATE_GROUPS: Array<{ key: InstagramTemplate['group']; label: string }> = [
  { key: 'comment', label: 'A partir de comentários' },
  { key: 'message', label: 'A partir de mensagens e stories' },
];

/**
 * A conversa que o modelo produz, reduzida ao que cabe num cartão.
 *
 * É o que dá identidade visual a cada modelo sem recorrer a ilustração: a
 * primeira mensagem e a forma como a pessoa responde já são diferentes em cada
 * um, e são justamente o que se quer saber antes de escolher. Um desenho
 * genérico ocuparia o mesmo espaço dizendo menos.
 */
export function templatePreview(template: InstagramTemplate): {
  message: string;
  reply: { kind: 'chip' | 'text'; label: string } | null;
} {
  const merged = { ...BASE, ...template.defaults };
  // Só a primeira linha: o cartão mostra a abertura da conversa, não a
  // mensagem inteira. Quem quiser ler tudo abre o modelo.
  const message = merged.openingText.split('\n').map((line) => line.trim()).filter(Boolean)[0] || '';

  if (merged.openingMode === 'ask_email') {
    return { message, reply: { kind: 'text', label: 'ana.souza@email.com' } };
  }
  if (merged.linkEnabled) {
    return { message, reply: { kind: 'chip', label: merged.openingButtonLabel } };
  }
  return { message, reply: null };
}

export function templateById(id: string): InstagramTemplate {
  return INSTAGRAM_TEMPLATES.find((t) => t.id === id) || BLANK_TEMPLATE;
}

export function guidedFromTemplate(
  template: InstagramTemplate,
  accountId: string,
): GuidedState {
  return {
    ...BASE,
    ...template.defaults,
    templateId: template.id,
    triggerType: template.triggerType,
    instagramAccountId: accountId,
    // Gatilho sem post não tem escopo por post; deixar 'specific_media'
    // herdado do BASE faria a tela exigir uma escolha que ela nem mostra.
    postScope: template.triggerType === 'comment_keyword'
      ? (template.defaults.postScope || BASE.postScope)
      : 'all_posts',
  };
}

/**
 * Quais seções o gatilho usa.
 *
 * Story e DM não nascem de um post (não há onde escolher), e menção/primeira
 * mensagem não trazem texto para casar com palavra-chave — mostrar esses campos
 * seria oferecer um controle que não muda nada.
 */
export function sectionsFor(trigger: InstagramTriggerType) {
  return {
    postScope: trigger === 'comment_keyword',
    keywords: trigger === 'comment_keyword' || trigger === 'dm_keyword' || trigger === 'story_reply',
    commentActions: trigger === 'comment_keyword',
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Estado guiado → regra
// ───────────────────────────────────────────────────────────────────────────

export function guidedToPayload(state: GuidedState) {
  const sections = sectionsFor(state.triggerType);
  const actions: InstagramRuleAction[] = [];

  if (sections.commentActions && state.interactWithComment) {
    actions.push({ type: 'like_comment' });
    if (state.publicReplyText.trim()) {
      actions.push({ type: 'reply_comment_public', text: state.publicReplyText.trim() });
    }
  }

  const hasLink = state.linkEnabled && !!state.linkUrl.trim();

  const dm: InstagramRuleAction = {
    type: 'send_dm',
    text: state.openingText,
    button: hasLink
      ? {
          label: state.linkLabel.trim() || 'Acessar',
          url: state.linkUrl.trim(),
          message: state.linkMessage.trim() || 'Aqui está o link:',
        }
      : undefined,
    // Coleta e quick reply são caminhos alternativos para a MESMA coisa: fazer a
    // pessoa responder, o que abre a janela de 24h e libera a entrega. Ligar os
    // dois mandaria uma chip junto de uma pergunta aberta, e a resposta ficaria
    // ambígua para quem lê e para o motor.
    collect: state.openingMode === 'ask_email'
      ? {
          field: 'email',
          invalidText: state.emailInvalidText.trim() || undefined,
        }
      : undefined,
    quickReply: state.openingMode !== 'ask_email' && hasLink
      ? { enabled: true, label: state.openingButtonLabel.trim() || 'Me envie o link' }
      : undefined,
    followup: state.reminderEnabled
      ? {
          waitValue: Number(state.reminderWaitValue) || 60,
          waitUnit: state.reminderWaitUnit,
          // A tela guiada oferece só o lembrete de quem NÃO acessou — é o caso
          // que traz retorno. Quem já clicou não precisa ser cutucado, e o
          // campo vazio é lido pelo processador como "não enviar nada".
          clickedText: '',
          notClickedText: state.reminderText,
        }
      : undefined,
  };
  actions.push(dm);

  if (state.tagEnabled && state.tagName.trim()) {
    actions.push({ type: 'add_tag', tag: state.tagName.trim() });
  }

  return {
    id: state.id,
    name: state.name.trim(),
    instagram_account_id: state.instagramAccountId,
    trigger_type: state.triggerType,
    trigger_config: {
      keywords: sections.keywords && state.keywordMode === 'specific'
        ? state.keywords.split(',').map((k) => k.trim()).filter(Boolean)
        : [],
      match_type: state.matchType,
      keyword_mode: sections.keywords ? state.keywordMode : 'any',
      scope: sections.postScope ? state.postScope : 'all_posts',
      // Em next_post a lista só é preservada quando o vínculo já aconteceu:
      // sem isso, quem experimentou "publicação específica" antes de escolher
      // "próxima" salvaria a regra já presa aos posts que tinha marcado, e ela
      // nunca esperaria publicação nenhuma. Com o vínculo feito, o contrário é
      // que vale — perdê-lo faria a automação voltar a esperar depois de um
      // simples ajuste de texto.
      media_ids: !sections.postScope
        ? []
        : state.postScope === 'specific_media'
          ? state.mediaIds
          : state.postScope === 'next_post' && state.boundAt
            ? state.mediaIds
            : [],
      next_post_bound_at: state.postScope === 'next_post' ? state.boundAt ?? null : null,
    },
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Regra → estado guiado
// ───────────────────────────────────────────────────────────────────────────

export function guidedFromRule(rule: InstagramAutomationRule): GuidedState {
  const actions = rule.actions || [];
  const dm = actions.find((a) => a.type === 'send_dm');
  const publicReply = actions.find((a) => a.type === 'reply_comment_public');
  const tag = actions.find((a) => a.type === 'add_tag');
  const config = rule.trigger_config || ({} as InstagramAutomationRule['trigger_config']);

  // 'ask_follow' não é distinguível de 'welcome' na volta, e de propósito: os
  // dois geram exatamente a mesma regra (chip + link), mudando só o texto — que
  // é preservado. Gravar o modo no banco só para reacender o rádio certo seria
  // guardar decoração de tela como se fosse configuração.
  const openingMode: OpeningMode = dm?.collect ? 'ask_email' : 'welcome';

  return {
    ...BASE,
    id: rule.id,
    templateId: 'blank',
    name: rule.name,
    instagramAccountId: rule.instagram_account_id,
    triggerType: rule.trigger_type || 'comment_keyword',

    postScope: (config.scope as PostScope) || 'all_posts',
    mediaIds: config.media_ids || [],
    boundAt: config.next_post_bound_at ?? null,

    // Regra antiga não tem keyword_mode. Lê-la como 'any' faria uma automação
    // parada (sem palavra-chave, nunca dispara) passar a responder a TODO
    // comentário no próximo salvamento — mudança de comportamento silenciosa
    // em produção. O padrão é o conservador.
    keywordMode: config.keyword_mode === 'any' ? 'any' : 'specific',
    keywords: (config.keywords || []).join(', '),
    matchType: config.match_type || 'any',
    interactWithComment: !!publicReply || actions.some((a) => a.type === 'like_comment'),
    publicReplyText: publicReply?.text || BASE.publicReplyText,

    openingMode,
    openingText: dm?.text || '',
    openingButtonLabel: dm?.quickReply?.label || BASE.openingButtonLabel,
    emailInvalidText: dm?.collect?.invalidText || BASE.emailInvalidText,

    linkEnabled: !!dm?.button?.url,
    linkMessage: dm?.button?.message || BASE.linkMessage,
    linkLabel: dm?.button?.label || BASE.linkLabel,
    linkUrl: dm?.button?.url || '',

    reminderEnabled: !!dm?.followup,
    reminderText: dm?.followup?.notClickedText || BASE.reminderText,
    reminderWaitValue: String(dm?.followup?.waitValue || 60),
    reminderWaitUnit: dm?.followup?.waitUnit || 'minutes',

    tagEnabled: !!tag?.tag,
    tagName: tag?.tag || '',
  };
}

/** Erro que impede salvar, ou null. Mesma checagem usada pelo botão e pelo submit. */
export function validateGuided(state: GuidedState): string | null {
  const sections = sectionsFor(state.triggerType);

  if (!state.name.trim()) return 'Dê um nome para a automação';
  if (!state.instagramAccountId) return 'Escolha a conta do Instagram';

  if (sections.postScope && state.postScope === 'specific_media' && !state.mediaIds.length) {
    return 'Escolha ao menos uma publicação';
  }
  // Comentário sem palavra-chave responderia a todo mundo que comenta no
  // perfil — inclusive críticas. Quem quer isso escolhe "qualquer palavra"
  // conscientemente; deixar o campo vazio quase nunca é intenção.
  if (sections.keywords && state.keywordMode === 'specific' && !state.keywords.trim()) {
    return 'Escreva ao menos uma palavra, ou escolha "qualquer palavra"';
  }
  if (!state.openingText.trim()) return 'Escreva a primeira mensagem';
  if (state.linkEnabled && !state.linkUrl.trim()) return 'Informe o endereço do link';
  if (state.linkEnabled && !/^https?:\/\//i.test(state.linkUrl.trim())) {
    return 'O link precisa começar com http:// ou https://';
  }
  if (state.tagEnabled && !state.tagName.trim()) return 'Dê um nome para a etiqueta';

  return null;
}
