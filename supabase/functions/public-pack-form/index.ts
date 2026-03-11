const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { action, token } = body;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const uazapiBaseUrl = Deno.env.get("UAZAPI_BASE_URL")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (!token) {
      return new Response(JSON.stringify({ error: "Token é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch pack by public_token
    const { data: pack, error: packErr } = await supabase
      .from("document_packs")
      .select("id, name, description, template_ids, field_config, organization_id")
      .eq("public_token", token)
      .maybeSingle();

    if (packErr || !pack) {
      return new Response(JSON.stringify({ error: "Formulário não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // GET action: return pack info for the form
    if (action === "get") {
      const { data: org } = await supabase
        .from("organizations")
        .select("name, logo_url")
        .eq("id", pack.organization_id)
        .maybeSingle();

      // Check if auto_send_whatsapp is enabled
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

    // Helper: get active WhatsApp instance and token for org
    async function getWhatsAppInstance(orgId: string) {
      const { data: instance } = await supabase
        .from("whatsapp_instances")
        .select("id, instance_name, zapi_token")
        .eq("organization_id", orgId)
        .eq("status", "connected")
        .limit(1)
        .maybeSingle();
      return instance;
    }

    // Helper: send document via UAZAPI directly
    async function sendDocumentViaWhatsApp(
      phone: string,
      docName: string,
      pdfUrl: string,
      instanceToken: string
    ): Promise<boolean> {
      try {
        const baseUrl = uazapiBaseUrl.endsWith('/') ? uazapiBaseUrl.slice(0, -1) : uazapiBaseUrl;
        const response = await fetch(`${baseUrl}/send/media`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "token": instanceToken,
          },
          body: JSON.stringify({
            number: phone,
            file: pdfUrl,
            caption: `📄 *${docName}*\n\nSegue seu documento:`,
            type: "document",
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          console.error("UAZAPI send error:", errText);
          return false;
        }
        return true;
      } catch (e) {
        console.error("UAZAPI send error:", e);
        return false;
      }
    }

    // SUBMIT action: generate documents
    if (action === "submit") {
      const { filled_data, signer_name, signer_phone, auto_send_whatsapp } = body;
      if (!filled_data) {
        return new Response(JSON.stringify({ error: "Dados do formulário são obrigatórios" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!signer_name || !signer_phone) {
        return new Response(JSON.stringify({ error: "Nome e telefone são obrigatórios" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Normalize phone
      let normalizedPhone = signer_phone.replace(/\D/g, '');
      if (!normalizedPhone.startsWith('55')) {
        normalizedPhone = '55' + normalizedPhone;
      }

      // Create a submission group ID for grouping docs together
      const submissionGroup = `${pack.id}_${signer_name.trim().replace(/\s+/g, '_')}_${Date.now()}`;

      const submittedBy = {
        name: signer_name.trim(),
        phone: normalizedPhone,
        submitted_at: new Date().toISOString(),
      };

      // Try to find existing contact by phone
      let contactId: string | null = null;
      let conversationId: string | null = null;

      const { data: existingContact } = await supabase
        .from("contacts")
        .select("id")
        .eq("organization_id", pack.organization_id)
        .eq("phone", normalizedPhone)
        .maybeSingle();

      if (existingContact) {
        contactId = existingContact.id;

        // Find conversation for this contact
        const { data: conv } = await supabase
          .from("conversations")
          .select("id")
          .eq("contact_id", contactId)
          .eq("organization_id", pack.organization_id)
          .order("last_message_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (conv) {
          conversationId = conv.id;
        }
      }

      // Get templates
      const { data: templates } = await supabase
        .from("document_templates")
        .select("id, name, fields, content")
        .in("id", pack.template_ids || []);

      if (!templates || templates.length === 0) {
        return new Response(JSON.stringify({ error: "Templates não encontrados" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Build mapping from field_config
      const fieldConfig = (pack.field_config as any[]) || [];
      const fieldValueMap = new Map<string, Map<string, string>>();

      for (const fc of fieldConfig) {
        const formValue = filled_data[fc.originalName] || '';
        const mappings = fc.mappedFields && fc.mappedFields.length > 0
          ? fc.mappedFields
          : (fc.sourceTemplateIds || []).map((tid: string) => ({ fieldName: fc.originalName, templateId: tid }));

        for (const m of mappings) {
          if (!fieldValueMap.has(m.templateId)) {
            fieldValueMap.set(m.templateId, new Map());
          }
          fieldValueMap.get(m.templateId)!.set(m.fieldName, formValue);
        }
      }

      // Generate a document for each template
      const results = [];
      for (const template of templates) {
        const templateFields = (template.fields as any[]) || [];
        const templateData: Record<string, string> = {};
        const tplMap = fieldValueMap.get(template.id);

        templateFields.forEach((field: any) => {
          const name = field.name || field;
          templateData[name] = tplMap?.get(name) ?? filled_data[name] ?? '';
        });

        const docName = `${pack.name} - ${template.name} - ${signer_name.trim()}`;

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
            signing_method: "manual",
            submitted_by: submittedBy,
            submission_group: submissionGroup,
          })
          .select()
          .single();

        if (docErr) {
          console.error("Error creating document:", docErr);
        } else {
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
                filled_data: templateData,
                document_name: docName,
              }),
            });

            const pdfData = await pdfResp.json();
            if (pdfResp.ok && pdfData.pdf_url) {
              pdfUrl = pdfData.pdf_url;
              await supabase
                .from("generated_documents")
                .update({ pdf_url: pdfUrl })
                .eq("id", doc.id);
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
      }

      // Send internal message to conversation if linked
      if (conversationId) {
        try {
          const docNames = results.map(r => `• ${r.template_name}`).join('\n');
          const internalMessage = `📋 *Formulário de pack preenchido*\n\n` +
            `👤 *Nome:* ${signer_name.trim()}\n` +
            `📱 *Telefone:* ${normalizedPhone}\n` +
            `📦 *Pack:* ${pack.name}\n\n` +
            `📄 *Documentos gerados:*\n${docNames}\n\n` +
            `_${results.length} documento(s) gerado(s) automaticamente via formulário público._`;

          await supabase
            .from("messages")
            .insert({
              conversation_id: conversationId,
              content: internalMessage,
              direction: "outbound",
              is_from_bot: true,
              type: "text",
              metadata: {
                type: "pack_form_submitted",
                pack_id: pack.id,
                pack_name: pack.name,
                signer_name: signer_name.trim(),
                signer_phone: normalizedPhone,
                document_ids: results.map(r => r.id),
                submission_group: submissionGroup,
                is_internal_note: true,
              },
            });

          // Update conversation last_message_at
          await supabase
            .from("conversations")
            .update({ last_message_at: new Date().toISOString() })
            .eq("id", conversationId);
        } catch (msgErr) {
          console.error("Error sending internal message:", msgErr);
        }
      }

      // Auto-send via WhatsApp if enabled
      let whatsappSentCount = 0;
      if (auto_send_whatsapp) {
        const instance = await getWhatsAppInstance(pack.organization_id);
        if (instance?.zapi_token) {
          for (const doc of results) {
            if (doc.pdf_url) {
              const sent = await sendDocumentViaWhatsApp(
                normalizedPhone,
                doc.name,
                doc.pdf_url,
                instance.zapi_token
              );
              if (sent) whatsappSentCount++;
            }
          }
        }
      }

      return new Response(JSON.stringify({
        success: true,
        documents_created: results.length,
        documents: results,
        organization_id: pack.organization_id,
        submission_group: submissionGroup,
        whatsapp_sent: whatsappSentCount,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // SEND_WHATSAPP action: send document PDFs via WhatsApp using UAZAPI directly
    if (action === "send_whatsapp") {
      const { phone, document_ids } = body;

      if (!phone || !document_ids || document_ids.length === 0) {
        return new Response(JSON.stringify({ error: "Telefone e documentos são obrigatórios" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Normalize phone
      let normalizedPhone = phone.replace(/\D/g, '');
      if (!normalizedPhone.startsWith('55')) {
        normalizedPhone = '55' + normalizedPhone;
      }

      // Get documents with PDF URLs
      const { data: docs } = await supabase
        .from("generated_documents")
        .select("id, name, pdf_url")
        .in("id", document_ids)
        .eq("organization_id", pack.organization_id);

      if (!docs || docs.length === 0) {
        return new Response(JSON.stringify({ error: "Documentos não encontrados" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get active WhatsApp instance
      const instance = await getWhatsAppInstance(pack.organization_id);

      if (!instance?.zapi_token) {
        return new Response(JSON.stringify({ error: "Nenhuma instância WhatsApp conectada" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Send each document via UAZAPI directly
      let sentCount = 0;
      for (const doc of docs) {
        if (!doc.pdf_url) continue;
        const sent = await sendDocumentViaWhatsApp(
          normalizedPhone,
          doc.name,
          doc.pdf_url,
          instance.zapi_token
        );
        if (sent) sentCount++;
      }

      return new Response(JSON.stringify({
        success: true,
        sent_count: sentCount,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Ação inválida" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("public-pack-form error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
