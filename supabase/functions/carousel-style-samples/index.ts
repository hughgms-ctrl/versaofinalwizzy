// =====================================================================
// carousel-style-samples — gera UMA imagem real de exemplo por estilo
// visual do carrossel (cinematic/photorealistic/minimalist/watercolor/
// dark/illustration), usada como preview real no seletor de estilo.
// Recurso GLOBAL (não é por organização) — por isso só platform_admin ou
// service_role pode disparar, evitando qualquer usuário gastar crédito de
// IA repetidamente sem querer. Sobe pro bucket público flow-media (já
// usado por outras mídias públicas do produto).
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assertServiceRoleOrPlatformAdmin } from "../_shared/access.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/middleware.ts";
import { buildImagePrompt, generateImage, resolveOpenAIKey } from "../_shared/carousel.ts";

const SAMPLE_BUCKET = "flow-media";
const SAMPLE_PREFIX = "carousel-style-samples";
const STYLES = ["cinematic", "photorealistic", "minimalist", "watercolor", "dark", "illustration"];

// Assunto neutro e genérico — o objetivo é mostrar a DIFERENÇA de estilo, não um tema específico.
const SAMPLE_SUBJECT =
  "a modern workspace with a laptop, a cup of coffee and an open notebook on a wooden desk near a window";

interface Body {
  force?: boolean;
  organizationId?: string;
}

const service = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  try {
    await assertServiceRoleOrPlatformAdmin(req, service);
    const body = (await req.json().catch(() => ({}))) as Body;

    // Chave OpenAI: usa a de uma organização específica se informada, senão o secret global.
    const apiKey = await resolveOpenAIKey(service, body.organizationId ?? "");

    const results = await Promise.all(
      STYLES.map(async (style) => {
        const path = `${SAMPLE_PREFIX}/${style}.png`;

        if (!body.force) {
          const { data: existing } = await service.storage
            .from(SAMPLE_BUCKET)
            .list(SAMPLE_PREFIX, { search: `${style}.png` });
          if (existing?.some((f) => f.name === `${style}.png`)) {
            return [style, service.storage.from(SAMPLE_BUCKET).getPublicUrl(path).data.publicUrl] as const;
          }
        }

        const prompt = buildImagePrompt({
          prompt: SAMPLE_SUBJECT,
          imageStyle: style,
          peopleInImages: "indifferent",
        });
        const bytes = await generateImage(apiKey, prompt);
        const { error } = await service.storage
          .from(SAMPLE_BUCKET)
          .upload(path, bytes, { contentType: "image/png", upsert: true });
        if (error) throw new Error(`Falha no upload (${style}): ${error.message}`);

        return [style, service.storage.from(SAMPLE_BUCKET).getPublicUrl(path).data.publicUrl] as const;
      }),
    );

    return jsonResponse({ samples: Object.fromEntries(results) });
  } catch (err) {
    const status = (err as { status?: number })?.status ?? 500;
    return errorResponse((err as Error).message ?? "Erro ao gerar amostras", status);
  }
});
