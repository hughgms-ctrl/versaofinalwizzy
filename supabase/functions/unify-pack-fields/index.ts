import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { templates } = await req.json();
    // templates: Array<{ id, name, fields: Array<{ name, label?, type? }> }>

    if (!templates || templates.length < 1) {
      return new Response(JSON.stringify({ error: "Envie ao menos 1 template" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Build a clear prompt for the AI
    const templateDescriptions = templates.map((t: any) => {
      const fieldNames = (t.fields || []).map((f: any) => f.name || f).join(", ");
      return `Template "${t.name}" (id: ${t.id}): campos [${fieldNames}]`;
    }).join("\n");

    const systemPrompt = `Você é um especialista em análise de documentos jurídicos e administrativos brasileiros.

Sua tarefa é analisar os campos de múltiplos templates de documentos e identificar quais campos são similares/equivalentes entre eles, mesmo que tenham nomes ligeiramente diferentes.

Exemplos de campos similares que devem ser unificados:
- "nome_responsavel" e "nome_mae" podem ser o MESMO campo se os documentos forem sobre a mesma pessoa
- "documento_menor" e "documento_do_menor" e "doc_menor" são o mesmo campo
- "cpf" e "cpf_responsavel" podem ser o mesmo se se referem à mesma pessoa
- "endereco" e "endereco_completo" são o mesmo campo
- "data_nascimento" e "dt_nascimento" e "nascimento" são o mesmo campo

IMPORTANTE: Analise o CONTEXTO dos templates para decidir. Se dois templates são sobre a mesma transação/processo, campos com dados da mesma pessoa devem ser unificados.

Retorne APENAS a chamada de função, sem texto adicional.`;

    const userPrompt = `Analise os campos destes templates e identifique quais devem ser unificados (compartilhados) para que o cliente preencha uma única vez:

${templateDescriptions}

Para cada grupo de campos similares, defina:
- Um label unificado em português claro (ex: "Nome Completo do Responsável")
- Quais campos originais de quais templates fazem parte desse grupo
- O tipo de dado (text, date, cpf, email, phone, number, address)
- Uma descrição curta explicando o que preencher

Campos que são únicos de um template devem aparecer sozinhos com um label melhorado.`;

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
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "unify_fields",
              description: "Return unified field configuration for the pack",
              parameters: {
                type: "object",
                properties: {
                  fields: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        unifiedLabel: { type: "string", description: "Label unificado para o formulário público" },
                        description: { type: "string", description: "Instrução curta para o cliente" },
                        type: { type: "string", enum: ["text", "date", "cpf", "email", "phone", "number", "address"] },
                        originalFields: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              fieldName: { type: "string", description: "Nome original do campo no template" },
                              templateId: { type: "string", description: "ID do template" },
                            },
                            required: ["fieldName", "templateId"],
                            additionalProperties: false,
                          },
                        },
                      },
                      required: ["unifiedLabel", "description", "type", "originalFields"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["fields"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "unify_fields" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit excedido. Tente novamente em alguns segundos." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes. Adicione créditos ao workspace." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const text = await response.text();
      console.error("AI error:", response.status, text);
      throw new Error("AI gateway error");
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall) {
      throw new Error("AI did not return tool call");
    }

    const args = JSON.parse(toolCall.function.arguments);
    
    return new Response(JSON.stringify(args), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("unify-pack-fields error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
