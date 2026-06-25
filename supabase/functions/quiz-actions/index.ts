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
      action, // 'send_whatsapp' | 'crm_action' | 'submit_quiz'
      phone,
      message,
      contact_name,
      contact_email,
      contact_phone,
      tag_ids,
      workspace_id,
      pipeline_id,
      column_id,
      variables,
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
    // Always process contact creation/update for crm_action and submit_quiz.
    // Also run if optional CRM fields are provided (tags, workspace, pipeline).
    const hasCrmData = tag_ids?.length || (workspace_id && workspace_id !== '') || (pipeline_id && pipeline_id !== '');
    if (action === "crm_action" || action === "submit_quiz" || hasCrmData) {
      const contactPhone = contact_phone || phone;
      if (contactPhone) {
        // Find or create contact
        const normalizedPhone = String(contactPhone).replace(/\D/g, "");
        let { data: contact } = await supabaseAdmin
          .from("contacts")
          .select("id, metadata")
          .eq("organization_id", organization_id)
          .eq("phone", normalizedPhone)
          .maybeSingle();

        const noteText = variables ? buildQuizSummary(variables) : null;

        if (!contact) {
          const initialMetadata = noteText ? { description: noteText } : {};
          const { data: newContact, error: insertError } = await supabaseAdmin
            .from("contacts")
            .insert({
              organization_id,
              phone: normalizedPhone,
              name: contact_name || null,
              email: contact_email || null,
              workspace_id: workspace_id || null,
              metadata: initialMetadata,
            })
            .select("id, metadata")
            .single();
          
          if (insertError) throw insertError;
          contact = newContact;
        } else {
          // Update contact info
          const updates: Record<string, any> = {};
          if (contact_name) updates.name = contact_name;
          if (contact_email) updates.email = contact_email;
          if (workspace_id) updates.workspace_id = workspace_id;
          
          if (noteText) {
            const currentMetadata = contact.metadata && typeof contact.metadata === 'object' ? contact.metadata : {};
            updates.metadata = { ...currentMetadata, description: noteText };
          }

          if (Object.keys(updates).length > 0) {
            const { data: updatedContact, error: updateError } = await supabaseAdmin
              .from("contacts")
              .update(updates)
              .eq("id", contact.id)
              .select("id, metadata")
              .single();
            
            if (updateError) throw updateError;
            contact = updatedContact;
          }
        }

        if (contact) {
          // Save note in contact_notes table
          if (noteText) {
            await supabaseAdmin.from("contact_notes").insert({
              contact_id: contact.id,
              organization_id,
              content: noteText,
            });
          }

          // Save files in contact_files table
          if (variables) {
            for (const [key, value] of Object.entries(variables)) {
              if (value && typeof value === 'object' && (value as any).url) {
                const fileVal = value as any;
                // Check if file is already linked to avoid duplicates
                const { data: existingFile } = await supabaseAdmin
                  .from("contact_files")
                  .select("id")
                  .eq("contact_id", contact.id)
                  .eq("file_url", fileVal.url)
                  .maybeSingle();

                if (!existingFile) {
                  await supabaseAdmin.from("contact_files").insert({
                    contact_id: contact.id,
                    organization_id,
                    name: fileVal.name || key,
                    file_url: fileVal.url,
                    file_type: fileVal.type?.startsWith('image/') ? 'image' : 'document',
                    file_size: fileVal.size || null,
                    storage_path: fileVal.storagePath || null,
                  });
                }
              }
            }
          }

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
              .maybeSingle();

            if (!conv) {
              // Create conversation if it doesn't exist so it appears on CRM board
              const { data: newConv, error: convError } = await supabaseAdmin
                .from("conversations")
                .insert({
                  organization_id,
                  contact_id: contact.id,
                  status: "open",
                  workspace_id: workspace_id || null,
                })
                .select("id")
                .single();
              
              if (!convError) {
                conv = newConv;
              }
            } else if (workspace_id) {
              // Update existing conversation to ensure it has the correct workspace association
              await supabaseAdmin
                .from("conversations")
                .update({ workspace_id })
                .eq("id", conv.id);
            }

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

function buildQuizSummary(variables: Record<string, any>): string {
  let summary = `Respostas do Quiz — ${new Date().toLocaleDateString('pt-BR')}\n\n`;
  const skipKeys = ['nome', 'name', 'phone', 'telefone', 'whatsapp', 'email', 'id', 'quiz_id', 'organization_id'];
  
  let hasContent = false;
  for (const [key, value] of Object.entries(variables || {})) {
    if (skipKeys.includes(key.toLowerCase())) continue;
    if (value === undefined || value === null || value === '') continue;
    
    hasContent = true;
    const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    
    if (typeof value === 'object') {
      if ((value as any).url) {
        summary += `- ${label}: ${(value as any).name || 'Arquivo'} (${(value as any).url})\n`;
      } else {
        summary += `- ${label}: ${JSON.stringify(value)}\n`;
      }
    } else {
      summary += `- ${label}: ${value}\n`;
    }
  }
  
  return hasContent ? summary : "Nenhum dado adicional respondido.";
}
