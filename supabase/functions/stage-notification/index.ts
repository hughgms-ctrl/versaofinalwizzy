import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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

    // Get phone numbers of users to notify
    const { data: profilesToNotify } = await supabase
      .from("profiles")
      .select("phone, full_name, user_id")
      .in("user_id", notification.notify_user_ids);

    if (!profilesToNotify || profilesToNotify.length === 0) {
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
      return new Response(
        JSON.stringify({ message: "No active WhatsApp instance" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send notifications to each user
    const results = [];
    for (const profile of profilesToNotify) {
      if (!profile.phone) continue;

      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/zapi-send-message`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({
            organizationId,
            phone: profile.phone,
            message,
          }),
        });

        results.push({
          userId: profile.user_id,
          name: profile.full_name,
          success: response.ok,
        });
      } catch (err) {
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
