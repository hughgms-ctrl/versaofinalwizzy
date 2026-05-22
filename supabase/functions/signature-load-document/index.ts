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

    // Helper: ensure a generated_document has a usable pdf_url.
    // If missing but the doc is already filled, ask generate-document-pdf to build it.
    const ensurePdf = async (d: any) => {
      if (!d || d.pdf_url) return d;
      if (!d.is_filled) return d;
      try {
        await (supabase as any).functions.invoke("generate-document-pdf", {
          body: { generated_document_id: d.id },
        });
        const { data: refreshed } = await supabase
          .from("generated_documents")
          .select("id, name, pdf_url, status, pack_id, is_filled, submission_group")
          .eq("id", d.id)
          .maybeSingle();
        return refreshed || d;
      } catch (err) {
        console.warn("[signature-load-document] PDF generation fallback failed for", d.id, err);
        return d;
      }
    };

    // Load the related generated document for preview
    const { data: docRaw } = await supabase
      .from("generated_documents")
      .select("id, name, pdf_url, status, pack_id, is_filled, submission_group")
      .eq("id", resolved.generated_document_id)
      .maybeSingle();
    const doc = await ensurePdf(docRaw);

    // If this document belongs to a pack, load all sibling documents in that pack
    // so the signer can review every document before signing.
    let packDocuments: any[] = [];
    let packName: string | null = null;
    if (doc?.pack_id) {
      const { data: pack } = await supabase
        .from("document_packs")
        .select("name")
        .eq("id", doc.pack_id)
        .maybeSingle();
      packName = pack?.name || null;

      let siblingsQuery = supabase
        .from("generated_documents")
        .select("id, name, pdf_url, status, is_filled, submission_group")
        .eq("pack_id", doc.pack_id)
        .order("created_at", { ascending: true });
      if (doc.submission_group) {
        siblingsQuery = siblingsQuery.eq("submission_group", doc.submission_group);
      }
      const { data: siblings } = await siblingsQuery;
      const ensured = await Promise.all((siblings || []).map((d: any) => ensurePdf(d)));
      packDocuments = ensured.filter((d: any) => !!d.pdf_url);
    }

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
      pack: doc?.pack_id
        ? { id: doc.pack_id, name: packName, documents: packDocuments }
        : null,
    };

    return jsonResponse({ success: true, signature });
  } catch (error) {
    console.error("Error in signature-load-document:", error);
    return errorResponse(error.message || "Erro interno", 500);
  }
});
