import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { sendWhatsAppMessage } from "../_shared/whatsappProvider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      organization_id,
      quiz_id,
      action, // 'send_whatsapp' | 'crm_action'
      phone,
      message,
      contact_name,
      contact_email,
      contact_phone,
      tag_ids,
      workspace_id,
      pipeline_id,
      column_id,
    } = body;

    if (!organization_id) {
      return new Response(JSON.stringify({ error: "organization_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify quiz belongs to org
    if (quiz_id) {
      const { data: quiz } = await supabaseAdmin
        .from("quizzes")
        .select("id")
        .eq("id", quiz_id)
        .eq("organization_id", organization_id)
        .single();
      if (!quiz) {
        return new Response(JSON.stringify({ error: "Quiz not found for org" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const results: Record<string, any> = {};

    // --- CRM Actions ---
    if (action === "crm_action" || tag_ids?.length || workspace_id || pipeline_id) {
      const contactPhone = contact_phone || phone;
      if (contactPhone) {
        // Find or create contact
        const normalizedPhone = String(contactPhone).replace(/\D/g, "");
        let { data: contact } = await supabaseAdmin
          .from("contacts")
          .select("id")
          .eq("organization_id", organization_id)
          .eq("phone", normalizedPhone)
          .single();

        if (!contact) {
          const { data: newContact } = await supabaseAdmin
            .from("contacts")
            .insert({
              organization_id,
              phone: normalizedPhone,
              name: contact_name || null,
              email: contact_email || null,
              workspace_id: workspace_id || null,
            })
            .select("id")
            .single();
          contact = newContact;
        } else {
          // Update contact info
          const updates: Record<string, any> = {};
          if (contact_name) updates.name = contact_name;
          if (contact_email) updates.email = contact_email;
          if (workspace_id) updates.workspace_id = workspace_id;
          if (Object.keys(updates).length > 0) {
            await supabaseAdmin
              .from("contacts")
              .update(updates)
              .eq("id", contact.id);
          }
        }

        if (contact) {
          // Apply tags
          if (tag_ids?.length) {
            for (const tagId of tag_ids) {
              await supabaseAdmin
                .from("contact_tags")
                .upsert(
                  { contact_id: contact.id, tag_id: tagId, added_by_type: "quiz" },
                  { onConflict: "contact_id,tag_id" }
                ).select();
            }
            results.tags_applied = tag_ids.length;
          }

          // Pipeline position
          if (pipeline_id && column_id) {
            // Find conversation for this contact
            let { data: conv } = await supabaseAdmin
              .from("conversations")
              .select("id")
              .eq("contact_id", contact.id)
              .eq("organization_id", organization_id)
              .order("created_at", { ascending: false })
              .limit(1)
              .single();

            if (conv) {
              // Upsert pipeline position
              await supabaseAdmin
                .from("conversation_pipeline_positions")
                .upsert(
                  {
                    conversation_id: conv.id,
                    pipeline_id,
                    column_id,
                    order: 0,
                  },
                  { onConflict: "conversation_id" }
                );
              results.pipeline_set = true;
            }
          }

          results.contact_id = contact.id;
        }
      }
    }

    // --- Send WhatsApp ---
    if (action === "send_whatsapp" && phone) {
      const normalizedPhone = String(phone).replace(/\D/g, "");

      try {
        const resp = await sendWhatsAppMessage(supabaseAdmin, {
          organizationId: organization_id,
          phone: normalizedPhone,
          type: "text",
          text: message || "",
        });

        results.whatsapp_sent = resp.ok;
        if (!resp.ok) {
          results.whatsapp_error = resp.responseText;
        }
      } catch (sendError) {
        results.whatsapp_sent = false;
        results.whatsapp_error = String(sendError);
      }
    }

    return new Response(JSON.stringify({ success: true, ...results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("quiz-actions error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
