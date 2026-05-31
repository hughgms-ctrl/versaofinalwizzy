import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, ArrowUpRight, CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, CreditCard, Loader2, ReceiptText } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://zaobtetbjpuzibjymhzw.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

function formatDate(value?: string | null) {
  if (!value) return "Não informado";
  return new Date(value).toLocaleDateString("pt-BR");
}

function formatMoney(value: unknown) {
  const amount = Number(value || 0);
  return amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function getStatusLabel(status?: string | null) {
  const normalized = String(status || "pending").toLowerCase();
  const labels: Record<string, string> = {
    active: "Ativo",
    paid: "Pago",
    pending: "Pendente",
    past_due: "Em atraso",
    overdue: "Em atraso",
    canceled: "Cancelado",
    inactive: "Inativo",
  };
  return labels[normalized] || status || "Pendente";
}

function getStatusVariant(status?: string | null): "default" | "secondary" | "destructive" | "outline" {
  const normalized = String(status || "").toLowerCase();
  if (["active", "paid"].includes(normalized)) return "default";
  if (["past_due", "overdue"].includes(normalized)) return "destructive";
  if (["pending", "inactive"].includes(normalized)) return "secondary";
  return "outline";
}

function getEventAmount(payload: any) {
  if (payload?.payment?.value) return Number(payload.payment.value);
  if (payload?.data?.object?.amount_total) return Number(payload.data.object.amount_total) / 100;
  return null;
}

function getEventStatus(payload: any, fallback: string) {
  return payload?.payment?.status || payload?.subscription?.status || payload?.data?.object?.status || fallback;
}

export function SubscriptionManagementPanel() {
  const { profile } = useAuth();
  const [isOpeningCheckout, setIsOpeningCheckout] = useState(false);
  const [invoicePage, setInvoicePage] = useState(1);
  const invoicePageSize = 10;

  const { data, isLoading } = useQuery({
    queryKey: ["profile-subscription-management", profile?.organization_id, invoicePage],
    queryFn: async () => {
      if (!profile?.organization_id) return null;
      const from = (invoicePage - 1) * invoicePageSize;
      const to = from + invoicePageSize - 1;

      const [planResult, eventsResult] = await Promise.all([
        supabase
          .from("organization_plans")
          .select("*, plan:platform_plans(*)")
          .eq("organization_id", profile.organization_id)
          .maybeSingle(),
        supabase
          .from("billing_events" as any)
          .select("event_type, payload, processed_at", { count: "exact" })
          .eq("organization_id", profile.organization_id)
          .order("processed_at", { ascending: false })
          .range(from, to),
      ]);

      if (planResult.error) throw planResult.error;

      return {
        currentPlan: planResult.data as any,
        events: eventsResult.error ? [] : ((eventsResult.data || []) as any[]),
        eventsCount: eventsResult.count || 0,
      };
    },
    enabled: !!profile?.organization_id,
  });

  const currentPlan = data?.currentPlan;
  const plan = currentPlan?.plan;
  const paymentStatus = currentPlan?.payment_status || currentPlan?.status;
  const isPastDue = ["past_due", "overdue"].includes(String(paymentStatus || "").toLowerCase());
  const hasPlan = Boolean(currentPlan?.plan_id);
  const invoiceCount = data?.eventsCount || 0;
  const totalInvoicePages = Math.max(1, Math.ceil(invoiceCount / invoicePageSize));

  const invoices = useMemo(() => {
    return (data?.events || []).map((event) => ({
      date: event.processed_at,
      type: event.event_type,
      status: getEventStatus(event.payload, event.event_type),
      amount: getEventAmount(event.payload),
    }));
  }, [data?.events]);

  const openCheckoutForCurrentPlan = async () => {
    if (!currentPlan?.plan_id) return;

    try {
      setIsOpeningCheckout(true);
      const { data: session } = await supabase.auth.getSession();
      const accessToken = session.session?.access_token;
      if (!accessToken) throw new Error("Sessão expirada. Entre novamente para continuar.");

      const response = await fetch(`${SUPABASE_URL}/functions/v1/billing-checkout`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          plan_id: currentPlan.plan_id,
          billing_cycle: currentPlan.billing_cycle || "monthly",
        }),
      });
      const checkout = await response.json().catch(() => null);

      if (!response.ok) throw new Error(checkout?.error || "Não foi possível iniciar o pagamento.");
      if (!checkout?.url) throw new Error("O checkout não retornou uma URL de pagamento.");

      window.location.href = checkout.url;
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível iniciar o pagamento.");
    } finally {
      setIsOpeningCheckout(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-36 w-full" />
      </div>
    );
  }

  if (!hasPlan) {
    return (
      <div className="rounded-lg border bg-muted/30 p-5 md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <CreditCard className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h4 className="font-semibold">Escolha um plano para o workspace</h4>
              <p className="mt-1 text-sm text-muted-foreground">
                Ao contratar, o pagamento confirmado pelo gateway ativa o plano automaticamente.
              </p>
            </div>
          </div>
          <Button asChild>
            <Link to="/plans">
              Ver planos
              <ArrowUpRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {isPastDue && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Pagamento em atraso</AlertTitle>
          <AlertDescription>
            Regularize a assinatura para manter o workspace ativo e evitar bloqueios automáticos.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border bg-muted/20 p-4">
          <p className="text-xs text-muted-foreground">Plano atual</p>
          <div className="mt-2 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <p className="font-semibold">{plan?.name || "Plano"}</p>
          </div>
        </div>
        <div className="rounded-lg border bg-muted/20 p-4">
          <p className="text-xs text-muted-foreground">Status</p>
          <div className="mt-2">
            <Badge variant={getStatusVariant(paymentStatus)}>{getStatusLabel(paymentStatus)}</Badge>
          </div>
        </div>
        <div className="rounded-lg border bg-muted/20 p-4">
          <p className="text-xs text-muted-foreground">Próximo vencimento</p>
          <div className="mt-2 flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
            <p className="font-semibold">{formatDate(currentPlan?.current_period_end)}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        {isPastDue && (
          <Button onClick={openCheckoutForCurrentPlan} disabled={isOpeningCheckout}>
            {isOpeningCheckout ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ReceiptText className="mr-2 h-4 w-4" />}
            Pagar pendência
          </Button>
        )}
        <Button asChild variant={isPastDue ? "outline" : "default"}>
          <Link to="/plans">
            Alterar plano
            <ArrowUpRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>

      <div className="rounded-lg border">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h4 className="font-semibold">Histórico de faturas</h4>
            <p className="text-xs text-muted-foreground">Eventos de cobrança recebidos do gateway.</p>
          </div>
          <ReceiptText className="h-4 w-4 text-muted-foreground" />
        </div>
        {invoices.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Evento</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((invoice, index) => (
                <TableRow key={`${invoice.type}-${invoice.date}-${index}`}>
                  <TableCell>{formatDate(invoice.date)}</TableCell>
                  <TableCell>
                    <Badge variant={getStatusVariant(invoice.status)}>{getStatusLabel(invoice.status)}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{invoice.type}</TableCell>
                  <TableCell className="text-right">{invoice.amount ? formatMoney(invoice.amount) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="p-4 text-sm text-muted-foreground">
            Nenhuma fatura encontrada ainda.
          </div>
        )}
        {invoiceCount > invoicePageSize && (
          <div className="flex items-center justify-between border-t px-4 py-3">
            <p className="text-xs text-muted-foreground">
              Página {invoicePage} de {totalInvoicePages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={invoicePage <= 1}
                onClick={() => setInvoicePage((page) => Math.max(1, page - 1))}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={invoicePage >= totalInvoicePages}
                onClick={() => setInvoicePage((page) => Math.min(totalInvoicePages, page + 1))}
              >
                Próxima
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
