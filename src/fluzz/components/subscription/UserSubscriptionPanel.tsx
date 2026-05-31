import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { useAuth } from "@/fluzz/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/fluzz/components/ui/card";
import { Badge } from "@/fluzz/components/ui/badge";
import { Button } from "@/fluzz/components/ui/button";
import { CreditCard, Users, Calendar, Percent, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface SubscriptionData {
  id: string;
  status: string;
  is_exempt: boolean;
  discount_percentage: number;
  current_amount: number;
  current_period_end: string | null;
  plan?: {
    name: string;
    price_per_user: number;
    free_users_limit: number;
  };
  workspace?: {
    name: string;
  };
  users_count?: number;
}

export const UserSubscriptionPanel = () => {
  const { user } = useAuth();

  // Check if user can access subscriptions panel
  const { data: canAccess, isLoading: checkingAccess } = useQuery({
    queryKey: ["subscription-access", user?.id],
    queryFn: async () => {
      if (!user?.id) return false;

      const { data, error } = await supabase
        .from("user_account_management")
        .select("can_access_subscriptions")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        console.error("Error checking subscription access:", error);
        return false;
      }

      console.log("Subscription access check:", { userId: user.id, data });
      return data?.can_access_subscriptions ?? false;
    },
    enabled: !!user?.id,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  // Get user's subscription
  const { data: subscription, isLoading: loadingSubscription } = useQuery({
    queryKey: ["user-subscription", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      const { data: subData, error } = await supabase
        .from("user_subscriptions")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (error && error.code !== "PGRST116") {
        console.error("Error fetching subscription:", error);
        return null;
      }

      if (!subData) return null;

      // Get plan details
      let plan = null;
      if (subData.plan_id) {
        const { data: planData } = await supabase
          .from("subscription_plans")
          .select("name, price_per_user, free_users_limit")
          .eq("id", subData.plan_id)
          .single();
        plan = planData;
      }

      // Get workspace and users count
      let workspace = null;
      let usersCount = 0;
      if (subData.workspace_id) {
        const { data: wsData } = await supabase
          .from("workspaces")
          .select("name")
          .eq("id", subData.workspace_id)
          .single();
        workspace = wsData;

        const { count } = await supabase
          .from("workspace_members")
          .select("*", { count: "exact", head: true })
          .eq("workspace_id", subData.workspace_id);
        usersCount = count || 0;
      }

      return {
        ...subData,
        plan,
        workspace,
        users_count: usersCount,
      } as SubscriptionData;
    },
    enabled: !!user?.id && canAccess === true,
  });

  // Don't show if user can't access
  if (checkingAccess || !canAccess) {
    return null;
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-500">Ativo</Badge>;
      case "trial":
        return <Badge className="bg-blue-500">Trial</Badge>;
      case "canceled":
        return <Badge variant="secondary">Cancelado</Badge>;
      case "past_due":
        return <Badge variant="destructive">Pagamento Pendente</Badge>;
      case "exempt":
        return <Badge className="bg-purple-500">Isento</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Minha Assinatura
        </CardTitle>
        <CardDescription>
          Gerencie sua assinatura e pagamentos
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loadingSubscription ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : !subscription ? (
          <div className="text-center py-6">
            <AlertCircle className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">
              Você ainda não possui uma assinatura ativa.
            </p>
            <Button className="mt-4">Escolher Plano</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Status</span>
              <div className="flex items-center gap-2">
                {getStatusBadge(subscription.status)}
                {subscription.is_exempt && (
                  <Badge variant="outline" className="text-purple-500">Isento</Badge>
                )}
              </div>
            </div>

            {subscription.plan && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Plano</span>
                <span className="font-medium">{subscription.plan.name}</span>
              </div>
            )}

            {subscription.workspace && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Workspace</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{subscription.workspace.name}</span>
                  <Badge variant="outline">
                    <Users className="h-3 w-3 mr-1" />
                    {subscription.users_count} usuários
                  </Badge>
                </div>
              </div>
            )}

            {subscription.discount_percentage > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Desconto</span>
                <Badge variant="outline" className="text-green-500">
                  <Percent className="h-3 w-3 mr-1" />
                  {subscription.discount_percentage}%
                </Badge>
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t">
              <span className="text-sm text-muted-foreground">Valor Atual</span>
              <span className="text-lg font-bold">
                {subscription.is_exempt ? (
                  <span className="text-purple-500">Isento</span>
                ) : (
                  formatCurrency(subscription.current_amount)
                )}
              </span>
            </div>

            {subscription.current_period_end && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Próxima Cobrança</span>
                <div className="flex items-center gap-1 text-sm">
                  <Calendar className="h-4 w-4" />
                  {format(new Date(subscription.current_period_end), "dd 'de' MMM 'de' yyyy", { locale: ptBR })}
                </div>
              </div>
            )}

            {subscription.status === "past_due" && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                <p className="text-sm text-destructive">
                  Seu pagamento está pendente. Atualize seu método de pagamento para continuar usando a plataforma.
                </p>
                <Button variant="destructive" size="sm" className="mt-2">
                  Atualizar Pagamento
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
