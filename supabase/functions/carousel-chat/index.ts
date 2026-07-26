// =====================================================================
// carousel-chat — modo conversacional do carrossel: cria um carrossel do
// zero ou edita slides de um carrossel já aberto, via chamada de
// ferramentas (function calling), no mesmo padrão de loop já usado em
// agent-orchestrator (tools + tool_choice:auto, round-capped, mensagens
// role:"tool" de volta pro modelo até ele responder sem tool_calls).
//
// create_carousel dispara a geração completa em BACKGROUND (mesmo padrão
// assíncrono do carousel-generate — texto/imagem podem levar dezenas de
// segundos, tempo demais pra segurar a resposta do chat). edit_slide_text
// e edit_slide_image são executados de forma síncrona (mais rápidos, e o
// usuário está esperando ver o resultado na conversa).
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateUser, errorResponse, handleCors, jsonResponse } from "../_shared/middleware.ts";
import {
  buildImagePrompt,
  buildKnowledgeContext,
  generateImage,
  generateSlideTexts,
  regenerateSlideText,
  resolveCarouselModel,
  resolveOpenAIKey,
  uploadImage,
} from "../_shared/carousel.ts";

const OPENAI_CHAT_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const MAX_ROUNDS = 3;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface Body {
  modelId: string;
  carouselId?: string | null;
  messages: ChatMessage[];
}

const service = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const VISUAL_STYLES = ["cinematic", "photorealistic", "minimalist", "watercolor", "dark", "illustration"];
const OBJECTIVES = ["educate", "sell", "engage", "inspire"];

const CREATE_CAROUSEL_TOOL = {
  type: "function",
  function: {
    name: "create_carousel",
    description:
      "Cria um novo carrossel do zero e começa a gerar os slides (texto + imagens) em background. " +
      "Só chame quando o tema estiver claro o suficiente pra gerar conteúdo de valor real — não crie um carrossel genérico.",
    parameters: {
      type: "object",
      properties: {
        topic: { type: "string", description: "O tema/ideia central do carrossel, já bem definido." },
        slideCount: { type: "integer", enum: [5, 7, 10], description: "Número de slides. Padrão 5 se o usuário não especificou." },
        imageStyle: { type: "string", enum: VISUAL_STYLES, description: "Padrão cinematic se não especificado." },
        objective: { type: "string", enum: OBJECTIVES, description: "Padrão o objetivo do projeto se não especificado." },
        ctaIdea: { type: "string", description: "Ideia crua do usuário pro CTA final, só se ele mencionou algo específico." },
      },
      required: ["topic"],
    },
  },
};

const EDIT_TEXT_TOOL = {
  type: "function",
  function: {
    name: "edit_slide_text",
    description: "Regenera o título e o corpo de UM slide específico do carrossel atualmente aberto, seguindo uma instrução.",
    parameters: {
      type: "object",
      properties: {
        slideOrder: { type: "integer", description: "Número do slide (1 = capa)." },
        instruction: { type: "string", description: "O que mudar, em linguagem natural (ex: 'mais direto', 'peça pra comentar uma palavra')." },
      },
      required: ["slideOrder", "instruction"],
    },
  },
};

const EDIT_IMAGE_TOOL = {
  type: "function",
  function: {
    name: "edit_slide_image",
    description: "Regenera a imagem de fundo de UM slide específico do carrossel atualmente aberto.",
    parameters: {
      type: "object",
      properties: {
        slideOrder: { type: "integer" },
        imageTheme: { type: "string", description: "Descrição do que deve aparecer na imagem, se o usuário especificou algo." },
      },
      required: ["slideOrder"],
    },
  },
};

function buildSystemPrompt(
  projectModel: any,
  carousel: any,
  slides: any[],
  knowledgeContext: string | null,
): string {
  const lines = [
    "Você é o assistente de criação de carrosséis do Wizzy, conversando em português com o usuário.",
    "Seu trabalho é entender o que a pessoa quer e AGIR usando as ferramentas disponíveis — não descreva o que vai fazer, faça.",
    "Só peça mais informação se o tema estiver vago ou genérico demais pra gerar algo de valor real; caso contrário, use bom senso com os valores padrão e já crie/edite.",
    "Depois de usar uma ferramenta, responda numa frase curta e natural confirmando o que foi feito — nunca em JSON.",
    "",
    `PROJETO: ${projectModel.name} — nicho: ${projectModel.niche}, tom: ${projectModel.tone}, público: ${projectModel.audience}.`,
  ];

  if (carousel) {
    lines.push(
      "",
      `CARROSSEL ABERTO: "${carousel.prompt}" (${slides.length} slides). Use edit_slide_text/edit_slide_image pra mudanças nele. ` +
        "Só use create_carousel se o usuário pedir claramente um carrossel NOVO e diferente deste.",
      ...slides.map(
        (s) => `Slide ${s.order}: título="${s.title ?? ""}" corpo="${(s.body ?? "").slice(0, 80)}"`,
      ),
    );
  } else {
    lines.push("", "Nenhum carrossel aberto ainda — use create_carousel assim que tiver um tema claro.");
  }

  if (knowledgeContext) {
    lines.push(
      "",
      `BASE DE CONHECIMENTO DO PROJETO (use como contexto real do negócio ao sugerir/criar):\n"""\n${knowledgeContext.slice(0, 15000)}\n"""`,
    );
  }

  return lines.join("\n");
}

async function runCreateCarousel(
  organizationId: string,
  userId: string,
  projectModel: any,
  args: { topic?: string; slideCount?: number; imageStyle?: string; objective?: string; ctaIdea?: string },
  apiKey: string,
  textModel: string,
): Promise<{ ok: true; carouselId: string } | { ok: false; error: string }> {
  const topic = args.topic?.trim();
  if (!topic) return { ok: false, error: "topic é obrigatório" };

  const slideCount = [5, 7, 10].includes(args.slideCount as number) ? (args.slideCount as 5 | 7 | 10) : 5;
  const imageStyle = VISUAL_STYLES.includes(args.imageStyle ?? "") ? args.imageStyle! : "cinematic";
  const objective = OBJECTIVES.includes(args.objective ?? "") ? args.objective! : projectModel.objective ?? "educate";
  const accent = projectModel.brand_color ?? "#3B82F6";
  const solidBg = projectModel.brand_color ?? "#0a0a0a";

  const { data: carousel, error: cErr } = await service
    .from("carousels")
    .insert({
      organization_id: organizationId,
      user_id: userId,
      model_id: projectModel.id,
      prompt: topic,
      slide_count: slideCount,
      image_style: imageStyle,
      status: "pending",
      niche: projectModel.niche,
      objective,
      tone: projectModel.tone,
      audience: projectModel.audience,
      brand_color: projectModel.brand_color,
      people_in_images: projectModel.people_in_images,
      cta_idea: args.ctaIdea?.trim() || null,
      source_type: "idea",
    })
    .select()
    .single();
  if (cErr || !carousel) return { ok: false, error: cErr?.message ?? "Falha ao criar carrossel" };

  const slideRows = Array.from({ length: slideCount }, (_, i) => ({
    carousel_id: carousel.id,
    order: i + 1,
    has_image: i === 0,
    text_color: "#ffffff",
    bg_color: solidBg,
    accent_color: accent,
    font_family: "Montserrat",
    text_align: "left",
    text_position: "center",
    overlay_position: "bottom",
    overlay_intensity: 0.85,
    title_size: 80,
    title_bold: true,
    body_size: 36,
  }));
  const { error: sErr } = await service.from("carousel_slides").insert(slideRows);
  if (sErr) return { ok: false, error: sErr.message };

  // @ts-ignore EdgeRuntime existe no runtime do Supabase
  EdgeRuntime.waitUntil(
    runBackgroundGeneration(
      carousel.id,
      { topic, slideCount, niche: projectModel.niche, objective, tone: projectModel.tone, audience: projectModel.audience, ctaIdea: args.ctaIdea, peopleInImages: projectModel.people_in_images, brandColor: projectModel.brand_color, imageStyle },
      apiKey,
      textModel,
    ),
  );

  return { ok: true, carouselId: carousel.id };
}

async function runBackgroundGeneration(
  carouselId: string,
  briefing: {
    topic: string;
    slideCount: number;
    niche: string;
    objective: string;
    tone: string;
    audience: string;
    ctaIdea?: string;
    peopleInImages: string;
    brandColor: string | null;
    imageStyle: string;
  },
  apiKey: string,
  textModel: string,
) {
  try {
    await service.from("carousels").update({ status: "processing" }).eq("id", carouselId);

    const { data: slides } = await service
      .from("carousel_slides")
      .select("id, order, has_image")
      .eq("carousel_id", carouselId)
      .order("order", { ascending: true });

    const texts = await generateSlideTexts({
      apiKey,
      model: textModel,
      prompt: briefing.topic,
      slideCount: briefing.slideCount,
      niche: briefing.niche,
      objective: briefing.objective,
      tone: briefing.tone,
      audience: briefing.audience,
      ctaIdea: briefing.ctaIdea,
    });

    for (const slide of slides ?? []) {
      const text = texts.find((t) => t.order === slide.order);
      if (!text) continue;
      await service
        .from("carousel_slides")
        .update({ title: text.title, body: text.body, image_theme: text.imageTheme })
        .eq("id", slide.id);
    }

    for (const slide of (slides ?? []).filter((s) => s.has_image)) {
      const text = texts.find((t) => t.order === slide.order);
      const imagePrompt = buildImagePrompt({
        imageTheme: text?.imageTheme,
        prompt: briefing.topic,
        slideTitle: text?.title,
        imageStyle: briefing.imageStyle,
        peopleInImages: briefing.peopleInImages,
        brandColor: briefing.brandColor,
      });
      const bytes = await generateImage(apiKey, imagePrompt);
      const key = `${carouselId}/slide-${slide.order}.png`;
      const imageUrl = await uploadImage(service, key, bytes);
      await service
        .from("carousel_slides")
        .update({ image_prompt: imagePrompt, image_url: imageUrl })
        .eq("id", slide.id);
    }

    await service.from("carousels").update({ status: "done" }).eq("id", carouselId);
  } catch (err) {
    console.error(`[carousel-chat] erro ao gerar ${carouselId}:`, err);
    await service
      .from("carousels")
      .update({ status: "failed", error_message: (err as Error)?.message ?? "Erro desconhecido" })
      .eq("id", carouselId);
  }
}

async function runEditSlideText(
  carousel: any,
  slides: any[],
  args: { slideOrder?: number; instruction?: string },
  apiKey: string,
  textModel: string,
): Promise<Record<string, unknown>> {
  const slide = slides.find((s) => s.order === args.slideOrder);
  if (!slide) return { ok: false, error: `Slide ${args.slideOrder} não encontrado` };

  const { title, body } = await regenerateSlideText({
    apiKey,
    model: textModel,
    prompt: carousel.prompt,
    niche: carousel.niche ?? "",
    objective: carousel.objective,
    tone: carousel.tone,
    audience: carousel.audience,
    slideOrder: slide.order,
    slideCount: carousel.slide_count,
    currentTitle: slide.title,
    currentBody: slide.body,
    instruction: args.instruction,
    ctaIdea: carousel.cta_idea,
  });

  const { error } = await service.from("carousel_slides").update({ title, body }).eq("id", slide.id);
  if (error) return { ok: false, error: error.message };
  slide.title = title;
  slide.body = body;
  return { ok: true, title, body };
}

async function runEditSlideImage(
  carousel: any,
  slides: any[],
  args: { slideOrder?: number; imageTheme?: string },
  apiKey: string,
): Promise<Record<string, unknown>> {
  const slide = slides.find((s) => s.order === args.slideOrder);
  if (!slide) return { ok: false, error: `Slide ${args.slideOrder} não encontrado` };

  const theme = args.imageTheme?.trim() || slide.image_theme;
  const imagePrompt = buildImagePrompt({
    imageTheme: theme,
    prompt: carousel.prompt,
    slideTitle: slide.title,
    imageStyle: carousel.image_style,
    peopleInImages: carousel.people_in_images,
    brandColor: carousel.brand_color,
  });
  const bytes = await generateImage(apiKey, imagePrompt);
  const key = `${carousel.id}/slide-${slide.order}-${Date.now()}.png`;
  const imageUrl = await uploadImage(service, key, bytes);

  const { error } = await service
    .from("carousel_slides")
    .update({ has_image: true, image_theme: theme, image_prompt: imagePrompt, image_url: imageUrl })
    .eq("id", slide.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  try {
    const { userId, organizationId, supabase } = await authenticateUser(req);
    const body = (await req.json()) as Body;
    if (!body?.modelId || !Array.isArray(body.messages) || !body.messages.length) {
      return errorResponse("Payload inválido", 400);
    }

    const { data: projectModel } = await supabase
      .from("carousel_models")
      .select("*")
      .eq("id", body.modelId)
      .maybeSingle();
    if (!projectModel) return errorResponse("Projeto não encontrado", 404);

    let carousel: any = null;
    let slides: any[] = [];
    if (body.carouselId) {
      const { data: c } = await supabase.from("carousels").select("*").eq("id", body.carouselId).maybeSingle();
      if (c) {
        carousel = c;
        const { data: s } = await supabase
          .from("carousel_slides")
          .select("*")
          .eq("carousel_id", carousel.id)
          .order("order", { ascending: true });
        slides = s ?? [];
      }
    }

    const apiKey = await resolveOpenAIKey(supabase, organizationId);
    const textModel = await resolveCarouselModel();
    const knowledgeContext = await buildKnowledgeContext(supabase, body.modelId);

    const tools: unknown[] = [CREATE_CAROUSEL_TOOL];
    if (carousel) tools.push(EDIT_TEXT_TOOL, EDIT_IMAGE_TOOL);

    const aiMessages: Array<Record<string, unknown>> = [
      { role: "system", content: buildSystemPrompt(projectModel, carousel, slides, knowledgeContext) },
      ...body.messages,
    ];

    let newCarouselId: string | undefined;
    let finalReply = "";

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const res = await fetch(OPENAI_CHAT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: textModel, messages: aiMessages, tools, tool_choice: "auto", temperature: 0.7 }),
      });
      if (!res.ok) throw new Error(`OpenAI chat falhou (${res.status}): ${await res.text()}`);
      const json = await res.json();
      const message = json.choices?.[0]?.message;
      if (!message) throw new Error("Resposta vazia da IA");
      aiMessages.push(message);

      const toolCalls = (message.tool_calls ?? []) as Array<{ id: string; function: { name: string; arguments: string } }>;
      if (!toolCalls.length) {
        finalReply = message.content ?? "";
        break;
      }

      for (const call of toolCalls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments || "{}");
        } catch {
          args = {};
        }

        let result: Record<string, unknown>;
        try {
          if (call.function.name === "create_carousel") {
            const created = await runCreateCarousel(organizationId, userId, projectModel, args, apiKey, textModel);
            if (created.ok) newCarouselId = created.carouselId;
            result = created;
          } else if (call.function.name === "edit_slide_text" && carousel) {
            result = await runEditSlideText(carousel, slides, args, apiKey, textModel);
          } else if (call.function.name === "edit_slide_image" && carousel) {
            result = await runEditSlideImage(carousel, slides, args, apiKey);
          } else {
            result = { ok: false, error: "Ferramenta indisponível neste momento" };
          }
        } catch (toolErr) {
          result = { ok: false, error: (toolErr as Error).message ?? "Erro ao executar ação" };
        }

        aiMessages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
      }
    }

    return jsonResponse({ reply: finalReply || "Feito!", carouselId: newCarouselId });
  } catch (err) {
    const status = (err as { status?: number })?.status ?? 500;
    return errorResponse((err as Error).message ?? "Erro no chat", status);
  }
});
