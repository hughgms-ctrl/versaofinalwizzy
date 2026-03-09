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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { conversationId, columnId, organizationId } = await req.json();

    if (!conversationId || !columnId || !organizationId) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const uazapiBaseUrl = Deno.env.get("UAZAPI_BASE_URL")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get notification config for this column
    const { data: notification } = await supabase
      .from("stage_notifications")
      .select("*")
      .eq("column_id", columnId)
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .maybeSingle();

    if (!notification || notification.notify_user_ids.length === 0) {
      console.log("No notification configured for column", columnId);
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
    const { data: instance } = await supabase
      .from("whatsapp_instances")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .maybeSingle();

    if (!instance) {
      console.log("No active WhatsApp instance for org", organizationId);
      return new Response(
        JSON.stringify({ message: "No active WhatsApp instance" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const instanceToken = instance.zapi_token;
    console.log("Using instance:", instance.name, "to send notifications to", profilesToNotify.length, "users");

    // Send notifications directly via UAZAPI (bypassing zapi-send-message which requires user auth)
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
        const endpoint = uazapiUrl(uazapiBaseUrl, '/send/text');
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "token": instanceToken,
          },
          body: JSON.stringify({
            number: normalizedPhone,
            text: message,
          }),
        });

        const responseText = await response.text();
        console.log("UAZAPI response for", profile.full_name, ":", response.status, responseText);

        results.push({
          userId: profile.user_id,
          name: profile.full_name,
          success: response.ok,
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