import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, jsonResponse, errorResponse, createServiceClient, parseJsonBody } from "../_shared/middleware.ts";

/**
 * Generates a simple receipt/proof PDF for the signature.
 * Uses HTML → PDF approach via the existing generate-document-pdf pattern.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      signatureId,
      signerName,
      signerEmail,
      signerPhone,
      documentName,
      documentHash,
      selfieUrl,
      signatureUrl,
      signedAt,
      signerIp,
      signerDevice,
      signerBrowser,
      signerOs,
      deviceType,
      otpChannel,
    } = await parseJsonBody<Record<string, string | null>>(req);

    if (!signatureId) {
      return errorResponse("signatureId is required", 400);
    }

    const supabase = createServiceClient();

    const signedDate = new Date(signedAt);
    const verificationChannel = otpChannel === "whatsapp" ? "WhatsApp" : "E-mail";
    const dateStr = signedDate.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZone: "America/Sao_Paulo",
    });

    // Build receipt HTML content
    const receiptHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="font-size: 22px; color: #1a1a1a; margin: 0;">COMPROVANTE DE ASSINATURA ELETRÔNICA</h1>
          <p style="color: #666; font-size: 12px; margin-top: 8px;">Conforme Lei 14.063/2020 - Assinatura Eletrônica Avançada</p>
        </div>

        <hr style="border: none; border-top: 2px solid #1a1a1a; margin: 20px 0;" />

        <h2 style="font-size: 16px; color: #333;">Documento</h2>
        <p style="margin: 4px 0;"><strong>Nome:</strong> ${documentName || "N/A"}</p>
        <p style="margin: 4px 0;"><strong>Hash SHA-256:</strong></p>
        <p style="margin: 4px 0; font-family: monospace; font-size: 11px; word-break: break-all; background: #f5f5f5; padding: 8px; border-radius: 4px;">${documentHash || "N/A"}</p>

        <h2 style="font-size: 16px; color: #333; margin-top: 24px;">Signatário</h2>
        <p style="margin: 4px 0;"><strong>Nome:</strong> ${signerName || "N/A"}</p>
        <p style="margin: 4px 0;"><strong>E-mail:</strong> ${signerEmail || "N/A"}</p>
        <p style="margin: 4px 0;"><strong>Telefone:</strong> ${signerPhone || "N/A"}</p>

        <h2 style="font-size: 16px; color: #333; margin-top: 24px;">Pontos de Autenticação</h2>
        <p style="margin: 4px 0;"><strong>Data e hora:</strong> ${dateStr} (UTC-0300)</p>
        <p style="margin: 4px 0;"><strong>IP:</strong> ${signerIp || "N/A"}</p>
        <p style="margin: 4px 0;"><strong>Navegador:</strong> ${signerBrowser || "N/A"}</p>
        <p style="margin: 4px 0;"><strong>Sistema operacional:</strong> ${signerOs || "N/A"}</p>
        <p style="margin: 4px 0;"><strong>Tipo de dispositivo:</strong> ${deviceType || "N/A"}</p>
        <p style="margin: 4px 0;"><strong>Dispositivo (UA):</strong> ${signerDevice || "N/A"}</p>
        <p style="margin: 4px 0;"><strong>Verificação:</strong> Código OTP validado por ${verificationChannel}</p>

        <h2 style="font-size: 16px; color: #333; margin-top: 24px;">Evidências</h2>
        
        <div style="display: flex; gap: 20px; margin-top: 12px;">
          <div>
            <p style="font-size: 12px; color: #666; margin-bottom: 4px;">Selfie do signatário:</p>
            ${selfieUrl ? `<img src="${selfieUrl}" style="width: 150px; height: 150px; object-fit: cover; border-radius: 8px; border: 1px solid #ddd;" />` : "<p>N/A</p>"}
          </div>
          <div>
            <p style="font-size: 12px; color: #666; margin-bottom: 4px;">Assinatura manuscrita:</p>
            ${signatureUrl ? `<img src="${signatureUrl}" style="max-width: 200px; height: 80px; object-fit: contain; border: 1px solid #ddd; border-radius: 4px; background: white;" />` : "<p>N/A</p>"}
          </div>
        </div>

        <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;" />

        <div style="text-align: center;">
          <p style="font-size: 11px; color: #999;">
            Documento assinado eletronicamente conforme MP 2.200-2/2001 e Lei 14.063/2020.
          </p>
          <p style="font-size: 11px; color: #999;">
            ID da assinatura: ${signatureId}
          </p>
        </div>
      </div>
    `;

    // Store receipt HTML as a simple file (could be enhanced with PDF generation)
    const receiptFileName = `signatures/${signatureId}/receipt_${Date.now()}.html`;
    const encoder = new TextEncoder();
    const receiptBuffer = encoder.encode(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Comprovante de Assinatura</title></head><body>${receiptHtml}</body></html>`);

    const { error: uploadError } = await supabase.storage
      .from("contact-files")
      .upload(receiptFileName, receiptBuffer, { contentType: "text/html", upsert: true });

    if (uploadError) {
      console.error("Error uploading receipt:", uploadError);
      return errorResponse("Erro ao salvar comprovante", 500);
    }

    const { data: { publicUrl: receiptUrl } } = supabase.storage
      .from("contact-files")
      .getPublicUrl(receiptFileName);

    // Update evidence with receipt URL
    await supabase
      .from("signature_evidence")
      .update({ receipt_pdf_url: receiptUrl })
      .eq("signature_id", signatureId);

    return jsonResponse({ success: true, receiptUrl });
  } catch (error) {
    console.error("Error in signature-receipt:", error);
    return errorResponse(error.message || "Erro interno", 500);
  }
});
