import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { file_url, file_name } = await req.json();
    if (!file_url) {
      return new Response(JSON.stringify({ error: "file_url is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Fetch file content
    const fileResp = await fetch(file_url);
    if (!fileResp.ok) throw new Error("Failed to fetch file");

    // For text-based content, read directly. For binary (PDF), we send the URL.
    const isText = file_name?.endsWith('.txt') || file_name?.endsWith('.md');
    let fileContent = '';
    if (isText) {
      fileContent = await fileResp.text();
    } else {
      // For PDF/DOCX, we'll pass the URL to the AI and ask it to analyze
      fileContent = await fileResp.text().catch(() => '');
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

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Analise este documento modelo e extraia os campos variáveis:\n\nNome do arquivo: ${file_name || 'documento'}\n\nConteúdo:\n${fileContent || 'Arquivo binário - URL: ' + file_url}`,
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
      throw new Error("AI processing failed");
    }

    const aiData = await response.json();
    const aiContent = aiData.choices?.[0]?.message?.content || '';

    // Parse the JSON from AI response
    let parsed;
    try {
      // Try to extract JSON from markdown code blocks if present
      const jsonMatch = aiContent.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr = jsonMatch ? jsonMatch[1].trim() : aiContent.trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      // Fallback: return raw content
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
