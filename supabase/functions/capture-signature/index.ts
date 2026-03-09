import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { signatureToken, signatureImage } = await req.json();

    if (!signatureToken || !signatureImage) {
      return new Response(
        JSON.stringify({ error: "Missing signatureToken or signatureImage" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Find the signature record by token
    const { data: signature, error: sigError } = await supabase
      .from("document_signatures")
      .select("*, generated_document:generated_documents(*)")
      .eq("signature_token", signatureToken)
      .single();

    if (sigError || !signature) {
      return new Response(
        JSON.stringify({ error: "Signature record not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (signature.status === "signed") {
      return new Response(
        JSON.stringify({ error: "Document already signed" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Store signature image in storage
    const signatureFileName = `signatures/${signature.id}/${Date.now()}.png`;
    const base64Data = signatureImage.replace(/^data:image\/\w+;base64,/, "");
    const signatureBuffer = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));

    const { error: uploadError } = await supabase.storage
      .from("contact-files")
      .upload(signatureFileName, signatureBuffer, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadError) {
      console.error("Error uploading signature:", uploadError);
      return new Response(
        JSON.stringify({ error: "Failed to save signature" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: { publicUrl } } = supabase.storage
      .from("contact-files")
      .getPublicUrl(signatureFileName);

    // Update signature record
    const { error: updateError } = await supabase
      .from("document_signatures")
      .update({
        status: "signed",
        signed_at: new Date().toISOString(),
        signature_url: publicUrl,
      })
      .eq("id", signature.id);

    if (updateError) {
      console.error("Error updating signature:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to update signature status" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update generated document status
    await supabase
      .from("generated_documents")
      .update({
        signing_status: "signed",
        status: "signed",
      })
      .eq("id", signature.generated_document_id);

    // Check if there's a flow execution waiting for signature
    const { data: executions } = await supabase
      .from("flow_executions")
      .select("*")
      .eq("conversation_id", signature.conversation_id)
      .eq("status", "waiting_signature");

    if (executions && executions.length > 0) {
      // Resume flow execution
      for (const exec of executions) {
        await supabase
          .from("flow_executions")
          .update({ status: "running" })
          .eq("id", exec.id);
        
        // TODO: Trigger flow-execute to continue
      }
    }

    return new Response(
      JSON.stringify({ success: true, signatureUrl: publicUrl }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in capture-signature:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
