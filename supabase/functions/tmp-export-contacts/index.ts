// Temporary one-off export function. Safe to delete.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const org = url.searchParams.get("org");
  const token = url.searchParams.get("token");
  if (token !== "3b45395cbdc488a1bbab05fc1060a606") {
    return new Response("unauthorized", { status: 401 });
  }
  if (!org) return new Response("missing org", { status: 400 });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const rows: any[] = [];
  const pageSize = 1000;
  for (let page = 0; ; page++) {
    const { data, error } = await supabase
      .from("contacts")
      .select("name, phone, email, created_at, workspace_id, contact_tags(tag:tags(name))")
      .eq("organization_id", org)
      .order("created_at", { ascending: false })
      .range(page * pageSize, page * pageSize + pageSize - 1);
    if (error) return new Response(error.message, { status: 500 });
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }

  const { data: ws } = await supabase.from("workspaces").select("id, name").eq("organization_id", org);
  const wsMap = new Map((ws ?? []).map((w: any) => [w.id, w.name]));

  const out = rows.map((r: any) => ({
    nome: r.name ?? "",
    telefone: r.phone ?? "",
    email: r.email ?? "",
    workspace: wsMap.get(r.workspace_id) ?? "",
    tags: (r.contact_tags ?? []).map((ct: any) => ct.tag?.name).filter(Boolean).join("; "),
    criado_em: r.created_at ?? "",
  }));

  return new Response(JSON.stringify(out), {
    headers: { "Content-Type": "application/json" },
  });
});
