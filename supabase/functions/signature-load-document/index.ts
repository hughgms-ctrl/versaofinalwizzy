import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, jsonResponse, errorResponse, createServiceClient, parseJsonBody } from "../_shared/middleware.ts";

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

    const { data: signature, error } = await supabase
      .from("document_signatures")
      .select(`
        id,
        status,
        signing_method,
        signer_name,
        signer_email,
        signer_phone,
        metadata,
        expires_at,
        generated_document:generated_documents(
          id,
          name,
          pdf_url,
          status
        )
      `)
      .eq("signature_token", signatureToken)
      .maybeSingle();

    if (error || !signature) {
      return errorResponse("Documento não encontrado ou link expirado", 404);
    }

    if (signature.expires_at && new Date(signature.expires_at) < new Date()) {
      return errorResponse("Documento não encontrado ou link expirado", 410);
    }

    return jsonResponse({ success: true, signature });
  } catch (error) {
    console.error("Error in signature-load-document:", error);
    return errorResponse(error.message || "Erro interno", 500);
  }
});