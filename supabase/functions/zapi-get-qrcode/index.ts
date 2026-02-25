import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function uazapiUrl(baseUrl: string, path: string): string {
  const base = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  return `${base}${path}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const uazapiBaseUrl = Deno.env.get("UAZAPI_BASE_URL")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await supabase.from("profiles").select("organization_id").eq("user_id", user.id).single();

    if (!profile) {
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Support specific instanceId via query param or body
    let requestedInstanceId: string | null = null;
    const url = new URL(req.url);
    requestedInstanceId = url.searchParams.get("instanceId");

    if (!requestedInstanceId && req.method === "POST") {
      try {
        const body = await req.json();
        requestedInstanceId = body.instanceId || null;
      } catch {
        /* no body */
      }
    }

    let instance;
    if (requestedInstanceId) {
      const { data } = await supabase
        .from("whatsapp_instances")
        .select("*")
        .eq("id", requestedInstanceId)
        .eq("organization_id", profile.organization_id)
        .maybeSingle();
      instance = data;
    } else {
      const { data } = await supabase
        .from("whatsapp_instances")
        .select("*")
        .eq("organization_id", profile.organization_id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      instance = data;
    }

    if (!instance) {
      return new Response(JSON.stringify({ error: "No instance found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!instance.zapi_token) {
      return new Response(JSON.stringify({ error: "Instance not configured with API credentials" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const instanceToken = instance.zapi_token;
    console.log(`Connecting instance ${instance.id} via POST /instance/connect`);
    console.log(`UAZAPI base URL: ${uazapiBaseUrl}`);

    // POST /instance/connect - Uazapi v2.0
    const connectResponse = await fetch(uazapiUrl(uazapiBaseUrl, "/instance/connect"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        token: instanceToken,
      },
    });

    const connectRaw = await connectResponse.text();
    console.log(`UAZAPI connect status: ${connectResponse.status}, body: ${connectRaw}`);

    if (!connectResponse.ok) {
      return new Response(
        JSON.stringify({
          error: "Failed to connect instance",
          details: connectRaw,
          httpStatus: connectResponse.status,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    let connectData: Record<string, any> = {};
    try {
      connectData = JSON.parse(connectRaw);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON response from Uazapi", details: connectRaw }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Connect response keys:", Object.keys(connectData));

    // Check if already connected
    const isConnected =
      connectData.state === "connected" || connectData.connected === true || connectData.status === "connected";

    if (isConnected) {
      await supabase
        .from("whatsapp_instances")
        .update({ status: "connected", is_active: true, connected_at: new Date().toISOString() })
        .eq("id", instance.id);

      return new Response(JSON.stringify({ connected: true, instanceId: instance.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract QR code
    const qrCode = connectData.qrcode || connectData.qr || connectData.value || connectData.base64 || connectData.code;

    if (!qrCode) {
      return new Response(
        JSON.stringify({
          error: "No QR code in response",
          details: connectData,
          note: "Instance may already be connected or in an unexpected state",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    await supabase.from("whatsapp_instances").update({ status: "connecting", is_active: true }).eq("id", instance.id);

    return new Response(JSON.stringify({ qrCode, connected: false, instanceId: instance.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: "Internal server error", message: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
