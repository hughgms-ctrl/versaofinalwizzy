const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendWhatsAppMessage } from "../_shared/whatsappProvider.ts";

const PUBLIC_APP_ORIGIN = "https://wizzybr.com";

const normalizeKey = (value: string) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

function pickSubmittedValue(data: Record<string, any>, mappedKey?: string, aliases: string[] = []) {
  if (mappedKey && data[mappedKey] != null && String(data[mappedKey]).trim()) {
    return String(data[mappedKey]).trim();
  }
  const wanted = aliases.map(normalizeKey);
  for (const [key, value] of Object.entries(data || {})) {
    const text = String(value ?? "").trim();
    if (!text) continue;
    const normalized = normalizeKey(key);
    if (wanted.some((alias) => normalized.includes(alias) || alias.includes(normalized))) return text;
  }
  return "";
}

function normalizePhone(value: string | null | undefined) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.startsWith("55") ? digits : `55${digits}`;
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { action, token } = body;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (!token) {
      return new Response(JSON.stringify({ error: "Token e obrigatorio" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: pack, error: packErr } = await supabase
      .from("document_packs")
      .select("id, name, description, template_ids, field_config, organization_id, default_signers")
      .eq("public_token", token)
      .maybeSingle();

    if (packErr || !pack) {
      return new Response(JSON.stringify({ error: "Formulario nao encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "get") {
      const { data: org } = await supabase
        .from("organizations")
        .select("name, logo_url")
        .eq("id", pack.organization_id)
        .maybeSingle();

      const { data: fullPack } = await supabase
        .from("document_packs")
        .select("auto_send_whatsapp")
        .eq("id", pack.id)
        .maybeSingle();

      return new Response(JSON.stringify({
        id: pack.id,
        name: pack.name,
        description: pack.description,
        template_ids: pack.template_ids,
        field_config: pack.field_config || [],
        organization: org,
        template_count: pack.template_ids?.length || 0,
        auto_send_whatsapp: fullPack?.auto_send_whatsapp || false,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    async function sendSignatureLinkViaWhatsApp(
      phone: string,
      packName: string,
      signatureUrl: string,
      organizationId: string,
    ): Promise<boolean> {
      try {
        const response = await sendWhatsAppMessage(supabase, {
          organizationId,
          phone,
          type: "text",
          text: `Assinatura solicitada - ${packName}\n\nRevise e assine seus documentos neste link:\n${signatureUrl}`,
        });

        if (!response.ok) {
          console.error("WhatsApp signature-link error:", response.responseText);
          return false;
        }
        return true;
      } catch (e) {
        console.error("WhatsApp signature-link error:", e);
        return false;
      }
    }

    async function createSignatureForSigner(signer: any, docId: string) {
      const channels = otpChannelsForSigner(signer);
      const { data: sig } = await supabase
        .from("document_signatures")
        .insert({
          organization_id: pack.organization_id,
          generated_document_id: docId,
          signing_method: "internal",
          signer_name: signer.signer_name,
          signer_email: signer.signer_email || null,
          signer_phone: signer.signer_phone || null,
          signer_cpf: signer.signer_cpf || null,
          signature_token: signer.signature_token,
          status: "pending",
          metadata: {
            ...(signer.metadata || {}),
            require_selfie: signer.auth_methods?.selfie === true,
            otp_channel: channels[0],
            otp_channels: channels,
            auth_methods: signer.auth_methods || { manuscrita: true },
            from_signer_id: signer.id,
          },
        })
        .select("id")
        .single();

      if (sig?.id) {
        await supabase.from("document_signers").update({ signature_id: sig.id }).eq("id", signer.id);
      }
    }

    if (action === "submit") {
      const { filled_data, signer_name, signer_phone, auto_send_whatsapp } = body;
      if (!filled_data) {
        return new Response(JSON.stringify({ error: "Dados do formulario sao obrigatorios" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const configuredSigners = Array.isArray((pack as any).default_signers) ? (pack as any).default_signers : [];
      if (configuredSigners.length === 0 && (!signer_name || !signer_phone)) {
        return new Response(JSON.stringify({ error: "Configure os signatarios do pack antes de usar o link publico" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const normalizedPhone = normalizePhone(signer_phone);
      const fillerName = signer_name?.trim() || pickSubmittedValue(filled_data, undefined, ["nome completo", "nome", "cliente", "contratante", "signatario"]);
      const submissionGroup = `${pack.id}_${Date.now()}`;
      const nowIso = new Date().toISOString();
      const submittedBy = {
        name: fillerName || null,
        phone: normalizedPhone || null,
        submitted_at: nowIso,
      };

      let contactId: string | null = null;
      let conversationId: string | null = null;

      const { data: existingContact } = normalizedPhone
        ? await supabase
          .from("contacts")
          .select("id")
          .eq("organization_id", pack.organization_id)
          .eq("phone", normalizedPhone)
          .maybeSingle()
        : { data: null };

      if (existingContact) {
        contactId = existingContact.id;
        const { data: conv } = await supabase
          .from("conversations")
          .select("id")
          .eq("contact_id", contactId)
          .eq("organization_id", pack.organization_id)
          .order("last_message_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        conversationId = conv?.id || null;
      }

      const { data: templates } = await supabase
        .from("document_templates")
        .select("id, name, fields, content, content_html, logo_url")
        .in("id", pack.template_ids || []);

      if (!templates || templates.length === 0) {
        return new Response(JSON.stringify({ error: "Templates nao encontrados" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const fieldConfig = (pack.field_config as any[]) || [];
      const fieldValueMap = new Map<string, Map<string, string>>();

      for (const fc of fieldConfig) {
        const formValue = filled_data[fc.originalName] || "";
        const mappings = fc.mappedFields && fc.mappedFields.length > 0
          ? fc.mappedFields
          : (fc.sourceTemplateIds || []).map((tid: string) => ({ fieldName: fc.originalName, templateId: tid }));

        for (const m of mappings) {
          if (!fieldValueMap.has(m.templateId)) fieldValueMap.set(m.templateId, new Map());
          fieldValueMap.get(m.templateId)!.set(m.fieldName, formValue);
        }
      }

      const results = [];
      for (const template of templates) {
        const templateFields = (template.fields as any[]) || [];
        const templateData: Record<string, string> = {};
        const tplMap = fieldValueMap.get(template.id);

        templateFields.forEach((field: any) => {
          const name = field.name || field;
          templateData[name] = tplMap?.get(name) ?? filled_data[name] ?? "";
        });

        const docName = `${pack.name} - ${template.name}${fillerName ? ` - ${fillerName}` : ""}`;

        const { data: doc, error: docErr } = await supabase
          .from("generated_documents")
          .insert({
            organization_id: pack.organization_id,
            template_id: template.id,
            pack_id: pack.id,
            contact_id: contactId,
            conversation_id: conversationId,
            name: docName,
            filled_data: templateData,
            status: "generated",
            signing_status: "pending",
            signing_method: "internal",
            fill_mode: "public",
            is_filled: true,
            source_kind: "pack_public_link",
            form_filled_at: nowIso,
            submitted_by: submittedBy,
            submission_group: submissionGroup,
          })
          .select("id")
          .single();

        if (docErr || !doc) {
          console.error("Error creating document:", docErr);
          continue;
        }

        let pdfUrl: string | null = null;
        try {
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
              filled_data: templateData,
              document_name: docName,
              logo_url: (template as any).logo_url ?? null,
            }),
          });

          const pdfData = await pdfResp.json();
          if (pdfResp.ok && pdfData.pdf_url) {
            pdfUrl = pdfData.pdf_url;
            await supabase.from("generated_documents").update({ pdf_url: pdfUrl }).eq("id", doc.id);
          }
        } catch (pdfErr) {
          console.error("PDF generation error:", pdfErr);
        }

        results.push({
          id: doc.id,
          name: docName,
          pdf_url: pdfUrl,
          template_name: template.name,
        });
      }

      const baseSigners = configuredSigners.length > 0
        ? configuredSigners
        : [{
          signer_name: signer_name.trim(),
          signer_phone: normalizedPhone,
          signer_role: "Quem preencheu",
          auth_methods: { manuscrita: true, otp_whatsapp: true, selfie: true },
          data_source: "form",
          field_mapping: {},
        }];

      const signerRows: any[] = [];
      for (const doc of results) {
        baseSigners.forEach((s: any, idx: number) => {
          const source = s.data_source || "manual";
          const mapping = s.field_mapping || {};
          const signerName = source === "form"
            ? pickSubmittedValue(filled_data, mapping.name, ["nome completo", "nome", "cliente", "contratante", "signatario"]) || signer_name?.trim()
            : s.signer_name;
          const signerEmail = source === "form"
            ? pickSubmittedValue(filled_data, mapping.email, ["email", "e-mail", "correio eletronico"]) || s.signer_email || null
            : s.signer_email || null;
          const signerPhone = source === "form"
            ? pickSubmittedValue(filled_data, mapping.phone, ["whatsapp", "telefone", "celular", "phone"]) || normalizedPhone
            : s.signer_phone || null;
          const signerCpf = source === "form"
            ? pickSubmittedValue(filled_data, mapping.cpf, ["cpf", "documento", "doc"]) || s.signer_cpf || null
            : s.signer_cpf || null;

          signerRows.push({
            organization_id: pack.organization_id,
            generated_document_id: doc.id,
            pack_id: pack.id,
            signer_name: signerName || "Signatario",
            signer_email: signerEmail,
            signer_phone: signerPhone ? normalizePhone(String(signerPhone)) : null,
            signer_cpf: signerCpf,
            signer_role: s.signer_role || "Assinar",
            signing_method: "internal",
            auth_methods: s.auth_methods || { manuscrita: true, otp_whatsapp: true, selfie: true },
            signature_token: crypto.randomUUID(),
            order: idx,
            status: "pending",
            data_source: source,
            field_mapping: mapping,
            metadata: {
              ...(s.metadata || {}),
              pack_submission_group: submissionGroup,
              pack_signer_key: `pack:${pack.id}:submission:${submissionGroup}:signer:${idx}`,
            },
          });
        });
      }

      let signatureToken: string | null = null;
      if (signerRows.length > 0) {
        const { data: insertedSigners, error: signerErr } = await supabase
          .from("document_signers")
          .insert(signerRows)
          .select("id, generated_document_id, signature_token, signer_name, signer_email, signer_phone, signer_cpf, auth_methods, metadata, order, data_source");

        if (signerErr) {
          console.error("Error creating pack signers:", signerErr);
          throw new Error("Falha ao criar assinaturas do pack");
        }

        for (const s of insertedSigners || []) {
          await createSignatureForSigner(s, s.generated_document_id);
        }

        const firstDocId = results[0]?.id;
        const firstDocSigners = (insertedSigners || [])
          .filter((s: any) => s.generated_document_id === firstDocId)
          .sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
        const firstFormSigner = firstDocSigners.find((s: any) => s.data_source === "form");
        signatureToken = firstFormSigner?.signature_token || firstDocSigners[0]?.signature_token || (insertedSigners || [])[0]?.signature_token || null;
      }

      const signatureUrl = signatureToken ? `${PUBLIC_APP_ORIGIN}/sign/${signatureToken}` : null;

      if (conversationId) {
        try {
          const docNames = results.map((r) => `- ${r.template_name}`).join("\n");
          const internalMessage =
            `Formulario de pack preenchido\n\n` +
            `Nome: ${fillerName || "-"}\n` +
            `Telefone: ${normalizedPhone || "-"}\n` +
            `Pack: ${pack.name}\n\n` +
            `Documentos preparados para assinatura:\n${docNames}`;

          await supabase.from("messages").insert({
            conversation_id: conversationId,
            content: internalMessage,
            direction: "outbound",
            is_from_bot: true,
            type: "text",
            metadata: {
              type: "pack_form_submitted",
              pack_id: pack.id,
              pack_name: pack.name,
              signer_name: fillerName || null,
              signer_phone: normalizedPhone || null,
              document_ids: results.map((r) => r.id),
              submission_group: submissionGroup,
              signature_url: signatureUrl,
              is_internal_note: true,
            },
          });

          await supabase.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversationId);
        } catch (msgErr) {
          console.error("Error sending internal message:", msgErr);
        }
      }

      let whatsappSentCount = 0;
      if (auto_send_whatsapp && signatureUrl && normalizedPhone) {
        const sent = await sendSignatureLinkViaWhatsApp(normalizedPhone, pack.name, signatureUrl, pack.organization_id);
        if (sent) whatsappSentCount = 1;
      }

      return new Response(JSON.stringify({
        success: true,
        documents_created: results.length,
        documents: results,
        organization_id: pack.organization_id,
        submission_group: submissionGroup,
        signature_url: signatureUrl,
        signature_token: signatureToken,
        whatsapp_sent: whatsappSentCount,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "send_whatsapp") {
      const { phone, document_ids } = body;

      if (!phone || !document_ids || document_ids.length === 0) {
        return new Response(JSON.stringify({ error: "Telefone e documentos sao obrigatorios" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const normalizedPhone = normalizePhone(phone);

      const { data: docs } = await supabase
        .from("generated_documents")
        .select("id, name")
        .in("id", document_ids)
        .eq("organization_id", pack.organization_id);

      if (!docs || docs.length === 0) {
        return new Response(JSON.stringify({ error: "Documentos nao encontrados" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: signer } = await supabase
        .from("document_signers")
        .select("signature_token")
        .in("generated_document_id", document_ids)
        .neq("status", "signed")
        .order("order", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!signer?.signature_token) {
        return new Response(JSON.stringify({ error: "Nenhum link de assinatura pendente encontrado" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const signatureUrl = `${PUBLIC_APP_ORIGIN}/sign/${signer.signature_token}`;
      const sent = await sendSignatureLinkViaWhatsApp(normalizedPhone, pack.name, signatureUrl, pack.organization_id);

      return new Response(JSON.stringify({
        success: true,
        sent_count: sent ? 1 : 0,
        signature_url: signatureUrl,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Acao invalida" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("public-pack-form error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
