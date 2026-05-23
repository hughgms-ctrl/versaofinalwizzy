import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function uazapiUrl(baseUrl: string, path: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  return `${base}${path}`;
}

function normalizeBaseUrl(value?: string | null): string {
  return (value || "").trim().replace(/\/$/, "");
}

async function loadConnectionSettings(supabase: any) {
  const { data: row } = await supabase
    .from("platform_settings")
    .select("value")
    .eq("key", "whatsapp_connection_settings")
    .maybeSingle();
  const value = row?.value || {};
  return {
    uazapiBaseUrl: normalizeBaseUrl(value.uazapi_base_url || Deno.env.get("UAZAPI_BASE_URL")),
    evolutionBaseUrl: normalizeBaseUrl(value.evolution_base_url || Deno.env.get("EVOLUTION_BASE_URL")),
    evolutionApiKey: value.evolution_api_key || Deno.env.get("EVOLUTION_API_KEY") || "",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { conversationId, columnId, organizationId, workspaceId: explicitWorkspaceId } = await req.json();

    if (!conversationId || !columnId || !organizationId) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const connectionSettings = await loadConnectionSettings(supabase);

    // Resolve workspaceId from conversation if not provided
    let workspaceId: string | null = explicitWorkspaceId || null;
    if (!workspaceId) {
      const { data: convWs } = await supabase
        .from("conversations")
        .select("workspace_id")
        .eq("id", conversationId)
        .maybeSingle();
      workspaceId = convWs?.workspace_id || null;
    }

    // Load all notification configs for this column; prefer the one matching the workspace,
    // fall back to the global one (workspace_id is null).
    const { data: configs } = await supabase
      .from("stage_notifications")
      .select("*")
      .eq("column_id", columnId)
      .eq("organization_id", organizationId)
      .eq("is_active", true);

    const notification = (configs || []).find((c: any) => c.workspace_id === workspaceId)
      || (configs || []).find((c: any) => c.workspace_id === null)
      || null;

    if (!notification || !notification.notify_user_ids || notification.notify_user_ids.length === 0) {
      console.log("No notification configured for column", columnId, "workspace", workspaceId);
      return new Response(
        JSON.stringify({ message: "No notification configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get conversation + contact info
    const { data: conv } = await supabase
      .from("conversations")
      .select("*, contact:contacts(name, phone)")
      .eq("id", conversationId)
      .single();

    if (!conv) {
      return new Response(
        JSON.stringify({ error: "Conversation not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get column name
    const { data: column } = await supabase
      .from("pipeline_columns")
      .select("name")
      .eq("id", columnId)
      .single();

    const contactName = conv.contact?.name || conv.contact?.phone || "Contato";
    const columnName = column?.name || "Novo estágio";

    // Build message from template or default
    const template = notification.message_template || 
      "🔔 Lead *{nome}* entrou no estágio *{estagio}*";
    const message = template
      .replace("{nome}", contactName)
      .replace("{estagio}", columnName);

    console.log("Notification message:", message);

    // Get phone numbers of users to notify
    const { data: profilesToNotify } = await supabase
      .from("profiles")
      .select("phone, full_name, user_id")
      .in("user_id", notification.notify_user_ids);

    if (!profilesToNotify || profilesToNotify.length === 0) {
      console.log("No users with profiles to notify");
      return new Response(
        JSON.stringify({ message: "No users with phone numbers to notify" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get active WhatsApp instance for this org
    const { data: instances } = await supabase
      .from("whatsapp_instances")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    const instance = (instances || []).find((item: any) => item.status === "connected") || (instances || [])[0] || null;

    if (!instance) {
      console.log("No active WhatsApp instance for org", organizationId);
      return new Response(
        JSON.stringify({ message: "No active WhatsApp instance" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const provider = instance.provider === "evolution" ? "evolution" : "uazapi";
    const instanceToken = instance.zapi_token;
    console.log("Using instance:", instance.label || instance.id, provider, "to send notifications to", profilesToNotify.length, "users");

    // Send notifications directly through the configured provider.
    const results = [];
    for (const profile of profilesToNotify) {
      if (!profile.phone) {
        console.log("User", profile.full_name, "has no phone number, skipping");
        results.push({
          userId: profile.user_id,
          name: profile.full_name,
          success: false,
          error: "No phone number",
        });
        continue;
      }

      const normalizedPhone = profile.phone.replace(/\D/g, '');
      console.log("Sending notification to", profile.full_name, "at", normalizedPhone);

      try {
        let endpoint = "";
        let headers: Record<string, string> = { "Content-Type": "application/json" };
        let body: Record<string, unknown> = { number: normalizedPhone, text: message };

        if (provider === "evolution") {
          const evolutionApiKey = instance.evolution_api_key || connectionSettings.evolutionApiKey || instanceToken;
          const instanceName = instance.evolution_instance_name || instance.zapi_instance_id;

          if (!connectionSettings.evolutionBaseUrl || !evolutionApiKey || !instanceName) {
            throw new Error("Evolution API not configured for stage notification");
          }

          endpoint = `${connectionSettings.evolutionBaseUrl}/message/sendText/${instanceName}`;
          headers = {
            ...headers,
            apikey: evolutionApiKey,
          };
          body = {
            ...body,
            delay: 1000,
            linkPreview: false,
          };
        } else {
          if (!connectionSettings.uazapiBaseUrl || !instanceToken) {
            throw new Error("UAZAPI not configured for stage notification");
          }

          endpoint = uazapiUrl(connectionSettings.uazapiBaseUrl, "/send/text");
          headers = {
            ...headers,
            token: instanceToken,
          };
        }

        const response = await fetch(endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });

        const responseText = await response.text();
        console.log(`${provider} response for`, profile.full_name, ":", response.status, responseText);

        results.push({
          userId: profile.user_id,
          name: profile.full_name,
          success: response.ok,
          status: response.status,
          error: response.ok ? undefined : responseText,
        });
      } catch (err) {
        console.error("Error sending to", profile.full_name, ":", err);
        results.push({
          userId: profile.user_id,
          name: profile.full_name,
          success: false,
          error: String(err),
        });
      }
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("stage-notification error:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
