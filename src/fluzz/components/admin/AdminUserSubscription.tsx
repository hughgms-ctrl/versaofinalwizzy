import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/fluzz/components/ui/card";
import { Badge } from "@/fluzz/components/ui/badge";
import { 
  CreditCard, 
  Calendar,
  DollarSign,
  Building2
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Plan {
  id: string;
  name: string;
  price_per_user: number;
  price_per_workspace: number;
  billing_period: string;
}

interface Workspace {
  id: string;
  name: string;
}

interface Subscription {
  id: string;
  status: string;
  is_exempt: boolean;
  exempt_reason: string | null;
  discount_percentage: number | null;
  discount_reason: string | null;
  current_amount: number;
  trial_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  canceled_at: string | null;
  payment_provider: string | null;
  payment_provider_subscription_id: string | null;
  plan: Plan | null;
  workspace: Workspace | null;
}

interface AdminUserSubscriptionProps {
  userId: string;
  subscription: Subscription | null;
}

export const AdminUserSubscription = ({ userId, subscription }: AdminUserSubscriptionProps) => {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-500">Ativo</Badge>;
      case "trial":
        return <Badge className="bg-blue-500">Trial</Badge>;
      case "past_due":
        return <Badge variant="destructive">Pagamento Pendente</Badge>;
      case "canceled":
        return <Badge variant="secondary">Cancelado</Badge>;
      case "unpaid":
        return <Badge variant="destructive">Não Pago</Badge>;
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

  if (!subscription) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Assinatura
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">
            Nenhuma assinatura ativa
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Assinatura
        </CardTitle>
        <CardDescription>
          Detalhes da assinatura e pagamento
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Status and Plan */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-lg bg-muted">
            <p className="text-sm text-muted-foreground">Status</p>
            <div className="mt-1">{getStatusBadge(subscription.status)}</div>
          </div>
          
          <div className="p-4 rounded-lg bg-muted">
            <p className="text-sm text-muted-foreground">Plano</p>
            <p className="font-medium mt-1">{subscription.plan?.name || "N/A"}</p>
          </div>
          
          <div className="p-4 rounded-lg bg-muted">
            <p className="text-sm text-muted-foreground">Periodicidade</p>
            <p className="font-medium mt-1">
              {subscription.plan?.billing_period === "annual" ? "Anual" : "Mensal"}
            </p>
          </div>
          
          <div className="p-4 rounded-lg bg-muted">
            <p className="text-sm text-muted-foreground">Valor Atual</p>
            <p className="font-medium mt-1">{formatCurrency(subscription.current_amount)}</p>
          </div>
        </div>

        {/* Workspace */}
        {subscription.workspace && (
          <div className="p-4 rounded-lg bg-muted">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Workspace Vinculado</p>
            </div>
            <p className="font-medium mt-1">{subscription.workspace.name}</p>
          </div>
        )}

        {/* Dates */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {subscription.current_period_start && (
            <div className="p-4 rounded-lg bg-muted">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Início do Período</p>
              </div>
              <p className="font-medium mt-1">
                {format(new Date(subscription.current_period_start), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
              </p>
            </div>
          )}
          
          {subscription.current_period_end && (
            <div className="p-4 rounded-lg bg-muted">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Próxima Renovação</p>
              </div>
              <p className="font-medium mt-1">
                {format(new Date(subscription.current_period_end), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
              </p>
            </div>
          )}
          
          {subscription.trial_ends_at && (
            <div className="p-4 rounded-lg bg-muted">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Fim do Trial</p>
              </div>
              <p className="font-medium mt-1">
                {format(new Date(subscription.trial_ends_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
              </p>
            </div>
          )}
        </div>

        {/* Exemption and Discount */}
        {(subscription.is_exempt || (subscription.discount_percentage && subscription.discount_percentage > 0)) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {subscription.is_exempt && (
              <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800">
                <p className="text-sm font-medium text-green-700 dark:text-green-300">Isento de Pagamento</p>
                {subscription.exempt_reason && (
                  <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                    {subscription.exempt_reason}
                  </p>
                )}
              </div>
            )}
            
            {subscription.discount_percentage && subscription.discount_percentage > 0 && (
              <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
                <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
                  Desconto de {subscription.discount_percentage}%
                </p>
                {subscription.discount_reason && (
                  <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">
                    {subscription.discount_reason}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Payment Provider */}
        {subscription.payment_provider && (
          <div className="p-4 rounded-lg bg-muted">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Provedor de Pagamento</p>
            </div>
            <p className="font-medium mt-1 capitalize">{subscription.payment_provider}</p>
            {subscription.payment_provider_subscription_id && (
              <p className="text-xs text-muted-foreground mt-1">
                ID: {subscription.payment_provider_subscription_id}
              </p>
            )}
          </div>
        )}

        {/* Canceled */}
        {subscription.canceled_at && (
          <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800">
            <p className="text-sm font-medium text-red-700 dark:text-red-300">
              Cancelado em {format(new Date(subscription.canceled_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
