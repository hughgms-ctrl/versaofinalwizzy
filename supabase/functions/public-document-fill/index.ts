import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, jsonResponse, errorResponse, createServiceClient, parseJsonBody } from "../_shared/middleware.ts";

const normalizeKey = (value: string) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

function pickSubmittedValue(data: Record<string, any>, mappedKey?: string, aliases: string[] = []) {
  if (mappedKey && data[mappedKey] != null && String(data[mappedKey]).trim()) return String(data[mappedKey]).trim();
  const wanted = aliases.map(normalizeKey);
  for (const [key, value] of Object.entries(data || {})) {
    const text = String(value ?? "").trim();
    if (!text) continue;
    const normalized = normalizeKey(key);
    if (wanted.some((alias) => normalized.includes(alias) || alias.includes(normalized))) return text;
  }
  return "";
}

function otpChannelsForSigner(signer: any) {
  const auth = (signer.auth_methods || {}) as Record<string, boolean>;
  const channels: string[] = [];
  if (auth.otp_email) channels.push("email");
  if (auth.otp_whatsapp) channels.push("whatsapp");
  if (channels.length === 0) {
    if (signer.signer_email) channels.push("email");
    else if (signer.signer_phone) channels.push("whatsapp");
    else channels.push("email");
  }
  return channels;
}

async function ensureSignatureForSigner(supabase: any, signer: any) {
  const channels = otpChannelsForSigner(signer);
  const metadata = {
    ...(signer.metadata || {}),
    require_selfie: signer.auth_methods?.selfie === true,
    otp_channel: channels[0],
    otp_channels: channels,
    auth_methods: signer.auth_methods || { manuscrita: true },
    from_signer_id: signer.id,
  };

  const patch = {
    signer_name: signer.signer_name,
    signer_email: signer.signer_email || null,
    signer_phone: signer.signer_phone || null,
    signer_cpf: signer.signer_cpf || null,
    metadata,
  };

  if (signer.signature_id) {
    await supabase
      .from("document_signatures")
      .update(patch)
      .eq("id", signer.signature_id);
    return signer.signature_id;
  }

  const { data: created, error } = await supabase
    .from("document_signatures")
    .insert({
      organization_id: signer.organization_id,
      generated_document_id: signer.generated_document_id,
      signing_method: signer.signing_method || "internal",
      signature_token: signer.signature_token,
      status: signer.status === "signed" ? "signed" : "pending",
      ...patch,
    })
    .select("id")
    .single();

  if (error || !created) {
    console.error("Could not create bridged signature:", error);
    return null;
  }

  await supabase
    .from("document_signers")
    .update({ signature_id: created.id })
    .eq("id", signer.id);
  return created.id;
}

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
        .order("created_at", { ascending: true })
        .limit(1)
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
      let pack: any = null;
      if (doc.pack_id) {
        const { data: packData } = await (supabase as any)
          .from("document_packs")
          .select("name, template_ids, field_config")
          .eq("id", doc.pack_id)
          .maybeSingle();
        pack = packData;

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
        document: { ...doc, template, pack_field_config: pack?.field_config || [] },
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
        .order("created_at", { ascending: true })
        .limit(1)
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

      // Auto-fill "form" signers from the submitted data using their field_mapping.
      // Build a merged data object from all docs (pack-aware).
      const mergedData: Record<string, any> = { ...(body.filled_data || {}) };
      if (body.pack_filled_data) {
        for (const data of Object.values(body.pack_filled_data)) {
          Object.assign(mergedData, data || {});
        }
      }

      // Track which signer (by signature_token) corresponds to the person filling the form.
      let fillerSignerToken: string | null = null;

      try {
        const { data: formSigners } = await (supabase as any)
          .from("document_signers")
          .select("id, signature_token, signature_id, field_mapping, signer_name, signer_email, signer_phone, signer_cpf")
          .in("generated_document_id", docIds)
          .eq("data_source", "form");

        for (const s of formSigners || []) {
          const m = s.field_mapping || {};
          const patch: Record<string, any> = {};
          const name = pickSubmittedValue(mergedData, m.name, ["nome completo", "nome", "cliente", "contratante", "signatario"]);
          const email = pickSubmittedValue(mergedData, m.email, ["email", "e-mail", "correio eletronico"]);
          const phone = pickSubmittedValue(mergedData, m.phone, ["whatsapp", "telefone", "celular", "phone"]);
          const cpf = pickSubmittedValue(mergedData, m.cpf, ["cpf", "documento", "doc"]);
          if (name) patch.signer_name = name;
          if (email) patch.signer_email = email;
          if (phone) patch.signer_phone = phone;
          if (cpf) patch.signer_cpf = cpf;
          if (Object.keys(patch).length > 0) {
            await (supabase as any)
              .from("document_signers")
              .update(patch)
              .eq("id", s.id);
            if (s.signature_id) {
              await (supabase as any)
                .from("document_signatures")
                .update(patch)
                .eq("id", s.signature_id);
            }
            // The first form-signer that received data IS the person filling.
            if (!fillerSignerToken) fillerSignerToken = s.signature_token;
          }
        }
      } catch (e) {
        console.warn("Could not auto-fill form signers:", e);
      }

      // Ensure every configured signer has a document_signatures row now.
      // The dashboard is based on document_signatures, so without this only the
      // signer who opens /sign would appear.
      try {
        const { data: allSigners } = await (supabase as any)
          .from("document_signers")
          .select("id, organization_id, generated_document_id, signature_token, signature_id, signing_method, status, signer_name, signer_email, signer_phone, signer_cpf, auth_methods, metadata")
          .in("generated_document_id", docIds)
          .order("order", { ascending: true });

        for (const signer of allSigners || []) {
          await ensureSignatureForSigner(supabase, signer);
        }
      } catch (e) {
        console.warn("Could not ensure signatures for signers:", e);
      }

      // Generate PDFs for every filled doc so signers can preview them.
      // Run in parallel; ignore individual failures (signature page also has a fallback).
      try {
        await Promise.all(
          docIds.map((id) =>
            (supabase as any).functions
              .invoke("generate-document-pdf", { body: { generated_document_id: id } })
              .catch((err: any) =>
                console.warn("PDF generation failed for", id, err?.message),
              ),
          ),
        );
      } catch (e) {
        console.warn("Batch PDF generation error:", e);
      }

      // Decide where to send the user next.
      // Priority:
      //   1. If the filler matches a "form" signer → use that signer's token.
      //   2. Otherwise → use the FIRST pending signer's token (so the flow
      //      always advances to the signature step instead of stopping).
      //   3. If there are no signers at all → fall back to the success screen.
      let signatureToken: string | null = fillerSignerToken;
      try {
        const { data: signers } = await (supabase as any)
          .from("document_signers")
          .select("signature_token, status, order")
          .in("generated_document_id", docIds)
          .eq("status", "pending")
          .order("order", { ascending: true });

        if (!signatureToken && signers && signers.length > 0) {
          signatureToken = signers[0].signature_token as string;
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
