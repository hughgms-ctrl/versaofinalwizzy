import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { AdminLayout } from "@/fluzz/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/fluzz/components/ui/card";
import { Button } from "@/fluzz/components/ui/button";
import { Input } from "@/fluzz/components/ui/input";
import { Label } from "@/fluzz/components/ui/label";
import { Textarea } from "@/fluzz/components/ui/textarea";
import { Switch } from "@/fluzz/components/ui/switch";
import { Badge } from "@/fluzz/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/fluzz/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/fluzz/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/fluzz/components/ui/alert-dialog";
import { Plus, Edit, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/fluzz/contexts/AuthContext";

interface Plan {
  id: string;
  name: string;
  description: string | null;
  price_per_workspace: number;
  price_per_user: number;
  free_users_limit: number;
  is_workspace_owner_free: boolean;
  is_active: boolean;
  features: string[];
  created_at: string;
  billing_period: string;
  annual_price_per_user: number;
  annual_price_per_workspace: number;
  annual_discount_percentage: number;
}

const AdminPlans = () => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    price_per_workspace: 0,
    price_per_user: 0,
    free_users_limit: 3,
    is_workspace_owner_free: true,
    is_active: true,
    features: "",
    billing_period: "monthly",
    annual_price_per_user: 0,
    annual_price_per_workspace: 0,
    annual_discount_percentage: 0,
  });
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: plans, isLoading } = useQuery({
    queryKey: ["admin-plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_plans")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Plan[];
    },
  });

  const createPlanMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase.from("subscription_plans").insert({
        name: data.name,
        description: data.description || null,
        price_per_workspace: data.price_per_workspace,
        price_per_user: data.price_per_user,
        free_users_limit: data.free_users_limit,
        is_workspace_owner_free: data.is_workspace_owner_free,
        is_active: data.is_active,
        features: data.features.split("\n").filter((f) => f.trim()),
        created_by: user?.id,
        billing_period: data.billing_period,
        annual_price_per_user: data.annual_price_per_user,
        annual_price_per_workspace: data.annual_price_per_workspace,
        annual_discount_percentage: data.annual_discount_percentage,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Plano criado com sucesso");
      queryClient.invalidateQueries({ queryKey: ["admin-plans"] });
      setDialogOpen(false);
      resetForm();
    },
    onError: () => {
      toast.error("Erro ao criar plano");
    },
  });

  const updatePlanMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const { error } = await supabase
        .from("subscription_plans")
        .update({
          name: data.name,
          description: data.description || null,
          price_per_workspace: data.price_per_workspace,
          price_per_user: data.price_per_user,
          free_users_limit: data.free_users_limit,
          is_workspace_owner_free: data.is_workspace_owner_free,
          is_active: data.is_active,
          features: data.features.split("\n").filter((f) => f.trim()),
          billing_period: data.billing_period,
          annual_price_per_user: data.annual_price_per_user,
          annual_price_per_workspace: data.annual_price_per_workspace,
          annual_discount_percentage: data.annual_discount_percentage,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Plano atualizado com sucesso");
      queryClient.invalidateQueries({ queryKey: ["admin-plans"] });
      setDialogOpen(false);
      resetForm();
    },
    onError: () => {
      toast.error("Erro ao atualizar plano");
    },
  });

  const deletePlanMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("subscription_plans").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Plano excluído com sucesso");
      queryClient.invalidateQueries({ queryKey: ["admin-plans"] });
      setDeleteDialogOpen(false);
      setSelectedPlan(null);
    },
    onError: () => {
      toast.error("Erro ao excluir plano");
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      price_per_workspace: 0,
      price_per_user: 0,
      free_users_limit: 3,
      is_workspace_owner_free: true,
      is_active: true,
      features: "",
      billing_period: "monthly",
      annual_price_per_user: 0,
      annual_price_per_workspace: 0,
      annual_discount_percentage: 0,
    });
    setSelectedPlan(null);
  };

  const openEditDialog = (plan: Plan) => {
    setSelectedPlan(plan);
    setFormData({
      name: plan.name,
      description: plan.description || "",
      price_per_workspace: plan.price_per_workspace,
      price_per_user: plan.price_per_user,
      free_users_limit: plan.free_users_limit,
      is_workspace_owner_free: plan.is_workspace_owner_free,
      is_active: plan.is_active,
      features: (plan.features || []).join("\n"),
      billing_period: plan.billing_period || "monthly",
      annual_price_per_user: plan.annual_price_per_user || 0,
      annual_price_per_workspace: plan.annual_price_per_workspace || 0,
      annual_discount_percentage: plan.annual_discount_percentage || 0,
    });
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedPlan) {
      updatePlanMutation.mutate({ id: selectedPlan.id, data: formData });
    } else {
      createPlanMutation.mutate(formData);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  return (
    <AdminLayout title="Planos de Assinatura" description="Configure os planos e preços da plataforma">
      <div className="flex justify-end mb-6">
        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) resetForm();
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Novo Plano
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{selectedPlan ? "Editar Plano" : "Novo Plano"}</DialogTitle>
              <DialogDescription>
                Configure os detalhes e preços do plano de assinatura.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome do Plano</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Plano Profissional"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descrição</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Descrição do plano..."
                />
              </div>

              <div className="space-y-2">
                <Label>Periodicidade Padrão</Label>
                <Select
                  value={formData.billing_period}
                  onValueChange={(value) => setFormData({ ...formData, billing_period: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Mensal</SelectItem>
                    <SelectItem value="annual">Anual</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <Label className="text-base font-medium">Preços Mensais</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="price_workspace" className="text-sm">Por Workspace (R$)</Label>
                    <Input
                      id="price_workspace"
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.price_per_workspace}
                      onChange={(e) =>
                        setFormData({ ...formData, price_per_workspace: parseFloat(e.target.value) || 0 })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="price_user" className="text-sm">Por Usuário (R$)</Label>
                    <Input
                      id="price_user"
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.price_per_user}
                      onChange={(e) =>
                        setFormData({ ...formData, price_per_user: parseFloat(e.target.value) || 0 })
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-base font-medium">Preços Anuais</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="annual_price_workspace" className="text-sm">Por Workspace (R$)</Label>
                    <Input
                      id="annual_price_workspace"
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.annual_price_per_workspace}
                      onChange={(e) =>
                        setFormData({ ...formData, annual_price_per_workspace: parseFloat(e.target.value) || 0 })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="annual_price_user" className="text-sm">Por Usuário (R$)</Label>
                    <Input
                      id="annual_price_user"
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.annual_price_per_user}
                      onChange={(e) =>
                        setFormData({ ...formData, annual_price_per_user: parseFloat(e.target.value) || 0 })
                      }
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="annual_discount">Desconto Anual (%)</Label>
                  <Input
                    id="annual_discount"
                    type="number"
                    min="0"
                    max="100"
                    value={formData.annual_discount_percentage}
                    onChange={(e) =>
                      setFormData({ ...formData, annual_discount_percentage: parseFloat(e.target.value) || 0 })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Exibido como economia para usuários
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="free_users">Usuários Grátis</Label>
                <Input
                  id="free_users"
                  type="number"
                  min="0"
                  value={formData.free_users_limit}
                  onChange={(e) =>
                    setFormData({ ...formData, free_users_limit: parseInt(e.target.value) || 0 })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Quantidade de usuários inclusos sem custo adicional
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Dono do Workspace Grátis</Label>
                  <p className="text-xs text-muted-foreground">
                    O criador do workspace não paga
                  </p>
                </div>
                <Switch
                  checked={formData.is_workspace_owner_free}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, is_workspace_owner_free: checked })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Plano Ativo</Label>
                  <p className="text-xs text-muted-foreground">
                    Disponível para novos usuários
                  </p>
                </div>
                <Switch
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="features">Recursos (um por linha)</Label>
                <Textarea
                  id="features"
                  value={formData.features}
                  onChange={(e) => setFormData({ ...formData, features: e.target.value })}
                  placeholder="Acesso completo&#10;Suporte prioritário&#10;Relatórios avançados"
                  rows={4}
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={createPlanMutation.isPending || updatePlanMutation.isPending}
                >
                  {selectedPlan ? "Salvar" : "Criar Plano"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-40 bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans?.map((plan) => (
            <Card key={plan.id} className={!plan.is_active ? "opacity-60" : ""}>
              <CardHeader className="flex flex-row items-start justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {plan.name}
                    {!plan.is_active && <Badge variant="secondary">Inativo</Badge>}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">{plan.description}</p>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEditDialog(plan)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setSelectedPlan(plan);
                      setDeleteDialogOpen(true);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Periodicidade:</span>
                    <Badge variant={plan.billing_period === "annual" ? "default" : "secondary"}>
                      {plan.billing_period === "annual" ? "Anual" : "Mensal"}
                    </Badge>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 rounded-lg bg-muted">
                    <p className="text-xs text-muted-foreground">Mensal/Workspace</p>
                    <p className="text-lg font-bold">{formatCurrency(plan.price_per_workspace)}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted">
                    <p className="text-xs text-muted-foreground">Mensal/Usuário</p>
                    <p className="text-lg font-bold">{formatCurrency(plan.price_per_user)}</p>
                  </div>
                </div>

                {(plan.annual_price_per_workspace > 0 || plan.annual_price_per_user > 0) && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 rounded-lg bg-primary/10">
                      <p className="text-xs text-muted-foreground">Anual/Workspace</p>
                      <p className="text-lg font-bold">{formatCurrency(plan.annual_price_per_workspace)}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-primary/10">
                      <p className="text-xs text-muted-foreground">Anual/Usuário</p>
                      <p className="text-lg font-bold">{formatCurrency(plan.annual_price_per_user)}</p>
                    </div>
                  </div>
                )}

                {plan.annual_discount_percentage > 0 && (
                  <Badge className="bg-green-500">
                    Economia de {plan.annual_discount_percentage}% no plano anual
                  </Badge>
                )}

                <div className="flex items-center gap-2 text-sm">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span>{plan.free_users_limit} usuários grátis</span>
                  {plan.is_workspace_owner_free && (
                    <Badge variant="outline" className="text-xs">
                      Dono grátis
                    </Badge>
                  )}
                </div>

                {plan.features && plan.features.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Recursos:</p>
                    <ul className="text-sm space-y-1">
                      {plan.features.slice(0, 3).map((feature, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                          {feature}
                        </li>
                      ))}
                      {plan.features.length > 3 && (
                        <li className="text-muted-foreground">
                          +{plan.features.length - 3} mais
                        </li>
                      )}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Plano</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o plano "{selectedPlan?.name}"? Esta ação não
              pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => selectedPlan && deletePlanMutation.mutate(selectedPlan.id)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
};

export default AdminPlans;
