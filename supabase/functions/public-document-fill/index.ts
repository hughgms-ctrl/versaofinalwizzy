import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, jsonResponse, errorResponse, createServiceClient, parseJsonBody } from "../_shared/middleware.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const supabase = createServiceClient();

    // GET /public-document-fill?token=xxx → load doc + template fields
    if (req.method === "GET") {
      const token = url.searchParams.get("token");
      if (!token) return errorResponse("token is required", 400);

      const { data: doc, error } = await (supabase as any)
        .from("generated_documents")
        .select(`
          id,
          name,
          status,
          is_filled,
          filled_data,
          template_id,
          pack_id,
          fill_mode
        `)
        .eq("public_fill_token", token)
        .maybeSingle();

      if (error || !doc) return errorResponse("Documento não encontrado", 404);
      if (doc.is_filled) return errorResponse("Este documento já foi preenchido", 410);

      // Fetch template fields if applicable
      let template = null;
      if (doc.template_id) {
        const { data: t } = await (supabase as any)
          .from("document_templates")
          .select("name, content_html, content, fields, logo_url")
          .eq("id", doc.template_id)
          .maybeSingle();
        template = t;
      }

      // For pack: collect all docs with same pack_id and same fill token group
      let packDocs: any[] = [];
      if (doc.pack_id) {
        const { data: pack } = await (supabase as any)
          .from("document_packs")
          .select("name, template_ids")
          .eq("id", doc.pack_id)
          .maybeSingle();

        const { data: docs } = await (supabase as any)
          .from("generated_documents")
          .select("id, name, template_id, filled_data")
          .eq("pack_id", doc.pack_id)
          .eq("public_fill_token", token);

        if (docs && docs.length > 0) {
          const tplIds = [...new Set(docs.map((d: any) => d.template_id).filter(Boolean))];
          const { data: tpls } = await (supabase as any)
            .from("document_templates")
            .select("id, name, fields")
            .in("id", tplIds);
          packDocs = docs.map((d: any) => ({
            ...d,
            template: tpls?.find((t: any) => t.id === d.template_id) || null,
          }));
        }
      }

      return jsonResponse({
        success: true,
        document: { ...doc, template },
        pack_documents: packDocs,
      });
    }

    // POST /public-document-fill → submit filled data
    if (req.method === "POST") {
      const body = await parseJsonBody<{ token: string; filled_data: Record<string, any>; pack_filled_data?: Record<string, Record<string, any>> }>(req);
      if (!body.token) return errorResponse("token is required", 400);

      const { data: doc, error: fetchErr } = await (supabase as any)
        .from("generated_documents")
        .select("id, pack_id, is_filled, organization_id, signature_config")
        .eq("public_fill_token", body.token)
        .maybeSingle();

      if (fetchErr || !doc) return errorResponse("Documento não encontrado", 404);
      if (doc.is_filled) return errorResponse("Já preenchido", 410);

      // Update single doc OR all docs in the pack
      const docIds: string[] = [];
      if (doc.pack_id && body.pack_filled_data) {
        for (const [docId, data] of Object.entries(body.pack_filled_data)) {
          await (supabase as any)
            .from("generated_documents")
            .update({ filled_data: data, is_filled: true, status: 'generated' })
            .eq("id", docId)
            .eq("pack_id", doc.pack_id);
          docIds.push(docId);
        }
      } else {
        await (supabase as any)
          .from("generated_documents")
          .update({ filled_data: body.filled_data, is_filled: true, status: 'generated' })
          .eq("id", doc.id);
        docIds.push(doc.id);
      }

      // Find first signer for these documents to redirect to signature page
      let signatureToken: string | null = null;
      try {
        const { data: signers } = await (supabase as any)
          .from("document_signers")
          .select("signature_token, order")
          .in("generated_document_id", docIds)
          .eq("status", "pending")
          .order("order", { ascending: true })
          .limit(1);
        if (signers && signers.length > 0) {
          signatureToken = signers[0].signature_token;
        }
      } catch (e) {
        console.warn("Could not fetch signers:", e);
      }

      return jsonResponse({
        success: true,
        document_id: doc.id,
        signature_token: signatureToken,
        signature_url: signatureToken ? `/sign/${signatureToken}` : null,
      });
    }

    return errorResponse("Method not allowed", 405);
  } catch (e: any) {
    console.error("public-document-fill error", e);
    return errorResponse(e.message || "Internal error", 500);
  }
});
