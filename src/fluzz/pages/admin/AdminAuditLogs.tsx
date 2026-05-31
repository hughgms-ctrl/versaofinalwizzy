import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { AdminLayout } from "@/fluzz/components/admin/AdminLayout";
import { Card, CardContent, CardHeader } from "@/fluzz/components/ui/card";
import { Button } from "@/fluzz/components/ui/button";
import { Input } from "@/fluzz/components/ui/input";
import { Badge } from "@/fluzz/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/fluzz/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/fluzz/components/ui/select";
import {
  Search,
  RefreshCw,
  Shield,
  Ban,
  Trash2,
  CreditCard,
  Building2,
  Key,
  UserPlus,
  UserMinus,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface AuditLog {
  id: string;
  admin_user_id: string;
  action: string;
  target_type: string;
  target_id: string | null;
  target_email: string | null;
  details: unknown | null;
  created_at: string;
  admin_profile?: {
    full_name: string | null;
  };
}

const actionLabels: Record<string, string> = {
  subscription_access_enabled: "Liberou painel assinaturas",
  subscription_access_disabled: "Bloqueou painel assinaturas",
  user_blocked: "Bloqueou usuário",
  user_unblocked: "Desbloqueou usuário",
  user_deleted: "Excluiu usuário",
  workspace_deleted: "Excluiu workspace",
  password_reset: "Resetou senha",
  workspace_created: "Criou workspace",
};

const actionIcons: Record<string, React.ReactNode> = {
  subscription_access_enabled: <CreditCard className="h-4 w-4 text-green-500" />,
  subscription_access_disabled: <CreditCard className="h-4 w-4 text-red-500" />,
  user_blocked: <Ban className="h-4 w-4 text-red-500" />,
  user_unblocked: <Shield className="h-4 w-4 text-green-500" />,
  user_deleted: <Trash2 className="h-4 w-4 text-red-500" />,
  workspace_deleted: <Building2 className="h-4 w-4 text-red-500" />,
  password_reset: <Key className="h-4 w-4 text-amber-500" />,
  workspace_created: <UserPlus className="h-4 w-4 text-green-500" />,
};

const AdminAuditLogs = () => {
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");

  const { data: logs, isLoading, refetch } = useQuery({
    queryKey: ["admin-audit-logs", search, actionFilter],
    queryFn: async () => {
      let query = supabase
        .from("admin_audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);

      if (actionFilter && actionFilter !== "all") {
        query = query.eq("action", actionFilter);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Get unique admin user IDs
      const adminIds = [...new Set(data.map((log) => log.admin_user_id))];
      
      // Fetch admin profiles
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", adminIds);

      const profileMap = new Map(profiles?.map((p) => [p.id, p.full_name]) || []);

      // Map logs with admin names
      let logsWithProfiles: AuditLog[] = data.map((log) => ({
        ...log,
        admin_profile: { full_name: profileMap.get(log.admin_user_id) || null },
      }));

      // Filter by search term on client side
      if (search) {
        const searchLower = search.toLowerCase();
        logsWithProfiles = logsWithProfiles.filter(
          (log) =>
            log.target_email?.toLowerCase().includes(searchLower) ||
            log.admin_profile?.full_name?.toLowerCase().includes(searchLower) ||
            log.target_id?.toLowerCase().includes(searchLower)
        );
      }

      return logsWithProfiles;
    },
  });

  const getActionBadge = (action: string) => {
    const isDestructive = ["user_blocked", "user_deleted", "workspace_deleted", "subscription_access_disabled"].includes(action);
    const isPositive = ["subscription_access_enabled", "user_unblocked", "workspace_created"].includes(action);

    return (
      <Badge
        variant={isDestructive ? "destructive" : isPositive ? "default" : "secondary"}
        className={isPositive ? "bg-green-500" : ""}
      >
        {actionLabels[action] || action}
      </Badge>
    );
  };

  return (
    <AdminLayout
      title="Log de Auditoria"
      description="Histórico de todas as ações administrativas realizadas na plataforma"
    >
      <Card>
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por email ou admin..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Filtrar por ação" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as ações</SelectItem>
                <SelectItem value="subscription_access_enabled">Liberou assinaturas</SelectItem>
                <SelectItem value="subscription_access_disabled">Bloqueou assinaturas</SelectItem>
                <SelectItem value="user_blocked">Bloqueou usuário</SelectItem>
                <SelectItem value="user_unblocked">Desbloqueou usuário</SelectItem>
                <SelectItem value="user_deleted">Excluiu usuário</SelectItem>
                <SelectItem value="workspace_deleted">Excluiu workspace</SelectItem>
                <SelectItem value="password_reset">Resetou senha</SelectItem>
                <SelectItem value="workspace_created">Criou workspace</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : logs?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum registro de auditoria encontrado.
            </div>
          ) : (
            <>
              {/* Mobile Card View */}
              <div className="block lg:hidden space-y-3">
                {logs?.map((log) => (
                  <div key={log.id} className="p-4 rounded-lg border bg-card">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {actionIcons[log.action]}
                        {getActionBadge(log.action)}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(log.created_at), "dd/MM HH:mm", { locale: ptBR })}
                      </span>
                    </div>
                    <div className="mt-2 text-sm">
                      <p>
                        <span className="text-muted-foreground">Admin: </span>
                        {log.admin_profile?.full_name || "Desconhecido"}
                      </p>
                      {log.target_email && (
                        <p>
                          <span className="text-muted-foreground">Alvo: </span>
                          {log.target_email}
                        </p>
                      )}
                      {log.details && Object.keys(log.details).length > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {JSON.stringify(log.details)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table View */}
              <div className="hidden lg:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data/Hora</TableHead>
                      <TableHead>Administrador</TableHead>
                      <TableHead>Ação</TableHead>
                      <TableHead>Tipo Alvo</TableHead>
                      <TableHead>Email Alvo</TableHead>
                      <TableHead>Detalhes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs?.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="whitespace-nowrap">
                          {format(new Date(log.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        </TableCell>
                        <TableCell>
                          {log.admin_profile?.full_name || "Desconhecido"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {actionIcons[log.action]}
                            {getActionBadge(log.action)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {log.target_type === "user" ? "Usuário" : "Workspace"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {log.target_email || (
                            <span className="text-muted-foreground">
                              {log.target_id?.slice(0, 8)}...
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-xs truncate">
                          {log.details ? (
                            <span className="text-xs text-muted-foreground">
                              {JSON.stringify(log.details)}
                            </span>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </AdminLayout>
  );
};

export default AdminAuditLogs;
