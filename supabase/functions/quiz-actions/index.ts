import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { sendWhatsAppMessage, resolveWhatsAppInstance, resolveWorkspaceInstanceBinding } from "../_shared/whatsappProvider.ts";
import { getClientIp, checkRateLimitDb, safeErrorResponse } from "../_shared/middleware.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizePhoneNumber(value: string): string {
  let clean = String(value || "").replace(/\D/g, "");
  if (clean.length === 10 || clean.length === 11) {
    clean = `55${clean}`;
  }
  return clean;
}

// Substitui {{variavel}} pelos valores da submissão (igual ao interpolate do
// PublicQuizPage). Usado para montar a mensagem de WhatsApp server-side.
function interpolate(text: string, variables: Record<string, any>): string {
  return String(text || "").replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = variables?.[key];
    return v === undefined || v === null ? `{{${key}}}` : String(v);
  });
}

// Procura um bloco pelo id dentro do grafo do quiz (theme.nodes[].data.blocks[]).
// A definição do quiz é a fonte da verdade: a mensagem/telefone/flow do envio de
// WhatsApp saem DAQUI, nunca do body — senão um chamador anônimo faria o número da
// empresa disparar texto arbitrário para qualquer telefone.
function findQuizBlock(theme: any, blockId: string): any | null {
  const nodes = Array.isArray(theme?.nodes) ? theme.nodes : [];
  for (const node of nodes) {
    const blocks = Array.isArray(node?.data?.blocks) ? node.data.blocks : [];
    for (const block of blocks) {
      if (block?.id === blockId) return block;
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      organization_id: bodyOrgId,
      quiz_id,
      action, // 'send_whatsapp' | 'crm_action' | 'submit_quiz' | 'trigger_flow'
      phone,
      block_id,
      flow_id: bodyFlowId,
      contact_name,
      contact_email,
      contact_phone,
      tag_ids,
      workspace_id,
      pipeline_id,
      column_id,
      variables,
    } = body;

    // quiz_id é obrigatório: a org e a definição do quiz são resolvidas a partir
    // dele (fonte da verdade), nunca confiando no organization_id/message do body.
    if (!quiz_id) {
      return new Response(JSON.stringify({ error: "quiz_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Rate limit por IP (endpoint público, anti-abuso).
    const ip = getClientIp(req);
    if (!(await checkRateLimitDb(supabaseAdmin, ip, { bucket: "quiz-actions", maxRequests: 30, windowSeconds: 60 }))) {
      return new Response(JSON.stringify({ error: "Muitas solicitações. Aguarde um momento e tente novamente." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Carrega o quiz: organization_id e theme (grafo dos blocos) são a fonte da verdade.
    const { data: quiz } = await supabaseAdmin
      .from("quizzes")
      .select("id, organization_id, theme, workspace_id")
      .eq("id", quiz_id)
      .maybeSingle();
    if (!quiz) {
      return new Response(JSON.stringify({ error: "Quiz not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Org autoritativa vem do quiz. Se o body mandou uma org divergente, rejeita
    // (defesa em profundidade contra spoofing de organization_id).
    const organization_id = quiz.organization_id;
    if (bodyOrgId && bodyOrgId !== organization_id) {
      return new Response(JSON.stringify({ error: "organization mismatch" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Regra de negócio: um quiz atrelado a um workspace só pode disparar WhatsApp
    // pelo número desse workspace. Se o workspace não tem número associado, o envio
    // é recusado (nunca cai no fallback por organização, que pegaria o número de
    // outro workspace). Quiz sem workspace mantém o comportamento anterior.
    const quizWorkspaceBinding = await resolveWorkspaceInstanceBinding(
      supabaseAdmin,
      organization_id,
      (quiz as any).workspace_id,
    );

    // Bloco autoritativo (mensagem/telefone/flow do envio saem daqui, não do body).
    const actionBlock = block_id ? findQuizBlock(quiz.theme, block_id) : null;
    const flow_id = actionBlock?.data?.flowId || bodyFlowId;

    const results: Record<string, any> = {};

    // Normalize phone numbers if present
    const cleanPhone = phone ? normalizePhoneNumber(phone) : null;
    const cleanContactPhone = contact_phone ? normalizePhoneNumber(contact_phone) : null;

    // --- CRM Actions ---
    // Always process contact creation/update for crm_action, trigger_flow and submit_quiz.
    // Also run if optional CRM fields are provided (tags, workspace, pipeline).
    const hasCrmData = tag_ids?.length || (workspace_id && workspace_id !== '') || (pipeline_id && pipeline_id !== '');
    if (action === "crm_action" || action === "submit_quiz" || action === "trigger_flow" || hasCrmData) {
      const contactPhone = cleanContactPhone || cleanPhone;
      if (contactPhone) {
        // Find or create contact
        let { data: contact } = await supabaseAdmin
          .from("contacts")
          .select("id, metadata")
          .eq("organization_id", organization_id)
          .eq("phone", contactPhone)
          .maybeSingle();

        const noteText = variables ? buildQuizSummary(variables) : null;

        if (!contact) {
          const initialMetadata = noteText ? { description: noteText } : {};
          const { data: newContact, error: insertError } = await supabaseAdmin
            .from("contacts")
            .insert({
              organization_id,
              phone: contactPhone,
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
              let activeInstanceId: string | null = null;
              try {
                const activeInst = await resolveWhatsAppInstance(supabaseAdmin, organization_id, null);
                if (activeInst) {
                  activeInstanceId = activeInst.id;
                }
              } catch (err) {
                console.error("Error resolving active whatsapp instance:", err);
              }

              const { data: newConv, error: convError } = await supabaseAdmin
                .from("conversations")
                .insert({
                  organization_id,
                  contact_id: contact.id,
                  status: "open",
                  workspace_id: workspace_id || null,
                  whatsapp_instance_id: activeInstanceId,
                })
                .select("id")
                .single();
              
              if (!convError) {
                conv = newConv;
              }
            } else {
              // If conversation exists but has no workspace or active instance, update it
              const updates: Record<string, any> = {};
              if (workspace_id) updates.workspace_id = workspace_id;

              const { data: currentConv } = await supabaseAdmin
                .from("conversations")
                .select("whatsapp_instance_id")
                .eq("id", conv.id)
                .single();
              
              if (currentConv && !currentConv.whatsapp_instance_id) {
                try {
                  const activeInst = await resolveWhatsAppInstance(supabaseAdmin, organization_id, null);
                  if (activeInst) {
                    updates.whatsapp_instance_id = activeInst.id;
                  }
                } catch (err) {
                  console.error("Error resolving active whatsapp instance for update:", err);
                }
              }

              if (Object.keys(updates).length > 0) {
                await supabaseAdmin
                  .from("conversations")
                  .update(updates)
                  .eq("id", conv.id);
              }
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

    // --- Trigger Flow ---
    if (action === "trigger_flow" && flow_id && results.contact_id) {
      // Find the conversation we just created/matched
      const { data: conv } = await supabaseAdmin
        .from("conversations")
        .select("id")
        .eq("contact_id", results.contact_id)
        .eq("organization_id", organization_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (conv) {
        try {
          const localUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/flow-execute`;
          const resp = await fetch(localUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({
              flowId: flow_id,
              conversationId: conv.id,
              variables: variables || {},
            }),
          });

          results.flow_triggered = resp.ok;
          if (!resp.ok) {
            results.flow_error = await resp.text();
          }
        } catch (triggerError) {
          results.flow_triggered = false;
          results.flow_error = String(triggerError);
        }
      } else {
        results.flow_triggered = false;
        results.flow_error = "Conversation not found/created for contact";
      }
    }

    // --- Send WhatsApp ---
    // Mensagem e destino saem do bloco configurado no quiz (server-authoritative),
    // não do body. Isso impede um chamador anônimo de disparar texto arbitrário
    // pelo número da empresa. useContactPhone => telefone do respondente (variables);
    // caso contrário => número fixo configurado no bloco (waNumber).
    if (action === "send_whatsapp") {
      if (!actionBlock) {
        results.whatsapp_sent = false;
        results.whatsapp_error = "block_id inválido ou ausente";
      } else {
        const bd = actionBlock.data || {};
        const waMessage = interpolate(String(bd.waMessage || ""), variables || {});
        const rawTarget = bd.useContactPhone
          ? (variables?.["phone"] || variables?.["telefone"] || variables?.["whatsapp"] || "")
          : (bd.waNumber || "");
        const targetPhone = rawTarget ? normalizePhoneNumber(String(rawTarget)) : "";

        if (targetPhone && waMessage) {
          if (quizWorkspaceBinding.blocked) {
            // Workspace do quiz não tem número associado: recusa o envio em vez de
            // usar o número de outro workspace/organização.
            results.whatsapp_sent = false;
            results.whatsapp_error = "workspace_sem_numero";
          } else {
            try {
              const resp = await sendWhatsAppMessage(supabaseAdmin, {
                organizationId: organization_id,
                phone: targetPhone,
                type: "text",
                text: waMessage,
                // Quando o quiz tem workspace com número, força o envio por ele.
                // Null => mantém a resolução por organização (quiz sem workspace).
                conversationInstanceId: quizWorkspaceBinding.workspaceInstanceId,
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
        }
      }
    }

    return new Response(JSON.stringify({ success: true, ...results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return safeErrorResponse(err, "quiz-actions");
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
        summary += `- ${label}: ${(value as any).name || 'Arquivo'}\n`;
      } else {
        summary += `- ${label}: ${JSON.stringify(value)}\n`;
      }
    } else {
      summary += `- ${label}: ${value}\n`;
    }
  }
  
  return hasContent ? summary : "Nenhum dado adicional respondido.";
}
