import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, jsonResponse, errorResponse, createServiceClient, parseJsonBody } from "../_shared/middleware.ts";
import { buildReceiptPdf } from "../_shared/buildReceiptPdf.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await parseJsonBody<Record<string, any>>(req);
    if (!body.signatureId) return errorResponse("signatureId is required", 400);

    const supabase = createServiceClient();

    if (!body.createdAt) {
      const { data: sigRow } = await supabase
        .from("document_signatures")
        .select("created_at, generated_document:generated_documents(created_at)")
        .eq("id", body.signatureId)
        .maybeSingle();
      body.createdAt =
        (sigRow as any)?.generated_document?.created_at ||
        (sigRow as any)?.created_at ||
        body.signedAt;
    }

    const pdfBytes = await buildReceiptPdf(body);

    const receiptFileName = `signatures/${body.signatureId}/receipt_${Date.now()}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from("contact-files")
      .upload(receiptFileName, pdfBytes, { contentType: "application/pdf", upsert: true });

    if (uploadError) {
      console.error("Error uploading receipt:", uploadError);
      return errorResponse("Erro ao salvar comprovante", 500);
    }

    const { data: { publicUrl: receiptUrl } } = supabase.storage
      .from("contact-files")
      .getPublicUrl(receiptFileName);

    await supabase
      .from("signature_evidence")
      .update({ receipt_pdf_url: receiptUrl })
      .eq("signature_id", body.signatureId);

    return jsonResponse({ success: true, receiptUrl });
  } catch (error: any) {
    console.error("Error in signature-receipt:", error);
    return errorResponse(error?.message || "Erro interno", 500);
  }
});
