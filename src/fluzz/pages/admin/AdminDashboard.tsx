import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { AdminLayout } from "@/fluzz/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/fluzz/components/ui/card";
import { 
  Users, 
  Building2, 
  CreditCard, 
  TrendingUp,
  UserCheck,
  UserX,
  Clock
} from "lucide-react";

const AdminDashboard = () => {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["admin-dashboard-stats"],
    queryFn: async () => {
      // Get total users
      const { count: totalUsers } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true });

      // Get total workspaces
      const { count: totalWorkspaces } = await supabase
        .from("workspaces")
        .select("*", { count: "exact", head: true });

      // Get blocked users
      const { count: blockedUsers } = await supabase
        .from("user_account_management")
        .select("*", { count: "exact", head: true })
        .eq("status", "blocked");

      // Get users with subscription panel enabled
      const { count: subscriptionEnabled } = await supabase
        .from("user_account_management")
        .select("*", { count: "exact", head: true })
        .eq("can_access_subscriptions", true);

      // Get recent users (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const { count: recentUsers } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .gte("created_at", sevenDaysAgo.toISOString());

      // Get active subscriptions
      const { count: activeSubscriptions } = await supabase
        .from("user_subscriptions")
        .select("*", { count: "exact", head: true })
        .eq("status", "active");

      return {
        totalUsers: totalUsers || 0,
        totalWorkspaces: totalWorkspaces || 0,
        blockedUsers: blockedUsers || 0,
        subscriptionEnabled: subscriptionEnabled || 0,
        recentUsers: recentUsers || 0,
        activeSubscriptions: activeSubscriptions || 0,
      };
    },
  });

  const statCards = [
    {
      title: "Total de Usuários",
      value: stats?.totalUsers || 0,
      icon: Users,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      title: "Workspaces Ativos",
      value: stats?.totalWorkspaces || 0,
      icon: Building2,
      color: "text-purple-500",
      bgColor: "bg-purple-500/10",
    },
    {
      title: "Usuários Bloqueados",
      value: stats?.blockedUsers || 0,
      icon: UserX,
      color: "text-red-500",
      bgColor: "bg-red-500/10",
    },
    {
      title: "Novos (7 dias)",
      value: stats?.recentUsers || 0,
      icon: Clock,
      color: "text-green-500",
      bgColor: "bg-green-500/10",
    },
    {
      title: "Painel Assinaturas Liberado",
      value: stats?.subscriptionEnabled || 0,
      icon: UserCheck,
      color: "text-amber-500",
      bgColor: "bg-amber-500/10",
    },
    {
      title: "Assinaturas Ativas",
      value: stats?.activeSubscriptions || 0,
      icon: CreditCard,
      color: "text-emerald-500",
      bgColor: "bg-emerald-500/10",
    },
  ];

  return (
    <AdminLayout 
      title="Dashboard" 
      description="Visão geral da plataforma"
    >
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-20 bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {statCards.map((stat) => (
            <Card key={stat.title}>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-lg ${stat.bgColor}`}>
                    <stat.icon className={`h-6 w-6 ${stat.color}`} />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.title}</p>
                    <p className="text-3xl font-bold">{stat.value}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Ações Rápidas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link 
              to="/tools/wizzy-flow/admin/users" 
              className="block p-4 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
            >
              <p className="font-medium">Gerenciar Usuários</p>
              <p className="text-sm text-muted-foreground">
                Bloquear, excluir ou gerenciar permissões de usuários
              </p>
            </Link>
            <Link 
              to="/tools/wizzy-flow/admin/plans" 
              className="block p-4 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
            >
              <p className="font-medium">Configurar Planos</p>
              <p className="text-sm text-muted-foreground">
                Criar e editar planos de assinatura
              </p>
            </Link>
            <Link 
              to="/tools/wizzy-flow/admin/team" 
              className="block p-4 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
            >
              <p className="font-medium">Equipe Administrativa</p>
              <p className="text-sm text-muted-foreground">
                Adicionar ou remover administradores
              </p>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Informações do Sistema</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted">
              <span className="text-sm">Painel de Assinaturas</span>
              <span className="text-sm font-medium text-amber-500">
                Liberação Manual
              </span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted">
              <span className="text-sm">Integração de Pagamentos</span>
              <span className="text-sm font-medium text-muted-foreground">
                Não configurado
              </span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted">
              <span className="text-sm">Cobrança Automática</span>
              <span className="text-sm font-medium text-muted-foreground">
                Desabilitada
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default AdminDashboard;
