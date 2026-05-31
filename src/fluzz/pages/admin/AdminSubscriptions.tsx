import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { AdminLayout } from "@/fluzz/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/fluzz/components/ui/card";
import { Button } from "@/fluzz/components/ui/button";
import { Input } from "@/fluzz/components/ui/input";
import { Badge } from "@/fluzz/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/fluzz/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/fluzz/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/fluzz/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/fluzz/components/ui/dialog";
import { Label } from "@/fluzz/components/ui/label";
import { Textarea } from "@/fluzz/components/ui/textarea";
import { Switch } from "@/fluzz/components/ui/switch";
import { Search, Edit, Building2, Users, Percent, Ban } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAuth } from "@/fluzz/contexts/AuthContext";

interface SubscriptionWithDetails {
  id: string;
  user_id: string;
  workspace_id: string | null;
  plan_id: string | null;
  status: string;
  is_exempt: boolean;
  exempt_reason: string | null;
  discount_percentage: number;
  discount_reason: string | null;
  current_amount: number;
  created_at: string;
  user_profile?: {
    full_name: string | null;
    avatar_url: string | null;
  };
  workspace?: {
    name: string;
  };
  plan?: {
    name: string;
  };
  users_count?: number;
}

const AdminSubscriptions = () => {
  const [search, setSearch] = useState("");
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedSub, setSelectedSub] = useState<SubscriptionWithDetails | null>(null);
  const [formData, setFormData] = useState<{
    status: "active" | "trial" | "canceled" | "past_due" | "exempt";
    is_exempt: boolean;
    exempt_reason: string;
    discount_percentage: number;
    discount_reason: string;
  }>({
    status: "active",
    is_exempt: false,
    exempt_reason: "",
    discount_percentage: 0,
    discount_reason: "",
  });
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: subscriptions, isLoading } = useQuery({
    queryKey: ["admin-subscriptions", search],
    queryFn: async () => {
      let query = supabase
        .from("user_subscriptions")
        .select("*")
        .order("created_at", { ascending: false });

      const { data, error } = await query;
      if (error) throw error;

      // Fetch related data
      const subsWithDetails = await Promise.all(
        (data || []).map(async (sub) => {
          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name, avatar_url")
            .eq("id", sub.user_id)
            .single();

          let workspace = null;
          let usersCount = 0;
          if (sub.workspace_id) {
            const { data: ws } = await supabase
              .from("workspaces")
              .select("name")
              .eq("id", sub.workspace_id)
              .single();
            workspace = ws;

            const { count } = await supabase
              .from("workspace_members")
              .select("*", { count: "exact", head: true })
              .eq("workspace_id", sub.workspace_id);
            usersCount = count || 0;
          }

          let plan = null;
          if (sub.plan_id) {
            const { data: p } = await supabase
              .from("subscription_plans")
              .select("name")
              .eq("id", sub.plan_id)
              .single();
            plan = p;
          }

          return {
            ...sub,
            user_profile: profile,
            workspace,
            plan,
            users_count: usersCount,
          } as SubscriptionWithDetails;
        })
      );

      // Filter by search
      if (search) {
        return subsWithDetails.filter(
          (s) =>
            s.user_profile?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
            s.workspace?.name?.toLowerCase().includes(search.toLowerCase())
        );
      }

      return subsWithDetails;
    },
  });

  const { data: plans } = useQuery({
    queryKey: ["subscription-plans-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_plans")
        .select("id, name")
        .eq("is_active", true);
      if (error) throw error;
      return data;
    },
  });

  const updateSubscriptionMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const { error } = await supabase
        .from("user_subscriptions")
        .update({
          status: data.status,
          is_exempt: data.is_exempt,
          exempt_reason: data.is_exempt ? data.exempt_reason : null,
          exempt_by: data.is_exempt ? user?.id : null,
          discount_percentage: data.discount_percentage,
          discount_reason: data.discount_percentage > 0 ? data.discount_reason : null,
          discount_by: data.discount_percentage > 0 ? user?.id : null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Assinatura atualizada com sucesso");
      queryClient.invalidateQueries({ queryKey: ["admin-subscriptions"] });
      setEditDialogOpen(false);
      setSelectedSub(null);
    },
    onError: () => {
      toast.error("Erro ao atualizar assinatura");
    },
  });

  const openEditDialog = (sub: SubscriptionWithDetails) => {
    setSelectedSub(sub);
    const validStatuses = ["active", "trial", "canceled", "past_due", "exempt"] as const;
    const status = validStatuses.includes(sub.status as typeof validStatuses[number]) 
      ? (sub.status as typeof validStatuses[number]) 
      : "active";
    setFormData({
      status,
      is_exempt: sub.is_exempt,
      exempt_reason: sub.exempt_reason || "",
      discount_percentage: sub.discount_percentage,
      discount_reason: sub.discount_reason || "",
    });
    setEditDialogOpen(true);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-500">Ativo</Badge>;
      case "trial":
        return <Badge className="bg-blue-500">Trial</Badge>;
      case "canceled":
        return <Badge variant="secondary">Cancelado</Badge>;
      case "past_due":
        return <Badge variant="destructive">Atrasado</Badge>;
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
    <AdminLayout
      title="Gestão de Assinaturas"
      description="Gerencie as assinaturas, descontos e isenções"
    >
      <Card>
        <CardHeader>
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por usuário ou workspace..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : subscriptions?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhuma assinatura encontrada
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Workspace</TableHead>
                    <TableHead>Plano</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Desconto</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subscriptions?.map((sub) => (
                    <TableRow key={sub.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={sub.user_profile?.avatar_url || undefined} />
                            <AvatarFallback>
                              {sub.user_profile?.full_name?.charAt(0) || "?"}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium">
                            {sub.user_profile?.full_name || "Sem nome"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {sub.workspace ? (
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            <span>{sub.workspace.name}</span>
                            <Badge variant="outline" className="text-xs">
                              <Users className="h-3 w-3 mr-1" />
                              {sub.users_count}
                            </Badge>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>{sub.plan?.name || "-"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getStatusBadge(sub.status)}
                          {sub.is_exempt && (
                            <Badge variant="outline" className="text-purple-500">
                              <Ban className="h-3 w-3 mr-1" />
                              Isento
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {sub.discount_percentage > 0 ? (
                          <Badge variant="outline" className="text-green-500">
                            <Percent className="h-3 w-3 mr-1" />
                            {sub.discount_percentage}%
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">
                        {formatCurrency(sub.current_amount)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(sub)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Assinatura</DialogTitle>
            <DialogDescription>
              Configure status, descontos e isenções para esta assinatura.
            </DialogDescription>
          </DialogHeader>
          {selectedSub && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-muted">
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarImage src={selectedSub.user_profile?.avatar_url || undefined} />
                    <AvatarFallback>
                      {selectedSub.user_profile?.full_name?.charAt(0) || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{selectedSub.user_profile?.full_name}</p>
                    {selectedSub.workspace && (
                      <p className="text-sm text-muted-foreground">
                        {selectedSub.workspace.name} • {selectedSub.users_count} usuários
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(v: "active" | "trial" | "canceled" | "past_due" | "exempt") => setFormData({ ...formData, status: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Ativo</SelectItem>
                    <SelectItem value="trial">Trial</SelectItem>
                    <SelectItem value="canceled">Cancelado</SelectItem>
                    <SelectItem value="past_due">Atrasado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Isentar Cobrança</Label>
                  <p className="text-xs text-muted-foreground">
                    Este usuário não será cobrado
                  </p>
                </div>
                <Switch
                  checked={formData.is_exempt}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, is_exempt: checked })
                  }
                />
              </div>

              {formData.is_exempt && (
                <div className="space-y-2">
                  <Label>Motivo da Isenção</Label>
                  <Textarea
                    value={formData.exempt_reason}
                    onChange={(e) =>
                      setFormData({ ...formData, exempt_reason: e.target.value })
                    }
                    placeholder="Ex: Parceiro estratégico, cliente beta..."
                  />
                </div>
              )}

              {!formData.is_exempt && (
                <>
                  <div className="space-y-2">
                    <Label>Desconto (%)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={formData.discount_percentage}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          discount_percentage: parseFloat(e.target.value) || 0,
                        })
                      }
                    />
                  </div>

                  {formData.discount_percentage > 0 && (
                    <div className="space-y-2">
                      <Label>Motivo do Desconto</Label>
                      <Textarea
                        value={formData.discount_reason}
                        onChange={(e) =>
                          setFormData({ ...formData, discount_reason: e.target.value })
                        }
                        placeholder="Ex: Desconto promocional, early adopter..."
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() =>
                selectedSub &&
                updateSubscriptionMutation.mutate({ id: selectedSub.id, data: formData })
              }
              disabled={updateSubscriptionMutation.isPending}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminSubscriptions;
