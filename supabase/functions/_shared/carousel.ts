// =====================================================================
// Carrossel IA — helpers compartilhados (Deno / Edge Functions)
// Porte de backend/src/services/openai.service.ts, trending.service.ts e
// storage.service.ts do projeto original. Sem SDK: tudo via fetch.
// Texto: GPT-4o (chat/completions). Imagem: gpt-image-1 (images/generations).
// Storage: Supabase Storage (substitui o Cloudflare R2).
// =====================================================================

const OPENAI_CHAT = "https://api.openai.com/v1/chat/completions";
const OPENAI_IMAGES = "https://api.openai.com/v1/images/generations";

export const STYLE_HINTS: Record<string, string> = {
  cinematic:
    "cinematic lighting, dramatic composition, shallow depth of field, film grain, 35mm",
  photorealistic:
    "ultra realistic photography, natural lighting, sharp focus, high detail",
  minimalist:
    "minimalist, lots of negative space, simple shapes, clean, flat design",
  watercolor:
    "soft watercolor painting, hand-painted texture, gentle gradients, artistic",
  dark: "dark moody aesthetic, low-key lighting, deep shadows, high contrast",
  illustration:
    "modern vector illustration, bold colors, clean lines, editorial style",
};

const OBJECTIVE_LABEL: Record<string, string> = {
  educate: "educar (ensinar algo de valor)",
  sell: "vender (converter / despertar desejo de compra)",
  engage: "engajar (gerar comentários, salvamentos e interação)",
  inspire: "inspirar (motivar e emocionar)",
};

// Playbook de copywriting por objetivo — muda o ARCO e a META do carrossel.
// Injetado no system prompt para que a estratégia (não só a palavra do objetivo)
// realmente mude conforme o que o usuário escolheu.
const OBJECTIVE_STRATEGY: Record<string, string> = {
  educate: [
    "OBJETIVO = EDUCAR (ensinar de verdade).",
    "- Capa: um gancho que desperta curiosidade sobre o que será ensinado (pergunta instigante, número surpreendente ou promessa específica com lacuna de curiosidade) — nunca um título genérico/enciclopédico do assunto.",
    "- Meio: uma mini-aula — cada slide ensina um passo, conceito ou técnica concreta (prefira método numerado / passo a passo). Traga o como, o porquê, exemplos e números.",
    "- Final: CTA para salvar o carrossel e seguir para mais conteúdo assim.",
    "Meta: a pessoa termina sabendo APLICAR o que aprendeu.",
  ].join("\n"),
  sell: [
    "OBJETIVO = VENDER (despertar desejo e converter).",
    "- Capa: fisgue com a dor mais aguda ou o desejo mais forte da audiência.",
    "- Meio: agite o problema (o que dói em não resolver), apresente a transformação/solução e sustente com benefícios concretos, prova e a quebra da principal objeção. Fale de RESULTADO e transformação, não de características técnicas.",
    "- Final: CTA de ação direta (chamar no direct, clicar no link, comprar) com um empurrão de urgência ou valor.",
    "Meta: criar desejo e levar à ação — NÃO dar aula.",
  ].join("\n"),
  engage: [
    "OBJETIVO = ENGAJAR (gerar comentários, salvamentos e interação).",
    "- Capa: uma provocação — pergunta instigante, opinião contra o senso comum ou um mito que você vai derrubar.",
    "- Meio: apresente posições, contrastes (mito x verdade, erro x acerto) e ganchos que fazem a pessoa se posicionar ou se identificar. Cada slide deve dar vontade de comentar ou marcar alguém.",
    "- Final: CTA para comentar, marcar um amigo ou dar a opinião.",
    "Meta: gerar conversa e compartilhamento.",
  ].join("\n"),
  inspire: [
    "OBJETIVO = INSPIRAR (motivar e emocionar).",
    "- Capa: crie tensão emocional ou a promessa de uma virada.",
    "- Meio: use narrativa e contraste (antes x depois, obstáculo x superação), com detalhes concretos e reais que geram identificação — nada de frase de efeito vazia. Cada slide avança a jornada emocional.",
    "- Final: CTA para compartilhar com quem precisa ouvir isso ou seguir.",
    "Meta: emocionar e mover à ação com verdade e concretude — não com clichê.",
  ].join("\n"),
};

const TONE_LABEL: Record<string, string> = {
  professional: "profissional e autoritário",
  casual: "descontraído e próximo",
  motivational: "motivacional e energético",
  direct: "direto e sem rodeios",
};

const PEOPLE_HINT: Record<string, string> = {
  with: "include real, authentic people in the scene",
  without: "no people, no humans, no faces — objects, scenery or abstract only",
  indifferent: "",
};

// ---------------------------------------------------------------------
// Resolução da chave OpenAI: prioriza a chave da organização
// (integration_configs.openai_api_key) e cai para o secret global do projeto.
// ---------------------------------------------------------------------
export async function resolveOpenAIKey(
  supabase: any,
  organizationId: string,
): Promise<string> {
  const { data } = await supabase
    .from("integration_configs")
    .select("openai_api_key")
    .eq("organization_id", organizationId)
    .maybeSingle();

  const orgKey = data?.openai_api_key?.trim();
  const globalKey = Deno.env.get("OPENAI_API_KEY")?.trim();
  const key = orgKey || globalKey;
  if (!key) {
    throw new Error(
      "Nenhuma chave OpenAI configurada. Acesse Configurações > Integrações e adicione sua chave.",
    );
  }
  return key;
}

// ---------------------------------------------------------------------
// Parser tolerante de JSON (aceita cercas markdown e texto extra).
// ---------------------------------------------------------------------
function parseJsonObject<T>(raw: string | null | undefined): T {
  const text = (raw ?? "").trim();
  if (!text) return {} as T;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = (fenced ? fenced[1] : text).trim();
  const firstObj = candidate.indexOf("{");
  const firstArr = candidate.indexOf("[");
  const start = firstArr !== -1 && (firstObj === -1 || firstArr < firstObj)
    ? firstArr
    : firstObj;
  const lastObj = candidate.lastIndexOf("}");
  const lastArr = candidate.lastIndexOf("]");
  const end = Math.max(lastObj, lastArr);
  const json = start !== -1 && end !== -1
    ? candidate.slice(start, end + 1)
    : candidate;
  return JSON.parse(json) as T;
}

async function chatCompletion(
  apiKey: string,
  system: string,
  user: string,
  temperature: number,
): Promise<string> {
  const res = await fetch(OPENAI_CHAT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      temperature,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI chat falhou (${res.status}): ${body}`);
  }
  const json = await res.json();
  return json.choices?.[0]?.message?.content ?? "";
}

type VisionContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

async function chatCompletionVision(
  apiKey: string,
  system: string,
  userContent: VisionContentPart[],
  temperature: number,
): Promise<string> {
  const res = await fetch(OPENAI_CHAT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      temperature,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI vision falhou (${res.status}): ${body}`);
  }
  const json = await res.json();
  return json.choices?.[0]?.message?.content ?? "";
}

// ---------------------------------------------------------------------
// Geração de textos (todos os slides de uma vez).
// ---------------------------------------------------------------------
export interface SlideText {
  order: number;
  title: string;
  body: string;
  imageTheme: string;
}

export interface GenerateTextsParams {
  apiKey: string;
  prompt: string;
  slideCount: number;
  niche: string;
  objective: string;
  tone: string;
  audience: string;
  /** Ideia de CTA do usuário (opcional, pode vir crua) para o último slide. */
  ctaIdea?: string | null;
  /** Material de origem (texto colado, artigo ou transcrição de vídeo) — quando presente, os slides são extraídos DESSE conteúdo em vez de criados do zero a partir do tema. */
  sourceContent?: string | null;
}

// Trunca o material de origem pra caber num prompt razoável sem estourar tokens.
const MAX_SOURCE_CHARS = 12000;

function sourceContentInstruction(sourceContent: string): string {
  return (
    `MATERIAL DE ORIGEM (base real do conteúdo — extraia dali os pontos mais valiosos, ` +
    `surpreendentes e específicos, e estruture em slides seguindo a estratégia acima; ` +
    `NÃO invente fatos, dados ou exemplos que não estejam no material, mas pode reescrever ` +
    `e resumir com sua própria voz; ignore ruído como menus, propaganda ou links relacionados ` +
    `caso apareçam no meio do texto):\n"""\n${sourceContent.trim().slice(0, MAX_SOURCE_CHARS)}\n"""`
  );
}

// Mecânica de viralização — vale para QUALQUER objetivo. Um carrossel "bobinho"
// (raso, previsível, sem tensão) não viraliza mesmo com o conteúdo correto; este
// bloco força os ingredientes que fazem alguém parar de rolar o feed, deslizar
// até o fim e comentar. Reaproveitado na geração completa e na regeneração de
// slide único, pra manter o mesmo padrão em qualquer edição.
const VIRAL_MECHANICS = [
  "MECÂNICA DE VIRALIZAÇÃO (vale sempre, qualquer que seja o objetivo — o carrossel tem que ser bom o bastante pra alguém parar de rolar o feed, deslizar até o fim e comentar):",
  "- Teste do scroll-stopper: se um estranho no feed batesse o olho só na CAPA, ela sozinha teria que fisgar. Se o gancho não causar um 'espera, o quê?' ou uma pergunta na cabeça de quem lê, refaça.",
  "- Loop aberto entre slides: cada slide (exceto o último) termina deixando uma pergunta ou tensão não resolvida que só o PRÓXIMO slide resolve — é isso que faz a pessoa arrastar pro lado em vez de sair do post.",
  "- Pelo menos 1 slide do meio precisa ser uma tomada de posição, contraste ou virada de expectativa (mito x verdade, o que todo mundo faz x o que realmente funciona, número que contraria o senso comum) — o tipo de slide que faz a pessoa concordar, discordar ou se identificar em voz alta nos comentários.",
  "- Densidade de 'printável': pelo menos uma frase do carrossel devia ser boa o bastante pra alguém printar e postar no story marcando a página.",
  "- CTA final pede uma ação de ENGAJAMENTO explícita e conectada ao valor entregue (comentar uma palavra/opinião, marcar alguém que precisa ver isso, salvar pra não perder) — nunca um 'segue a gente' genérico e desconectado do conteúdo.",
  "- PROIBIDO: carrossel 'bobinho' — previsível, óbvio, sem tensão, dá pra adivinhar a próxima frase antes de ler.",
].join("\n");

// Instrução compartilhada para o CTA quando o usuário forneceu uma ideia.
// Preserva a intenção e QUALQUER palavra-chave/gatilho exatamente como escrito
// (ex.: integrações tipo ManyChat que disparam por palavra-chave no comentário).
function ctaIdeaInstruction(ctaIdea: string): string {
  return (
    `Ideia de CTA do usuário para o ÚLTIMO slide: "${ctaIdea}". ` +
    "Ela pode estar crua ou mal escrita — transforme-a num CTA claro e persuasivo, corrigindo a redação e o português, " +
    "MAS preserve a intenção e QUALQUER palavra-chave/gatilho EXATAMENTE como o usuário escreveu (ex.: 'comente ORCAMENTO', 'mande a palavra X no direct'). " +
    "Nunca invente uma palavra-chave que o usuário não citou."
  );
}

// ---------------------------------------------------------------------
// Biblioteca de templates — análise por visão de um carrossel de referência
// (prints enviados pelo usuário) + geração de um carrossel NOVO inspirado
// na estrutura/estilo dele. Nunca extrai o texto literal nem reaproveita a
// foto de pessoas reais que apareçam na referência — só o "molde".
// ---------------------------------------------------------------------
export interface SlideAnalysis {
  order: number;
  hasRealPersonPhoto: boolean;
  visualStyle: string;
  overlayPosition: string;
  textAlign: string;
  role: "cover" | "middle" | "cta";
  themeConcept: string;
}

export interface ReferenceAnalysis {
  slides: SlideAnalysis[];
  inferredNiche: string;
  inferredObjective: string;
  inferredTone: string;
  overallVisualStyle: string;
}

const VALID_VISUAL_STYLES = new Set([
  "cinematic",
  "photorealistic",
  "minimalist",
  "watercolor",
  "dark",
  "illustration",
]);
const VALID_OVERLAY_POSITIONS = new Set(["top", "center", "bottom", "full"]);
const VALID_TEXT_ALIGNS = new Set(["left", "center", "right"]);
const VALID_OBJECTIVES = new Set(["educate", "sell", "engage", "inspire"]);
const VALID_TONES = new Set(["professional", "casual", "motivational", "direct"]);

export async function analyzeCarouselReference(
  apiKey: string,
  images: string[],
): Promise<ReferenceAnalysis> {
  const system = [
    "Você analisa carrosséis de Instagram de referência pra extrair ESTRUTURA e ESTILO — NUNCA o texto exato nem a identidade de pessoas reais que apareçam nas imagens.",
    "Para cada imagem (na ordem enviada, representando os slides 1..N do carrossel), retorne:",
    "- hasRealPersonPhoto: true se o fundo mostra uma FOTO REAL de uma pessoa identificável (rosto real, não ilustração/abstrato/objeto).",
    "- visualStyle: cinematic | photorealistic | minimalist | watercolor | dark | illustration — o que mais se aproxima do estilo visual.",
    "- overlayPosition: top | center | bottom | full — onde fica a camada escura/o bloco de texto sobre a imagem.",
    "- textAlign: left | center | right.",
    "- role: cover (é o 1º slide), cta (é o último, tem chamada de ação) ou middle (demais).",
    "- themeConcept: uma frase curta descrevendo do que aquele slide TRATA conceitualmente (o assunto/ideia) — PROIBIDO copiar o texto literal do slide, é só pra entender o tema.",
    "Também retorne um resumo geral do carrossel inteiro: inferredNiche, inferredObjective (educate|sell|engage|inspire), inferredTone (professional|casual|motivational|direct), overallVisualStyle (o estilo predominante).",
    "Retorne APENAS um JSON: { slides: [{ order, hasRealPersonPhoto, visualStyle, overlayPosition, textAlign, role, themeConcept }], inferredNiche, inferredObjective, inferredTone, overallVisualStyle }",
  ].join("\n");

  const userContent: VisionContentPart[] = [
    {
      type: "text",
      text: `Analise estas ${images.length} imagens, na ordem enviada (slide 1 a ${images.length}) de um carrossel de referência.`,
    },
    ...images.map((url): VisionContentPart => ({ type: "image_url", image_url: { url } })),
  ];

  const raw = await chatCompletionVision(apiKey, system, userContent, 0.4);
  const parsed = parseJsonObject<Partial<ReferenceAnalysis>>(raw);
  const rawSlides = Array.isArray(parsed.slides) ? parsed.slides : [];

  const slides: SlideAnalysis[] = images.map((_, i) => {
    const order = i + 1;
    const found = (rawSlides.find((s) => s.order === order) ?? rawSlides[i] ?? {}) as Partial<SlideAnalysis>;
    return {
      order,
      hasRealPersonPhoto: !!found.hasRealPersonPhoto,
      visualStyle: VALID_VISUAL_STYLES.has(found.visualStyle ?? "") ? (found.visualStyle as string) : "cinematic",
      overlayPosition: VALID_OVERLAY_POSITIONS.has(found.overlayPosition ?? "")
        ? (found.overlayPosition as string)
        : "bottom",
      textAlign: VALID_TEXT_ALIGNS.has(found.textAlign ?? "") ? (found.textAlign as string) : "left",
      role: order === 1 ? "cover" : order === images.length ? "cta" : "middle",
      themeConcept: found.themeConcept?.trim() ?? "",
    };
  });

  const overallVisualStyle = VALID_VISUAL_STYLES.has(parsed.overallVisualStyle ?? "")
    ? (parsed.overallVisualStyle as string)
    : slides[0]?.visualStyle ?? "cinematic";

  return {
    slides,
    inferredNiche: parsed.inferredNiche?.trim() || "Geral",
    inferredObjective: VALID_OBJECTIVES.has(parsed.inferredObjective ?? "")
      ? (parsed.inferredObjective as string)
      : "educate",
    inferredTone: VALID_TONES.has(parsed.inferredTone ?? "") ? (parsed.inferredTone as string) : "professional",
    overallVisualStyle,
  };
}

export interface GenerateFromReferenceParams {
  apiKey: string;
  niche: string;
  objective: string;
  tone: string;
  audience: string;
  slideCount: number;
  slideBrief: { order: number; role: string; themeConcept: string }[];
  ctaIdea?: string | null;
}

export async function generateSlideTextsFromReference(
  p: GenerateFromReferenceParams,
): Promise<SlideText[]> {
  const strategy = OBJECTIVE_STRATEGY[p.objective] ?? OBJECTIVE_STRATEGY.educate;
  const briefLines = p.slideBrief
    .map((s) => `Slide ${s.order} (${s.role}): ${s.themeConcept || "sem descrição — use seu critério"}`)
    .join("\n");
  const system =
    "Você é um copywriter sênior de carrosséis para Instagram. Vai criar um carrossel NOVO E 100% ORIGINAL, " +
    "inspirado na ESTRUTURA e no TEMA de um carrossel de referência que a pessoa gostou — mas o texto tem que ser " +
    "todo seu: PROIBIDO copiar ou parafrasear de perto qualquer frase do original. Use a referência só pra entender " +
    "o tipo de gancho, o papel de cada slide na sequência (capa, meio, CTA) e o assunto geral.\n\n" +
    "REGRAS UNIVERSAIS (valem sempre):\n" +
    "1) Cada slide do meio entrega UM ponto concreto e específico — nunca uma frase óbvia ou de encher linguiça.\n" +
    "2) Seja ESPECÍFICO: passos, números, exemplos práticos. PROIBIDO clichê ('seja consistente', 'acredite em você' e afins).\n" +
    "3) Os slides formam uma SEQUÊNCIA coerente — cada um constrói sobre o anterior.\n" +
    "4) O body é autoexplicativo.\n\n" +
    VIRAL_MECHANICS + "\n\n" +
    "ESTRATÉGIA PARA ESTE CARROSSEL:\n" + strategy + "\n\n" +
    "FORMATO DE CADA SLIDE:\n" +
    "- title: gancho curto e impactante do slide (máx 6 palavras).\n" +
    "- body: o conteúdo do slide — concreto, específico e autoexplicativo (máx 30 palavras).\n" +
    "- imageTheme: conceito visual que REFORÇA o texto.\n\n" +
    "Retorne APENAS um JSON array: [{ order, title, body, imageTheme }]";

  const user = [
    `Nicho: ${p.niche}`,
    `Objetivo: ${OBJECTIVE_LABEL[p.objective] ?? p.objective}`,
    `Tom: ${TONE_LABEL[p.tone] ?? p.tone}`,
    `Audiência: ${p.audience}`,
    `Número de slides: ${p.slideCount}`,
    `Gere exatamente ${p.slideCount} slides numerados de 1 a ${p.slideCount}.`,
    "ESTRUTURA DE REFERÊNCIA (só inspiração de tema e papel de cada slide — escreva tudo com palavras suas):",
    briefLines,
    p.ctaIdea?.trim() ? ctaIdeaInstruction(p.ctaIdea.trim()) : "",
  ].filter(Boolean).join("\n");

  const raw = await chatCompletion(p.apiKey, system, user, 0.85);
  const parsed = parseJsonObject<SlideText[] | { slides?: SlideText[] }>(raw);
  const slides: SlideText[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed.slides)
    ? parsed.slides
    : [];

  return Array.from({ length: p.slideCount }, (_, i) => {
    const order = i + 1;
    const found = slides.find((s) => s.order === order) ?? slides[i];
    return {
      order,
      title: found?.title?.trim() ?? "",
      body: found?.body?.trim() ?? "",
      imageTheme: found?.imageTheme?.trim() ?? "",
    };
  });
}

export async function generateSlideTexts(
  p: GenerateTextsParams,
): Promise<SlideText[]> {
  const strategy = OBJECTIVE_STRATEGY[p.objective] ?? OBJECTIVE_STRATEGY.educate;
  const system =
    "Você é um copywriter sênior de carrosséis para Instagram que produz conteúdo com substância real — nunca raso, genérico ou motivacional vazio.\n\n" +
    "REGRAS UNIVERSAIS (valem sempre):\n" +
    "1) Cada slide do meio entrega UM ponto concreto e específico que cumpre o objetivo do carrossel — nunca uma frase óbvia ou de encher linguiça.\n" +
    "2) Seja ESPECÍFICO: use passos, números, exemplos práticos, nomes de técnicas/ferramentas, dados reais. PROIBIDO clichê ('seja consistente', 'acredite em você', 'foco e disciplina', 'saia da zona de conforto' e afins).\n" +
    "3) Teste da obviedade: se a audiência já sabe o que o slide diz, refaça com mais profundidade e informação nova.\n" +
    "4) Os slides formam uma SEQUÊNCIA: cada um constrói sobre o anterior e avança o raciocínio ou a emoção.\n" +
    "5) O body é autoexplicativo: sozinho já entrega valor.\n" +
    "6) CAPA (slide 1): é SEMPRE um gancho que abre curiosidade — pergunta instigante, número/dado chocante, afirmação forte/contraintuitiva ou promessa específica. NUNCA um título genérico ou enciclopédico (PROIBIDO 'História dos X', 'Guia sobre Y', 'Tudo sobre Z'). Varie o tipo de gancho; a pergunta é uma ótima primeira opção quando encaixa no tema.\n" +
    "7) ÚLTIMO slide: é SEMPRE um CTA — chamada de ação clara (salvar, seguir, comentar, compartilhar ou chamar no direct) conectada ao valor entregue. NUNCA use o último slide para apresentar conteúdo novo.\n\n" +
    VIRAL_MECHANICS + "\n\n" +
    "ESTRATÉGIA PARA ESTE CARROSSEL:\n" + strategy + "\n\n" +
    "FORMATO DE CADA SLIDE:\n" +
    "- title: gancho curto e impactante do slide (máx 6 palavras).\n" +
    "- body: o conteúdo do slide — concreto, específico e autoexplicativo (máx 30 palavras; use-as para agregar substância, não enrolação).\n" +
    "- imageTheme: conceito visual que REFORÇA o texto (ex: title='Acorde Mais Cedo' → imageTheme='amanhecer dourado dramático com luz entrando pela janela').\n\n" +
    "Retorne APENAS um JSON array: [{ order, title, body, imageTheme }]";

  const user = [
    `Tema: ${p.prompt}`,
    `Nicho: ${p.niche}`,
    `Objetivo: ${OBJECTIVE_LABEL[p.objective] ?? p.objective}`,
    `Tom: ${TONE_LABEL[p.tone] ?? p.tone}`,
    `Audiência: ${p.audience}`,
    `Número de slides: ${p.slideCount}`,
    `Gere exatamente ${p.slideCount} slides numerados de 1 a ${p.slideCount}.`,
    "Siga a estratégia do objetivo e priorize substância real em cada slide — nada de frases bonitas e vazias.",
    p.sourceContent?.trim() ? sourceContentInstruction(p.sourceContent) : "",
    p.ctaIdea?.trim() ? ctaIdeaInstruction(p.ctaIdea.trim()) : "",
  ].filter(Boolean).join("\n");

  const raw = await chatCompletion(p.apiKey, system, user, 0.8);
  const parsed = parseJsonObject<SlideText[] | { slides?: SlideText[] }>(raw);
  const slides: SlideText[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed.slides)
    ? parsed.slides
    : [];

  return Array.from({ length: p.slideCount }, (_, i) => {
    const order = i + 1;
    const found = slides.find((s) => s.order === order) ?? slides[i];
    return {
      order,
      title: found?.title?.trim() ?? "",
      body: found?.body?.trim() ?? "",
      imageTheme: found?.imageTheme?.trim() ?? "",
    };
  });
}

// ---------------------------------------------------------------------
// Regeneração de texto de um único slide.
// ---------------------------------------------------------------------
export interface RegenerateTextParams {
  apiKey: string;
  prompt: string;
  niche: string;
  objective?: string | null;
  tone?: string | null;
  audience?: string | null;
  slideOrder: number;
  slideCount: number;
  currentTitle?: string | null;
  currentBody?: string | null;
  instruction?: string;
  /** Ideia de CTA do usuário (opcional) — usada ao regenerar o último slide. */
  ctaIdea?: string | null;
}

export async function regenerateSlideText(
  p: RegenerateTextParams,
): Promise<{ title: string; body: string }> {
  const strategy = p.objective
    ? OBJECTIVE_STRATEGY[p.objective] ?? OBJECTIVE_STRATEGY.educate
    : OBJECTIVE_STRATEGY.educate;
  // Papel do slide na sequência: capa (gancho) ou último (CTA) têm regras próprias.
  const isLast = p.slideOrder === p.slideCount;
  const roleHint = p.slideOrder === 1
    ? "\n\nESTE É O SLIDE 1 (CAPA): faça um gancho que abre curiosidade (pergunta instigante, número/dado chocante, afirmação forte ou promessa específica). NUNCA um título genérico ou enciclopédico."
    : isLast
    ? "\n\nESTE É O ÚLTIMO SLIDE (CTA): faça uma chamada de ação clara (salvar, seguir, comentar, compartilhar ou chamar no direct) conectada ao valor do carrossel. Não apresente conteúdo novo." +
      (p.ctaIdea?.trim() ? "\n" + ctaIdeaInstruction(p.ctaIdea.trim()) : "")
    : "";
  const system =
    "Você é um copywriter sênior de carrosséis para Instagram que produz conteúdo com substância real. " +
    "Regenere o texto de um único slide para que ele cumpra o objetivo do carrossel com um ponto concreto e específico — nada de frases genéricas, óbvias, clichês ou motivacionais vazias. " +
    "Seja ESPECÍFICO: use passos, números, exemplos práticos, o 'como' e o 'porquê'. Se a audiência já sabe o que o slide diz, refaça com mais profundidade e informação nova. " +
    "Mantenha coerência com o propósito do slide dentro da sequência do carrossel.\n\n" +
    VIRAL_MECHANICS + "\n\n" +
    "ESTRATÉGIA DO CARROSSEL:\n" + strategy + roleHint + "\n\n" +
    "title: gancho curto e impactante (máx 6 palavras). body: o conteúdo do slide — concreto, específico e autoexplicativo (máx 30 palavras). " +
    "Responda SOMENTE com JSON puro e válido { title, body }, sem markdown e sem nenhum texto fora do JSON.";

  const user = [
    `Tema geral do carrossel: ${p.prompt}`,
    `Nicho: ${p.niche}`,
    p.objective ? `Objetivo: ${OBJECTIVE_LABEL[p.objective] ?? p.objective}` : "",
    p.tone ? `Tom: ${TONE_LABEL[p.tone] ?? p.tone}` : "",
    p.audience ? `Audiência: ${p.audience}` : "",
    `Slide ${p.slideOrder} de ${p.slideCount}.`,
    p.currentTitle ? `Título atual: ${p.currentTitle}` : "",
    p.currentBody ? `Corpo atual: ${p.currentBody}` : "",
    p.instruction
      ? `Instrução do usuário: ${p.instruction}`
      : "Melhore e reescreva mantendo o mesmo propósito do slide.",
  ].filter(Boolean).join("\n");

  const raw = await chatCompletion(p.apiKey, system, user, 0.9);
  const parsed = parseJsonObject<{ title?: string; body?: string }>(raw);
  return {
    title: parsed.title?.trim() ?? p.currentTitle ?? "",
    body: parsed.body?.trim() ?? p.currentBody ?? "",
  };
}

// ---------------------------------------------------------------------
// "Melhorar com IA" — enriquece o Nicho ou a Audiência que o usuário
// digitou no formulário de modelo, deixando-o mais específico e melhor
// para a geração dos carrosséis. Retorna uma linha curta (é um input).
// ---------------------------------------------------------------------
export type EnhanceField = "niche" | "audience";

export interface EnhanceContext {
  niche?: string | null;
  objective?: string | null;
  tone?: string | null;
}

const ENHANCE_GUIDE: Record<EnhanceField, { role: string; task: string; example: string }> = {
  niche: {
    role: "Você refina o NICHO de um perfil/marca para a geração de carrosséis no Instagram.",
    task:
      "Transforme o texto do usuário em um nicho ESPECÍFICO e bem definido (um subnicho claro), corrigindo erros de português. " +
      "Deixe claro o tema central e, quando fizer sentido, o recorte (segmento, abordagem ou público). " +
      "Seja conciso: no máximo ~12 palavras, sem ponto final, sem aspas e sem explicação — apenas o nicho refinado.",
    example:
      'Ex: "carro esportivo" → "Carros esportivos e superesportivos: cultura, performance e lifestyle".',
  },
  audience: {
    role: "Você refina a AUDIÊNCIA-ALVO de um perfil/marca para a geração de carrosséis no Instagram.",
    task:
      "Transforme o texto do usuário em uma descrição de audiência ESPECÍFICA e vívida, corrigindo erros de português. " +
      "Inclua, quando possível, o perfil (faixa etária, momento de vida) e o principal desejo ou dor. " +
      "Seja conciso: no máximo ~18 palavras, sem ponto final, sem aspas e sem explicação — apenas a audiência refinada.",
    example:
      'Ex: "pessoas que se interessam por carros" → "Entusiastas de carros esportivos, 25-45 anos, que sonham em ter um superesportivo".',
  },
};

export async function enhanceModelField(
  apiKey: string,
  field: EnhanceField,
  value: string,
  ctx: EnhanceContext = {},
): Promise<string> {
  const g = ENHANCE_GUIDE[field];
  const system = g.role + " " + g.task + " " + g.example +
    " Responda APENAS com o texto refinado, em português (mesma língua do usuário), sem nenhum comentário extra.";

  const user = [
    `Texto do usuário: ${value}`,
    field === "audience" && ctx.niche ? `Nicho do perfil: ${ctx.niche}` : "",
    ctx.objective
      ? `Objetivo dos carrosséis: ${OBJECTIVE_LABEL[ctx.objective] ?? ctx.objective}`
      : "",
    ctx.tone ? `Tom: ${TONE_LABEL[ctx.tone] ?? ctx.tone}` : "",
  ].filter(Boolean).join("\n");

  const raw = await chatCompletion(apiKey, system, user, 0.7);
  // O modelo às vezes devolve com aspas ou quebras — normaliza para uma linha.
  return raw.trim().replace(/^["'`]+|["'`]+$/g, "").replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------
// Prompt e geração de imagem (gpt-image-1).
// ---------------------------------------------------------------------
export interface BuildImagePromptParams {
  imageTheme?: string | null;
  prompt: string;
  slideTitle?: string | null;
  imageStyle: string;
  peopleInImages?: string | null;
  brandColor?: string | null;
}

export function buildImagePrompt(p: BuildImagePromptParams): string {
  const styleHint = STYLE_HINTS[p.imageStyle] ?? STYLE_HINTS.cinematic;
  const base = p.imageTheme?.trim() ||
    [p.prompt, p.slideTitle].filter(Boolean).join(" — ");
  const peopleHint = p.peopleInImages ? PEOPLE_HINT[p.peopleInImages] ?? "" : "";
  const FIXED =
    "no text, no letters, no words in the image, professional photography, " +
    "dramatic lighting, high quality, 1080x1080";
  return [
    base,
    styleHint,
    peopleHint,
    p.brandColor ? `brand color accent: ${p.brandColor}` : "",
    FIXED,
  ].filter(Boolean).join(", ");
}

/** gpt-image-1: retorna os bytes PNG da imagem. */
export async function generateImage(
  apiKey: string,
  prompt: string,
): Promise<Uint8Array> {
  const res = await fetch(OPENAI_IMAGES, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt,
      n: 1,
      size: "1024x1024",
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI image falhou (${res.status}): ${body}`);
  }
  const json = await res.json();
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error("gpt-image-1 não retornou imagem");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ---------------------------------------------------------------------
// Upload pro Supabase Storage (bucket carousel-images). Substitui o R2.
// Retorna a URL pública.
// ---------------------------------------------------------------------
export const CAROUSEL_BUCKET = "carousel-images";

export async function uploadImage(
  supabase: any,
  key: string,
  body: Uint8Array,
  contentType = "image/png",
): Promise<string> {
  const { error } = await supabase.storage
    .from(CAROUSEL_BUCKET)
    .upload(key, body, { contentType, upsert: true });
  if (error) throw new Error(`Falha no upload da imagem: ${error.message}`);

  const { data } = supabase.storage.from(CAROUSEL_BUCKET).getPublicUrl(key);
  return data.publicUrl;
}

// ---------------------------------------------------------------------
// Trending — sugestões de tema por nicho (GPT-4o).
// ---------------------------------------------------------------------
export interface TrendingIdea {
  title: string;
  description: string;
}

export async function getTrendingIdeas(
  apiKey: string,
  niche: string,
  count = 8,
): Promise<TrendingIdea[]> {
  const system =
    'Você é um estrategista de conteúdo para Instagram. Dado um nicho, sugira temas de carrossel com alto potencial de engajamento e relevância atual. Retorne APENAS um JSON com a chave "ideas" contendo um array de objetos { title, description } — title curto e chamativo, description em uma frase. Sem markdown.';
  const user = `Nicho: ${niche}\nGere ${count} sugestões de tema para carrossel.`;

  const raw = await chatCompletion(apiKey, system, user, 0.9);
  const parsed = parseJsonObject<{ ideas?: TrendingIdea[] }>(raw);
  const ideas = Array.isArray(parsed.ideas) ? parsed.ideas : [];
  return ideas
    .filter((i) => i?.title)
    .slice(0, count)
    .map((i) => ({
      title: String(i.title).trim(),
      description: String(i.description ?? "").trim(),
    }));
}
