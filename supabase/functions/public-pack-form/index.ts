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

      return new Response(JSON.stringify({
        id: pack.id,
        name: pack.name,
        description: pack.description,
        template_ids: pack.template_ids,
        field_config: pack.field_config || [],
        organization: org,
        template_count: pack.template_ids?.length || 0,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // SUBMIT action: generate documents
    if (action === "submit") {
      const { filled_data, signer_name, signer_phone } = body;
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
              organization_id: pack.organization_id,
              content: internalMessage,
              sender_type: "system",
              is_internal: true,
              metadata: {
                type: "pack_form_submitted",
                pack_id: pack.id,
                pack_name: pack.name,
                signer_name: signer_name.trim(),
                signer_phone: normalizedPhone,
                document_ids: results.map(r => r.id),
                submission_group: submissionGroup,
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

      return new Response(JSON.stringify({
        success: true,
        documents_created: results.length,
        documents: results,
        organization_id: pack.organization_id,
        submission_group: submissionGroup,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // SEND_WHATSAPP action: send document PDFs via WhatsApp
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

      // Get active WhatsApp instance for this organization
      const { data: instance } = await supabase
        .from("whatsapp_instances")
        .select("id, instance_name, api_token")
        .eq("organization_id", pack.organization_id)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      if (!instance) {
        return new Response(JSON.stringify({ error: "Nenhuma instância WhatsApp ativa" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Send each document via WhatsApp using zapi-send-message
      let sentCount = 0;
      for (const doc of docs) {
        if (!doc.pdf_url) continue;

        try {
          const sendResp = await fetch(`${supabaseUrl}/functions/v1/zapi-send-message`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({
              phone: normalizedPhone,
              content: `📄 *${doc.name}*\n\nSegue seu documento para assinatura:`,
              type: "document",
              mediaUrl: doc.pdf_url,
              organizationId: pack.organization_id,
              instanceId: instance.id,
            }),
          });

          if (sendResp.ok) {
            sentCount++;
          } else {
            const errText = await sendResp.text();
            console.error("WhatsApp send error:", errText);
          }
        } catch (e) {
          console.error("WhatsApp send error:", e);
        }
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