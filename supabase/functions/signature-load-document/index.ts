import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, jsonResponse, errorResponse, createServiceClient, parseJsonBody } from "../_shared/middleware.ts";
import { resolveSignatureByToken } from "../_shared/signerBridge.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { signatureToken } = await parseJsonBody<{ signatureToken: string }>(req);

    if (!signatureToken) {
      return errorResponse("signatureToken is required", 400);
    }

    const supabase = createServiceClient();

    const resolved = await resolveSignatureByToken(supabase, signatureToken);
    if (!resolved) {
      return errorResponse("Documento não encontrado ou link expirado", 404);
    }

    if (resolved.expires_at && new Date(resolved.expires_at) < new Date()) {
      return errorResponse("Documento não encontrado ou link expirado", 410);
    }

    // Load the related generated document for preview
    const { data: doc } = await supabase
      .from("generated_documents")
      .select("id, name, pdf_url, status")
      .eq("id", resolved.generated_document_id)
      .maybeSingle();

    const signature = {
      id: resolved.id,
      status: resolved.status,
      signing_method: resolved.signing_method,
      signer_name: resolved.signer_name,
      signer_email: resolved.signer_email,
      signer_phone: resolved.signer_phone,
      metadata: resolved.metadata,
      expires_at: resolved.expires_at,
      generated_document: doc || null,
    };

    return jsonResponse({ success: true, signature });
  } catch (error) {
    console.error("Error in signature-load-document:", error);
    return errorResponse(error.message || "Erro interno", 500);
  }
});
