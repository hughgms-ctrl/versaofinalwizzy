const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getClientIp, checkRateLimitDb } from "../_shared/middleware.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    let templateId: string | null = null;

    // Support both GET query params and POST body
    if (req.method === "GET") {
      const url = new URL(req.url);
      templateId = url.searchParams.get("id");
    } else {
      const body = await req.json();
      templateId = body.id;
    }

    if (!templateId) {
      return new Response(JSON.stringify({ error: "Template ID is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Rate limit por IP (leitura pública de template).
    const ip = getClientIp(req);
    if (!(await checkRateLimitDb(supabase, ip, { bucket: "public-template", maxRequests: 60, windowSeconds: 60 }))) {
      return new Response(JSON.stringify({ error: "Muitas solicitações." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data, error } = await supabase
      .from("document_templates")
      .select("id, name, description, category, content, content_html, logo_url, fields, organization_id, auto_send_whatsapp")
      .eq("id", templateId)
      .maybeSingle();

    if (error || !data) {
      return new Response(JSON.stringify({ error: "Template not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: org } = await supabase
      .from("organizations")
      .select("name, logo_url")
      .eq("id", data.organization_id)
      .maybeSingle();

    return new Response(JSON.stringify({
      template: {
        id: data.id,
        name: data.name,
        description: data.description,
        category: data.category,
        content: data.content,
        content_html: (data as any).content_html ?? null,
        logo_url: (data as any).logo_url ?? null,
        fields: data.fields,
        auto_send_whatsapp: data.auto_send_whatsapp,
      },
      organization: org ? { name: org.name, logo_url: org.logo_url } : null,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("public-template error:", e instanceof Error ? (e.stack || e.message) : e);
    return new Response(
      JSON.stringify({ error: "Erro interno. Tente novamente." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
