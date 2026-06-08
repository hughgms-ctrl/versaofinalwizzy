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
}

export async function generateSlideTexts(
  p: GenerateTextsParams,
): Promise<SlideText[]> {
  const system =
    "Você é especialista em carrosséis virais para Instagram. " +
    "Dado um tema, nicho, objetivo, tom e audiência, gere conteúdo para cada slide. " +
    "Cada slide deve ter: title (máx 4 palavras, impactante), body (máx 15 palavras, complementa o título), " +
    "imageTheme (conceito visual que REFORÇA o texto — ex: se title='Acorde Mais Cedo', imageTheme='amanhecer dourado dramático com luz entrando pela janela'). " +
    "O slide 1 é a capa (gancho forte). O último slide é o CTA. " +
    'Retorne APENAS JSON array: [{ order, title, body, imageTheme }]';

  const user = [
    `Tema: ${p.prompt}`,
    `Nicho: ${p.niche}`,
    `Objetivo: ${OBJECTIVE_LABEL[p.objective] ?? p.objective}`,
    `Tom: ${TONE_LABEL[p.tone] ?? p.tone}`,
    `Audiência: ${p.audience}`,
    `Número de slides: ${p.slideCount}`,
    `Gere exatamente ${p.slideCount} slides numerados de 1 a ${p.slideCount}.`,
  ].join("\n");

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
}

export async function regenerateSlideText(
  p: RegenerateTextParams,
): Promise<{ title: string; body: string }> {
  const system =
    "Você é especialista em carrosséis virais para Instagram. Regenere o texto de um único slide. " +
    "title: máx 4 palavras, impactante. body: máx 15 palavras, complementa o título. " +
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
