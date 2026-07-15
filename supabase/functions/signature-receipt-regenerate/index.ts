import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, jsonResponse, errorResponse, createServiceClient, parseJsonBody } from "../_shared/middleware.ts";
import { signContactFileUrl } from "../_shared/storageDownload.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { signatureId } = await parseJsonBody<{ signatureId: string }>(req);
    if (!signatureId) return errorResponse("signatureId is required", 400);

    const supabase = createServiceClient();

    const { data: sig } = await supabase
      .from("document_signatures")
      .select("id, generated_document_id")
      .eq("id", signatureId)
      .maybeSingle();

    if (!sig) return errorResponse("Assinatura não encontrada", 404);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    // Regenerate the consolidated stamped PDF (footer + signers report).
    const r = await fetch(`${SUPABASE_URL}/functions/v1/signature-stamp-pdf`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({
        signatureId: sig.id,
        generatedDocumentId: sig.generated_document_id,
      }),
    });

    const result = await r.json();
    if (!r.ok) return errorResponse(result?.error || "Falha ao regerar relatório", 500);
    // Assina a URL (contact-files privatizável) antes de devolver p/ abrir no front.
    const receiptUrl = await signContactFileUrl(result.signedPdfUrl, supabase);
    return jsonResponse({ success: true, receiptUrl });
  } catch (e: any) {
    console.error("signature-receipt-regenerate error:", e);
    return errorResponse(e?.message || "Erro interno", 500);
  }
});
