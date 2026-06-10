import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.84.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function normalizeString(value = "") {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

function normalizeAction(action?: string) {
  const normalized = normalizeString(action || "").replace(/\s+/g, "_");
  const aliases: Record<string, string> = {
    criar_projeto_com_tarefas: "create_project_with_tasks",
    criar_tarefa: "create_task",
    atualizar_tarefa: "update_task",
    excluir_tarefa: "delete_task",
  };
  return aliases[normalized] || action || "";
}

function mapPriority(priority?: string) {
  const value = normalizeString(priority || "");
  if (value === "alta" || value === "high") return "high";
  if (value === "baixa" || value === "low") return "low";
  return "medium";
}

function mapStatus(status?: string) {
  const value = normalizeString(status || "");
  if (value === "feita" || value === "completed") return "completed";
  if (value === "fazendo" || value === "in_progress") return "in_progress";
  return value || "todo";
}

async function findUserByName(supabase: any, workspaceId: string, searchName: string) {
  const { data: members } = await supabase
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", workspaceId);

  const userIds = (members || []).map((member: any) => member.user_id);
  if (!userIds.length) return null;

  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, full_name")
    .in("user_id", userIds);

  const target = normalizeString(searchName);
  return (profiles || []).find((profile: any) => normalizeString(profile.full_name || "").includes(target)) || null;
}

async function resolveWorkspaceRole(supabase: any, userId: string, workspaceId: string) {
  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("id, organization_id")
    .eq("id", workspaceId)
    .maybeSingle();

  if (workspaceError) throw workspaceError;
  if (!workspace?.id) return { hasAccess: false, role: "membro" };

  const { data: member } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("user_id", userId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (member?.role) return { hasAccess: true, role: member.role };

  const { data: orgRole } = await supabase.rpc("user_org_role", {
    _user_id: userId,
    _org_id: workspace.organization_id,
  });

  if (["owner", "admin", "platform_admin"].includes(orgRole)) {
    return { hasAccess: true, role: "admin" };
  }

  const { data: hasAccess } = await supabase.rpc("user_has_workspace_access", {
    _user_id: userId,
    _workspace_id: workspaceId,
  });

  return { hasAccess: !!hasAccess, role: hasAccess ? "membro" : "none" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ success: false, error: "Usuário não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const action = normalizeAction(body.action || body.name || body.tool || body.function_name);
    const params = body.params || body.arguments || {};
    const workspaceId = body.workspace_id;

    const { hasAccess, role: userRole } = await resolveWorkspaceRole(supabase, user.id, workspaceId);
    if (!hasAccess) {
      return new Response(JSON.stringify({ success: false, error: "Sem acesso a este workspace" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const canManageProjects = userRole === "admin" || userRole === "gestor";
    let result: any;

    switch (action) {
      case "find_user_by_name": {
        const foundUser = await findUserByName(supabase, workspaceId, params.name);
        result = foundUser
          ? { success: true, user: { id: foundUser.user_id, full_name: foundUser.full_name } }
          : { success: false, error: `Não encontrei usuário com nome parecido com "${params.name}"` };
        break;
      }

      case "list_projects": {
        const { data, error } = await supabase
          .from("projects")
          .select("id, name, status, description")
          .eq("workspace_id", workspaceId)
          .order("name");
        if (error) throw error;
        result = { success: true, projects: data || [] };
        break;
      }

      case "list_members": {
        const { data: members, error } = await supabase
          .from("workspace_members")
          .select("user_id, role")
          .eq("workspace_id", workspaceId);
        if (error) throw error;
        const userIds = (members || []).map((member: any) => member.user_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
        result = {
          success: true,
          members: (members || []).map((member: any) => ({
            id: member.user_id,
            role: member.role,
            name: profiles?.find((profile: any) => profile.user_id === member.user_id)?.full_name || "Sem nome",
          })),
        };
        break;
      }

      case "query_user_tasks": {
        const foundUser = await findUserByName(supabase, workspaceId, params.user_name);
        if (!foundUser) {
          result = { success: false, error: `Não encontrei usuário com nome parecido com "${params.user_name}"` };
          break;
        }
        let query = supabase
          .from("tasks")
          .select("id, title, due_date, priority, status, project_id, project:projects(id, name)")
          .eq("workspace_id", workspaceId)
          .eq("assigned_to", foundUser.user_id);
        if (params.status && params.status !== "todas") query = query.eq("status", mapStatus(params.status));
        const { data, error } = await query.order("due_date", { ascending: true }).limit(30);
        if (error) throw error;
        result = { success: true, user_name: foundUser.full_name, tasks: data || [] };
        break;
      }

      case "query_overdue_tasks":
      case "query_tasks_by_status": {
        let query = supabase
          .from("tasks")
          .select("id, title, due_date, priority, status, assigned_to, project_id, project:projects(id, name)")
          .eq("workspace_id", workspaceId);

        if (action === "query_overdue_tasks") {
          query = query.lt("due_date", new Date().toISOString().slice(0, 10)).neq("status", "completed");
        } else if (params.status) {
          query = query.eq("status", mapStatus(params.status));
        }

        if (params.user_name) {
          const foundUser = await findUserByName(supabase, workspaceId, params.user_name);
          if (foundUser) query = query.eq("assigned_to", foundUser.user_id);
        } else if (!params.include_all_workspace) {
          query = query.eq("assigned_to", user.id);
        }

        const { data, error } = await query.order("created_at", { ascending: false }).limit(30);
        if (error) throw error;
        result = { success: true, tasks: data || [] };
        break;
      }

      case "create_task": {
        const assignee = params.assigned_to || user.id;
        if (userRole === "membro" && assignee !== user.id) {
          result = { success: false, error: "Membros só podem criar tarefas para si mesmos." };
          break;
        }
        const { data, error } = await supabase
          .from("tasks")
          .insert({
            title: params.title,
            description: params.description || null,
            priority: mapPriority(params.priority),
            project_id: params.project_id || null,
            assigned_to: assignee,
            due_date: params.due_date || null,
            status: "todo",
            workspace_id: workspaceId,
          })
          .select("id, title")
          .single();
        if (error) throw error;
        result = { success: true, task: data, message: `Tarefa "${data.title}" criada.` };
        break;
      }

      case "create_project_with_tasks": {
        if (!canManageProjects) {
          result = { success: false, error: "Apenas admin/gestor pode criar projetos." };
          break;
        }
        const { data: project, error: projectError } = await supabase
          .from("projects")
          .insert({
            name: params.name,
            description: params.description || null,
            start_date: params.start_date || null,
            end_date: params.end_date || null,
            user_id: user.id,
            workspace_id: workspaceId,
            status: "active",
          })
          .select("id, name")
          .single();
        if (projectError) throw projectError;

        let created = 0;
        for (const task of params.tasks || []) {
          const assignee = task.assignee_name
            ? await findUserByName(supabase, workspaceId, task.assignee_name)
            : null;
          const { data: createdTask, error: taskError } = await supabase
            .from("tasks")
            .insert({
              title: task.title,
              description: task.description || null,
              priority: mapPriority(task.priority),
              project_id: project.id,
              assigned_to: assignee?.user_id || null,
              due_date: task.due_date || null,
              status: "todo",
              workspace_id: workspaceId,
            })
            .select("id")
            .single();
          if (taskError) continue;
          created += 1;
          const subtasks = (task.subtasks || []).map((subtask: any, index: number) => ({
            task_id: createdTask.id,
            title: typeof subtask === "string" ? subtask : subtask.title,
            subtask_order: index,
          }));
          if (subtasks.length) await supabase.from("subtasks").insert(subtasks);
        }
        result = { success: true, project, message: `Projeto "${project.name}" criado com ${created} tarefa(s).` };
        break;
      }

      case "update_task": {
        const updates: any = {};
        if (params.title) updates.title = params.title;
        if (params.description !== undefined) updates.description = params.description;
        if (params.status) updates.status = mapStatus(params.status);
        if (params.priority) updates.priority = mapPriority(params.priority);
        if (params.due_date) updates.due_date = params.due_date;
        if (params.assignee_name) {
          const assignee = await findUserByName(supabase, workspaceId, params.assignee_name);
          if (assignee) updates.assigned_to = assignee.user_id;
        }
        const { data, error } = await supabase
          .from("tasks")
          .update(updates)
          .eq("id", params.task_id)
          .eq("workspace_id", workspaceId)
          .select("id, title")
          .single();
        if (error) throw error;
        result = { success: true, task: data, message: `Tarefa "${data.title}" atualizada.` };
        break;
      }

      case "delete_task": {
        const { error } = await supabase
          .from("tasks")
          .delete()
          .eq("id", params.task_id)
          .eq("workspace_id", workspaceId);
        if (error) throw error;
        result = { success: true, message: "Tarefa removida." };
        break;
      }

      default:
        result = { success: false, error: `Ação desconhecida: ${action}` };
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
