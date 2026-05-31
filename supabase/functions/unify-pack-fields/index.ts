import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getOrganizationIdFromRequest, resolveOpenAIConfig } from "../_shared/aiStrategy.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { templates, organizationId: bodyOrganizationId } = await req.json();
    // templates: Array<{ id, name, fields: Array<{ name, label?, type? }> }>

    if (!templates || templates.length < 1) {
      return new Response(JSON.stringify({ error: "Envie ao menos 1 template" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const organizationId = await getOrganizationIdFromRequest(supabase, req, bodyOrganizationId);
    const aiConfig = await resolveOpenAIConfig(supabase, organizationId, "document_field_unification");
    if (!aiConfig) throw new Error("OpenAI não configurada para unificar campos");

    // Build a clear prompt for the AI
    const templateDescriptions = templates.map((t: any) => {
      const fieldNames = (t.fields || []).map((f: any) => f.name || f).join(", ");
      return `Template "${t.name}" (id: ${t.id}): campos [${fieldNames}]`;
    }).join("\n");

    const systemPrompt = `Você é um especialista em análise de documentos jurídicos e administrativos brasileiros.

Sua tarefa é analisar os campos de múltiplos templates de documentos e identificar quais campos são similares/equivalentes entre eles, mesmo que tenham nomes ligeiramente diferentes.

Exemplos de campos similares que devem ser unificados:
- "documento_menor" e "documento_do_menor" e "doc_menor" são o mesmo campo
- "endereco" e "endereco_completo" são o mesmo campo
- "data_nascimento" e "dt_nascimento" e "nascimento" são o mesmo campo

REGRAS CRÍTICAS:

1. DEDUPLICAÇÃO INTRA-TEMPLATE: Se um campo aparece mais de uma vez dentro do MESMO template (ex: "cidade" aparece 2x no template X), gere APENAS UMA entrada {fieldName: "cidade", templateId: X} para esse template. Nunca duplique o mesmo campo+template.

2. NÃO UNIFIQUE ENTIDADES DIFERENTES: Campos que se referem a PESSOAS ou ENTIDADES diferentes NÃO devem ser unificados, mesmo que o tipo de dado seja o mesmo. Exemplos:
   - "cpf_segurado_preso" ≠ "cpf_responsavel" (pessoas diferentes)
   - "nome_do_menor" ≠ "nome_da_mae" (pessoas diferentes)
   - "documento_responsavel" ≠ "documento_menor" (pessoas diferentes)
   Só unifique quando o dado se refere EXATAMENTE à mesma pessoa/entidade.

3. NENHUM CAMPO PODE SER DESCARTADO: Todo campo original de todo template DEVE aparecer em pelo menos um grupo no resultado. Se um campo é único e não tem similar, ele deve aparecer sozinho.

4. O badge "X docs" deve refletir em quantos TEMPLATES DISTINTOS o campo aparece, não quantas vezes ele aparece no total.

Retorne APENAS a chamada de função, sem texto adicional.`;

    const userPrompt = `Analise os campos destes templates e identifique quais devem ser unificados (compartilhados) para que o cliente preencha uma única vez:

${templateDescriptions}

Para cada grupo de campos similares, defina:
- Um label unificado em português claro (ex: "Nome Completo do Responsável")
- Quais campos originais de quais templates fazem parte desse grupo
- O tipo de dado (text, date, cpf, email, phone, number, address)
- Uma descrição curta explicando o que preencher

Campos que são únicos de um template devem aparecer sozinhos com um label melhorado.`;

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
