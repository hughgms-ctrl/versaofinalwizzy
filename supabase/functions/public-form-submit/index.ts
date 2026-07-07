const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

import { createClient } from "npm:@supabase/supabase-js@2";
import { sendWhatsAppMessage } from "../_shared/whatsappProvider.ts";
import { getClientIp, checkRateLimitDb } from "../_shared/middleware.ts";

const normalizeKey = (value: string) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

function pickValue(data: Record<string, any>, aliases: string[] = []): string {
  const wanted = aliases.map(normalizeKey);
  for (const [key, value] of Object.entries(data || {})) {
    const text = String(value ?? "").trim();
    if (!text) continue;
    const normalized = normalizeKey(key);
    if (wanted.some((alias) => normalized.includes(alias) || alias.includes(normalized))) return text;
  }
  return "";
}

const PUBLIC_APP_ORIGIN = "https://wizzybr.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { template_id, filled_data, document_name, logo_url, auto_send_whatsapp, signer_name, signer_phone } = await req.json();

    if (!template_id || !filled_data) {
      return new Response(JSON.stringify({ error: "template_id and filled_data are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Rate limit por IP (anti-spam de submissões públicas de formulário).
    const ip = getClientIp(req);
    if (!(await checkRateLimitDb(supabase, ip, { bucket: "public-form-submit", maxRequests: 20, windowSeconds: 60 }))) {
      return new Response(JSON.stringify({ error: "Muitas solicitações. Aguarde um momento e tente novamente." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: template, error: tErr } = await supabase
      .from("document_templates")
      .select("content, content_html, logo_url, fields, organization_id, name, auto_send_whatsapp, default_signers")
      .eq("id", template_id)
      .maybeSingle();

    if (tErr || !template) {
      return new Response(JSON.stringify({ error: "Template not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve logo: explicit override > template logo > organization logo
    let resolvedLogo: string | null = logo_url || (template as any).logo_url || null;
    if (!resolvedLogo) {
      const { data: org } = await supabase
        .from("organizations")
        .select("logo_url")
        .eq("id", template.organization_id)
        .maybeSingle();
      resolvedLogo = org?.logo_url || null;
    }

    const pdfResp = await fetch(`${supabaseUrl}/functions/v1/generate-document-pdf`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        template_content: template.content,
        template_content_html: (template as any).content_html ?? null,
        fields: (template as any).fields ?? [],
        filled_data,
        document_name: document_name || template.name,
        logo_url: resolvedLogo,
      }),
    });

    const pdfData = await pdfResp.json();
    if (!pdfResp.ok || !pdfData.pdf_url) {
      throw new Error(pdfData.error || "PDF generation failed");
    }

    // Extract filler info from filled_data (fallback to body params)
    const fillerName = (signer_name && String(signer_name).trim())
      || pickValue(filled_data, ["nome completo", "nome", "cliente", "contratante", "signatario"]);
    const fillerEmail = pickValue(filled_data, ["email", "e-mail", "correio eletronico"]);
    const fillerPhoneRaw = (signer_phone && String(signer_phone))
      || pickValue(filled_data, ["whatsapp", "telefone", "celular", "phone"]);
    const fillerPhone = fillerPhoneRaw ? String(fillerPhoneRaw).replace(/\D/g, "") : "";
    const fillerCpf = pickValue(filled_data, ["cpf", "documento", "doc"]);

    // 1) Insert generated_document
    const nowIso = new Date().toISOString();
    const { data: createdDoc, error: insertErr } = await supabase
      .from("generated_documents")
      .insert({
        organization_id: template.organization_id,
        template_id,
        name: document_name || template.name,
        filled_data,
        pdf_url: pdfData.pdf_url,
        status: "generated",
        signing_status: "pending",
        signing_method: "internal",
        source_kind: "template_public_link",
        form_filled_at: nowIso,
        is_filled: true,
        submitted_by: fillerName || fillerPhone ? {
          name: fillerName || null,
          phone: fillerPhone || null,
          email: fillerEmail || null,
          submitted_at: nowIso,
        } : null,
      })
      .select("id")
      .single();

    if (insertErr || !createdDoc) {
      throw new Error("Falha ao registrar documento: " + (insertErr?.message || ""));
    }

    const documentId = createdDoc.id;

    // 2) Load fixed signers from template
    const { data: fixedSigners } = await supabase
      .from("template_fixed_signers")
      .select("signer_name, signer_email, signer_phone, signer_cpf, signer_role, auth_methods, order")
      .eq("template_id", template_id)
      .order("order", { ascending: true });

    // 3) Build the list: filler first (if has any data), then fixed signers
    type SignerRow = {
      organization_id: string;
      generated_document_id: string;
      signer_name: string;
      signer_email: string | null;
      signer_phone: string | null;
      signer_cpf: string | null;
      signer_role: string;
      signing_method: string;
      auth_methods: any;
      signature_token: string;
      order: number;
      status: string;
      data_source: string;
    };

    const rows: SignerRow[] = [];
    let fillerToken: string | null = null;
    const configuredSigners = Array.isArray((template as any).default_signers)
      ? (template as any).default_signers
      : [];

    if (configuredSigners.length === 0 && (fillerName || fillerEmail || fillerPhone)) {
      fillerToken = crypto.randomUUID();
      rows.push({
        organization_id: template.organization_id,
        generated_document_id: documentId,
        signer_name: fillerName || "Signatário",
        signer_email: fillerEmail || null,
        signer_phone: fillerPhone || null,
        signer_cpf: fillerCpf || null,
        signer_role: "Quem preencheu",
        signing_method: "internal",
        auth_methods: {
          manuscrita: true,
          otp_email: !!fillerEmail,
          otp_whatsapp: !fillerEmail && !!fillerPhone,
          selfie: true,
        },
        signature_token: fillerToken,
        order: 0,
        status: "pending",
        data_source: "form",
      });
    }

    if (configuredSigners.length === 0) (fixedSigners || []).forEach((fs: any, idx: number) => {
      rows.push({
        organization_id: template.organization_id,
        generated_document_id: documentId,
        signer_name: fs.signer_name,
        signer_email: fs.signer_email || null,
        signer_phone: fs.signer_phone || null,
        signer_cpf: fs.signer_cpf || null,
        signer_role: fs.signer_role || "Assinar",
        signing_method: "internal",
        auth_methods: fs.auth_methods || { manuscrita: true, otp_email: true, selfie: true },
        signature_token: crypto.randomUUID(),
        order: (rows.length > 0 ? 1 : 0) + idx,
        status: "pending",
        data_source: "manual",
      });
    });

    configuredSigners.forEach((s: any, idx: number) => {
      const source = s.data_source || "manual";
      const mapping = s.field_mapping || {};
      const signerToken = crypto.randomUUID();
      if (source === "form" && !fillerToken) fillerToken = signerToken;
      const mappedName = source === "form"
        ? pickValue(filled_data, mapping.name ? [mapping.name] : ["nome completo", "nome", "cliente", "contratante", "signatario"])
        : s.signer_name;
      const mappedEmail = source === "form"
        ? pickValue(filled_data, mapping.email ? [mapping.email] : ["email", "e-mail", "correio eletronico"])
        : s.signer_email;
      const mappedPhone = source === "form"
        ? pickValue(filled_data, mapping.phone ? [mapping.phone] : ["whatsapp", "telefone", "celular", "phone"])
        : s.signer_phone;
      const mappedCpf = source === "form"
        ? pickValue(filled_data, mapping.cpf ? [mapping.cpf] : ["cpf", "documento", "doc"])
        : s.signer_cpf;

      rows.push({
        organization_id: template.organization_id,
        generated_document_id: documentId,
        signer_name: mappedName || s.signer_name || "Signatario",
        signer_email: mappedEmail || null,
        signer_phone: mappedPhone ? String(mappedPhone).replace(/\D/g, "") : null,
        signer_cpf: mappedCpf || null,
        signer_role: s.signer_role || "Assinar",
        signing_method: "internal",
        auth_methods: s.auth_methods || { manuscrita: true, otp_email: true, selfie: true },
        signature_token: signerToken,
        order: idx,
        status: "pending",
        data_source: source,
      });
    });

    // 4) Insert signers + bridged signatures (so they appear in the Assinaturas list right away)
    if (rows.length > 0) {
      const { data: insertedSigners } = await supabase
        .from("document_signers")
        .insert(rows)
        .select("id, signature_token, signer_name, signer_email, signer_phone, signer_cpf, auth_methods");

      // Create bridged document_signatures so SignaturesList shows pending entries immediately
      for (const s of insertedSigners || []) {
        const auth = (s.auth_methods || {}) as Record<string, boolean>;
        const otpChannels: string[] = [];
        if (auth.otp_email) otpChannels.push("email");
        if (auth.otp_whatsapp) otpChannels.push("whatsapp");
        if (otpChannels.length === 0) {
          if (s.signer_email) otpChannels.push("email");
          else if (s.signer_phone) otpChannels.push("whatsapp");
        }
        const { data: sig } = await supabase
          .from("document_signatures")
          .insert({
            organization_id: template.organization_id,
            generated_document_id: documentId,
            signing_method: "internal",
            signer_name: s.signer_name,
            signer_email: s.signer_email,
            signer_phone: s.signer_phone,
            signer_cpf: s.signer_cpf,
            signature_token: s.signature_token,
            status: "pending",
            metadata: {
              require_selfie: auth.selfie === true,
              otp_channel: otpChannels[0] || "email",
              otp_channels: otpChannels.length ? otpChannels : ["email"],
              auth_methods: auth,
              from_signer_id: s.id,
            },
          })
          .select("id")
          .single();
        if (sig?.id) {
          await supabase.from("document_signers").update({ signature_id: sig.id }).eq("id", s.id);
        }
      }
    }

    // 5) WhatsApp opcional (mantém comportamento existente)
    let whatsappSent = false;
    if ((auto_send_whatsapp || template.auto_send_whatsapp) && fillerPhone) {
      let normalizedPhone = fillerPhone;
      if (!normalizedPhone.startsWith('55')) normalizedPhone = `55${normalizedPhone}`;

      try {
        const sendResult = await sendWhatsAppMessage(supabase, {
          organizationId: template.organization_id,
          phone: normalizedPhone,
          type: "document",
          mediaUrl: pdfData.pdf_url,
          caption: `Documento - ${document_name || template.name}\n\nSegue seu documento:`,
        });
        whatsappSent = sendResult.ok;
        if (!sendResult.ok) {
          console.error("public-form-submit whatsapp error:", sendResult.responseText);
        }
      } catch (sendError) {
        console.error("public-form-submit whatsapp error:", sendError);
      }

    }

    const signatureToken = fillerToken || rows[0]?.signature_token || null;
    const signatureUrl = signatureToken ? `${PUBLIC_APP_ORIGIN}/sign/${signatureToken}` : null;

    return new Response(JSON.stringify({
      pdf_url: pdfData.pdf_url,
      whatsapp_sent: whatsappSent,
      document_id: documentId,
      signature_url: signatureUrl,
      signature_token: signatureToken,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("public-form-submit error:", e instanceof Error ? (e.stack || e.message) : e);
    return new Response(
      JSON.stringify({ error: "Erro interno. Tente novamente." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
