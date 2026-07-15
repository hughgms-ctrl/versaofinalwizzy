import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import mammoth from "npm:mammoth@1.8.0";
import { getOrganizationIdFromRequest, resolveOpenAIConfig } from "../_shared/aiStrategy.ts";
import { fetchBytesOrDownload } from "../_shared/storageDownload.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Supabase auth environment variables are not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Invalid JWT" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { file_url, file_name } = await req.json();
    if (!file_url) {
      return new Response(JSON.stringify({ error: "file_url is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
    const adminClient = createClient(supabaseUrl, serviceKey);
    const organizationId = await getOrganizationIdFromRequest(adminClient, req);
    const aiConfig = await resolveOpenAIConfig(adminClient, organizationId, "document_processing");
    if (!aiConfig) throw new Error("OpenAI não configurada para processar documentos");

    // Fetch file content. O bucket contact-files está privado (Fase B): o upload
    // veio pra `<org_id>/templates/...`, então baixamos por path via service_role
    // (fetchBytesOrDownload cai no fetch da URL para qualquer origem de terceiros).
    const fileBytes = await fetchBytesOrDownload(file_url, adminClient);
    if (!fileBytes) throw new Error("Failed to fetch file");

    const fileName = (file_name || '').toLowerCase();
    let fileContent = '';

    if (fileName.endsWith('.docx')) {
      // Parse DOCX properly using mammoth to extract clean text
      const result = await mammoth.extractRawText({ buffer: fileBytes });
      fileContent = result.value;
      console.log(`DOCX extracted: ${fileContent.length} chars of clean text`);
    } else if (fileName.endsWith('.txt') || fileName.endsWith('.md')) {
      fileContent = new TextDecoder().decode(fileBytes);
    } else {
      // For PDF and other formats, try reading as text
      try { fileContent = new TextDecoder().decode(fileBytes); } catch { fileContent = ''; }
    }

    if (!fileContent || fileContent.trim().length === 0) {
      return new Response(JSON.stringify({ error: "Não foi possível extrair o conteúdo do arquivo. Tente enviar em formato .docx ou .txt." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Safety truncation (should rarely trigger now with proper parsing)
    const MAX_CHARS = 800000;
    if (fileContent.length > MAX_CHARS) {
      console.warn(`Content truncated from ${fileContent.length} to ${MAX_CHARS} chars`);
      fileContent = fileContent.slice(0, MAX_CHARS);
    }

    const systemPrompt = `Você é um assistente jurídico especializado em análise de documentos e contratos brasileiros.

Sua tarefa é analisar o conteúdo de um documento modelo e:
1. Reestruturar o texto substituindo todos os campos variáveis por marcadores no formato {{nome_do_campo}}
2. Identificar e listar todos os campos variáveis encontrados

Regras para nomes de campos:
- Use snake_case em português (ex: nome_responsavel, cpf, endereco_completo)
- Seja específico (ex: nome_do_menor, nome_do_responsavel, em vez de apenas "nome")
- Campos comuns: nome_completo, cpf, rg, endereco, cep, cidade, estado, telefone, email, data_nascimento, estado_civil, profissao, nacionalidade

Retorne OBRIGATORIAMENTE um JSON com esta estrutura:
{
  "content": "texto completo do documento com os campos {{marcados}}",
  "fields": [
    {"name": "nome_do_campo", "label": "Nome legível do campo", "type": "text", "required": true}
  ]
}

Os types possíveis para campos são: text, cpf, date, email, phone, number, address, select`;

    const response = await fetch(aiConfig.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${aiConfig.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: aiConfig.model,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Analise este documento modelo e extraia os campos variáveis. IMPORTANTE: retorne o documento COMPLETO, sem omitir nenhuma parte.\n\nNome do arquivo: ${file_name || 'documento'}\n\nConteúdo:\n${fileContent}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI error:", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Tente novamente em alguns segundos." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA esgotados. Adicione créditos no workspace." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI processing failed");
    }

    const aiData = await response.json();
    const aiContent = aiData.choices?.[0]?.message?.content || '';

    // Parse the JSON from AI response
    let parsed;
    try {
      const jsonMatch = aiContent.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr = jsonMatch ? jsonMatch[1].trim() : aiContent.trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      parsed = {
        content: aiContent,
        fields: [],
      };
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("process-document-template error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
