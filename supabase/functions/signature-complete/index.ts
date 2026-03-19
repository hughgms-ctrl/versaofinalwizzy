import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, jsonResponse, errorResponse, createServiceClient, parseJsonBody } from "../_shared/middleware.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      signatureToken, 
      selfieImage,
      signatureImage,
      signerDevice,
    } = await parseJsonBody<{
      signatureToken: string;
      selfieImage: string;
      signatureImage: string;
      signerDevice: string;
    }>(req);

    if (!signatureToken || !selfieImage || !signatureImage) {
      return errorResponse("signatureToken, selfieImage and signatureImage are required", 400);
    }

    const supabase = createServiceClient();

    // Get signer IP from request
    const signerIp = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown";

    // Find signature with document
    const { data: signature, error: sigError } = await supabase
      .from("document_signatures")
      .select("*, generated_document:generated_documents(id, name, pdf_url, filled_data)")
      .eq("signature_token", signatureToken)
      .single();

    if (sigError || !signature) {
      return errorResponse("Assinatura não encontrada", 404);
    }

    if (signature.status === "signed") {
      return errorResponse("Documento já foi assinado", 400);
    }

    // Verify OTP was completed
    const { data: otpVerified } = await supabase
      .from("signature_otp_codes")
      .select("id, verified, otp_verified_at:created_at")
      .eq("signature_id", signature.id)
      .eq("verified", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!otpVerified) {
      return errorResponse("Verificação OTP não completada", 400);
    }

    // Generate document hash (SHA-256)
    let documentHash = "";
    if (signature.generated_document?.pdf_url) {
      try {
        const pdfResponse = await fetch(signature.generated_document.pdf_url);
        const pdfBuffer = await pdfResponse.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest("SHA-256", pdfBuffer);
        documentHash = Array.from(new Uint8Array(hashBuffer))
          .map(b => b.toString(16).padStart(2, "0"))
          .join("");
      } catch (e) {
        console.error("Error hashing PDF:", e);
        // Fallback: hash the filled_data JSON
        const encoder = new TextEncoder();
        const data = encoder.encode(JSON.stringify(signature.generated_document.filled_data || {}));
        const hashBuffer = await crypto.subtle.digest("SHA-256", data);
        documentHash = Array.from(new Uint8Array(hashBuffer))
          .map(b => b.toString(16).padStart(2, "0"))
          .join("");
      }
    }

    // Upload selfie to storage
    const selfieFileName = `signatures/${signature.id}/selfie_${Date.now()}.png`;
    const selfieBase64 = selfieImage.replace(/^data:image\/\w+;base64,/, "");
    const selfieBuffer = Uint8Array.from(atob(selfieBase64), (c) => c.charCodeAt(0));

    const { error: selfieUploadError } = await supabase.storage
      .from("contact-files")
      .upload(selfieFileName, selfieBuffer, { contentType: "image/png", upsert: true });

    if (selfieUploadError) {
      console.error("Error uploading selfie:", selfieUploadError);
      return errorResponse("Erro ao salvar selfie", 500);
    }

    const { data: { publicUrl: selfieUrl } } = supabase.storage
      .from("contact-files")
      .getPublicUrl(selfieFileName);

    // Upload signature image
    const sigFileName = `signatures/${signature.id}/signature_${Date.now()}.png`;
    const sigBase64 = signatureImage.replace(/^data:image\/\w+;base64,/, "");
    const sigBuffer = Uint8Array.from(atob(sigBase64), (c) => c.charCodeAt(0));

    const { error: sigUploadError } = await supabase.storage
      .from("contact-files")
      .upload(sigFileName, sigBuffer, { contentType: "image/png", upsert: true });

    if (sigUploadError) {
      console.error("Error uploading signature:", sigUploadError);
      return errorResponse("Erro ao salvar assinatura", 500);
    }

    const { data: { publicUrl: signatureUrl } } = supabase.storage
      .from("contact-files")
      .getPublicUrl(sigFileName);

    const signedAt = new Date().toISOString();

    // Create evidence record
    const { error: evidenceError } = await supabase
      .from("signature_evidence")
      .insert({
        signature_id: signature.id,
        document_hash: documentHash,
        signer_ip: signerIp,
        signer_device: signerDevice || "unknown",
        selfie_url: selfieUrl,
        otp_verified_at: otpVerified.otp_verified_at,
        signed_at: signedAt,
        metadata: {
          user_agent: req.headers.get("user-agent"),
          signature_method: "internal_advanced",
          law_reference: "Lei 14.063/2020",
        },
      });

    if (evidenceError) {
      console.error("Error creating evidence:", evidenceError);
      return errorResponse("Erro ao registrar evidência", 500);
    }

    // Update signature record
    await supabase
      .from("document_signatures")
      .update({
        status: "signed",
        signed_at: signedAt,
        signature_url: signatureUrl,
        metadata: {
          ...(signature.metadata || {}),
          document_hash: documentHash,
          selfie_url: selfieUrl,
          signer_ip: signerIp,
          signer_device: signerDevice,
          signing_method_detail: "internal_advanced_otp_selfie",
        },
      })
      .eq("id", signature.id);

    // Update generated document
    await supabase
      .from("generated_documents")
      .update({
        signing_status: "signed",
        status: "signed",
      })
      .eq("id", signature.generated_document_id);

    // Generate receipt PDF via edge function
    let receiptPdfUrl = null;
    try {
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
      const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      
      const receiptResp = await fetch(`${SUPABASE_URL}/functions/v1/signature-receipt`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SERVICE_KEY}`,
        },
        body: JSON.stringify({
          signatureId: signature.id,
          signerName: signature.signer_name,
          signerEmail: signature.signer_email,
          signerPhone: signature.signer_phone,
          documentName: signature.generated_document?.name,
          documentHash,
          selfieUrl,
          signatureUrl,
          signedAt,
          signerIp,
          signerDevice,
        }),
      });

      if (receiptResp.ok) {
        const receiptData = await receiptResp.json();
        receiptPdfUrl = receiptData.receiptUrl;
      }
    } catch (e) {
      console.error("Error generating receipt:", e);
    }

    // Resume flow executions if waiting
    const { data: executions } = await supabase
      .from("flow_executions")
      .select("*")
      .eq("conversation_id", signature.conversation_id)
      .eq("status", "waiting_signature");

    if (executions && executions.length > 0) {
      for (const exec of executions) {
        await supabase
          .from("flow_executions")
          .update({ status: "running" })
          .eq("id", exec.id);
      }
    }

    return jsonResponse({
      success: true,
      signatureUrl,
      selfieUrl,
      documentHash,
      receiptPdfUrl,
      signedAt,
    });
  } catch (error) {
    console.error("Error in signature-complete:", error);
    return errorResponse(error.message || "Erro interno", 500);
  }
});
