import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.84.0";
import { getOrganizationIdFromRequest, resolveOpenAIConfig } from "../_shared/aiStrategy.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const tools = [
  {
    type: "function",
    function: {
      name: "find_user_by_name",
      description: "Busca um usuário pelo nome no workspace.",
      parameters: {
        type: "object",
        properties: { name: { type: "string" } },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_projects",
      description: "Lista projetos do workspace.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "list_members",
      description: "Lista membros do workspace.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "query_user_tasks",
      description: "Consulta tarefas de um usuário específico pelo nome.",
      parameters: {
        type: "object",
        properties: {
          user_name: { type: "string" },
          status: { type: "string", enum: ["a fazer", "fazendo", "feita", "todas"] },
        },
        required: ["user_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_overdue_tasks",
      description: "Consulta tarefas atrasadas. Pode filtrar por usuário.",
      parameters: {
        type: "object",
        properties: {
          user_name: { type: "string" },
          include_all_workspace: { type: "boolean" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_tasks_by_status",
      description: "Consulta tarefas por status.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["a fazer", "fazendo", "feita"] },
          user_name: { type: "string" },
          include_all_workspace: { type: "boolean" },
        },
        required: ["status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_task",
      description: "Cria uma tarefa simples.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          priority: { type: "string", enum: ["baixa", "média", "alta"] },
          project_id: { type: "string" },
          assigned_to: { type: "string" },
          due_date: { type: "string", description: "YYYY-MM-DD" },
        },
        required: ["title", "priority"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_project_with_tasks",
      description: "Cria um projeto completo com várias tarefas e subtarefas em uma única operação.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          start_date: { type: "string" },
          end_date: { type: "string" },
          tasks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                description: { type: "string" },
                priority: { type: "string", enum: ["baixa", "média", "alta"] },
                due_date: { type: "string" },
                assignee_name: { type: "string" },
                subtasks: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: { title: { type: "string" } },
                    required: ["title"],
                  },
                },
              },
              required: ["title"],
            },
          },
        },
        required: ["name", "tasks"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_task",
      description: "Edita uma tarefa existente.",
      parameters: {
        type: "object",
        properties: {
          task_id: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          status: { type: "string", enum: ["a fazer", "fazendo", "feita"] },
          priority: { type: "string", enum: ["baixa", "média", "alta"] },
          due_date: { type: "string" },
          assignee_name: { type: "string" },
        },
        required: ["task_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_task",
      description: "Remove uma tarefa.",
      parameters: {
        type: "object",
        properties: { task_id: { type: "string" } },
        required: ["task_id"],
      },
    },
  },
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Usuário não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { messages, workspace_id } = await req.json();
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("organization_id")
      .eq("id", workspace_id)
      .maybeSingle();

    const organizationId = await getOrganizationIdFromRequest(adminClient, req, workspace?.organization_id);
    const aiConfig = await resolveOpenAIConfig(adminClient, organizationId, "flow_ai");
    if (!aiConfig?.apiKey) {
      return new Response(JSON.stringify({ error: "OpenAI não configurada para o Flow AI." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("user_id", user.id)
      .maybeSingle();

    const { data: memberData } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("workspace_id", workspace_id)
      .maybeSingle();

    const firstName = profile?.full_name?.split(" ")[0] || "usuário";
    const userRole = memberData?.role || "membro";
    const roleDescription =
      userRole === "admin"
        ? "Você é ADMIN: pode criar projetos, tarefas, subtarefas e briefings, atribuir a qualquer pessoa."
        : userRole === "gestor"
          ? "Você é GESTOR: pode criar projetos com tarefas, atribuir a qualquer membro."
          : "Você é MEMBRO: só pode criar tarefas para si mesmo, não pode criar projetos.";

    const systemPrompt = `Você é o Flow AI, co-piloto do Wizzy Flow para gestão de projetos dentro do Wizzy CRM.

CONTEXTO:
- Usuário: ${firstName} (id: ${user.id})
- Workspace: ${workspace_id}
- Role: ${userRole}
- ${roleDescription}
- Data atual: ${new Date().toISOString().split("T")[0]}

REGRAS:
- Responda sempre em português brasileiro.
- Para consultas, use tools imediatamente.
- Para criações, edições e exclusões, proponha em texto e peça confirmação curta antes da execução.
- Para projetos completos, prefira create_project_with_tasks em uma única operação.
- Use datas ISO nas tools e datas amigáveis na conversa.
- Não invente nomes de responsáveis; use busca aproximada quando necessário.`;

    const response = await fetch(aiConfig.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${aiConfig.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: aiConfig.model,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        tools,
        tool_choice: "auto",
        stream: true,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return new Response(JSON.stringify({ error: errText.slice(0, 300) || `Erro ${response.status}` }), {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
