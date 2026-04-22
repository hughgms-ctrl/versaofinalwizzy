const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const uazapiBaseUrl = Deno.env.get("UAZAPI_BASE_URL")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: template, error: tErr } = await supabase
      .from("document_templates")
      .select("content, content_html, logo_url, fields, organization_id, name, auto_send_whatsapp")
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

    await supabase.from("generated_documents").insert({
      organization_id: template.organization_id,
      template_id,
      name: document_name || template.name,
      filled_data,
      pdf_url: pdfData.pdf_url,
      status: "generated",
      submitted_by: signer_name && signer_phone ? {
        name: signer_name,
        phone: signer_phone,
        submitted_at: new Date().toISOString(),
      } : null,
    });

    let whatsappSent = false;
    if ((auto_send_whatsapp || template.auto_send_whatsapp) && signer_phone) {
      let normalizedPhone = String(signer_phone).replace(/\D/g, '');
      if (!normalizedPhone.startsWith('55')) normalizedPhone = `55${normalizedPhone}`;

      const { data: instance } = await supabase
        .from("whatsapp_instances")
        .select("zapi_token")
        .eq("organization_id", template.organization_id)
        .eq("status", "connected")
        .limit(1)
        .maybeSingle();

      if (instance?.zapi_token) {
        const baseUrl = uazapiBaseUrl.endsWith('/') ? uazapiBaseUrl.slice(0, -1) : uazapiBaseUrl;
        const sendResp = await fetch(`${baseUrl}/send/media`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "token": instance.zapi_token,
          },
          body: JSON.stringify({
            number: normalizedPhone,
            file: pdfData.pdf_url,
            caption: `📄 *${document_name || template.name}*\n\nSegue seu documento:`,
            type: "document",
          }),
        });
        whatsappSent = sendResp.ok;
        if (!sendResp.ok) {
          console.error("public-form-submit whatsapp error:", await sendResp.text());
        }
      }
    }

    return new Response(JSON.stringify({ pdf_url: pdfData.pdf_url, whatsapp_sent: whatsappSent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("public-form-submit error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
