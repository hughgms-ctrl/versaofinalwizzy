const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { action, token, filled_data } = await req.json();
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
      if (!filled_data) {
        return new Response(JSON.stringify({ error: "Dados do formulário são obrigatórios" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
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

      // Generate a document for each template
      const results = [];
      for (const template of templates) {
        const templateFields = (template.fields as any[]) || [];
        const templateData: Record<string, string> = {};

        templateFields.forEach((field: any) => {
          const name = field.name || field;
          templateData[name] = filled_data[name] || '';
        });

        const { data: doc, error: docErr } = await supabase
          .from("generated_documents")
          .insert({
            organization_id: pack.organization_id,
            template_id: template.id,
            pack_id: pack.id,
            name: `${pack.name} - ${template.name}`,
            filled_data: templateData,
            status: "generated",
            signing_method: "manual",
          })
          .select()
          .single();

        if (docErr) {
          console.error("Error creating document:", docErr);
        } else {
          results.push(doc);

          // Try to generate PDF
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
                document_name: `${pack.name} - ${template.name}`,
              }),
            });

            const pdfData = await pdfResp.json();
            if (pdfResp.ok && pdfData.pdf_url) {
              await supabase
                .from("generated_documents")
                .update({ pdf_url: pdfData.pdf_url })
                .eq("id", doc.id);
            }
          } catch (pdfErr) {
            console.error("PDF generation error:", pdfErr);
          }
        }
      }

      return new Response(JSON.stringify({ 
        success: true, 
        documents_created: results.length 
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
