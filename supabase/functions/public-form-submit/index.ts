const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { template_id, filled_data, document_name, logo_url } = await req.json();

    if (!template_id || !filled_data) {
      return new Response(JSON.stringify({ error: "template_id and filled_data are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: template, error: tErr } = await supabase
      .from("document_templates")
      .select("content, organization_id, name")
      .eq("id", template_id)
      .maybeSingle();

    if (tErr || !template) {
      return new Response(JSON.stringify({ error: "Template not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const pdfResp = await fetch(`${supabaseUrl}/functions/v1/generate-document-pdf`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        template_content: template.content,
        filled_data,
        document_name: document_name || template.name,
        logo_url,
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
    });

    return new Response(JSON.stringify({ pdf_url: pdfData.pdf_url }), {
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
