import { useState } from "react";
import { AppLayout } from "@/fluzz/components/layout/AppLayout";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { useAuth } from "@/fluzz/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/fluzz/components/ui/card";
import { Button } from "@/fluzz/components/ui/button";
import { Input } from "@/fluzz/components/ui/input";
import { Label } from "@/fluzz/components/ui/label";
import { Textarea } from "@/fluzz/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/fluzz/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
  AlertDialogTrigger,
} from "@/fluzz/components/ui/alert-dialog";
import { UserPlus, Phone, Mail, Pencil, Trash2, Search, Users } from "lucide-react";
import { toast } from "sonner";

interface Participant {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  created_at: string;
}

export default function Participants() {
  const { workspace, isAdmin, isGestor } = useWorkspace();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Participant | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", notes: "" });

  const canEdit = isAdmin || isGestor;

  const { data: participants = [], isLoading } = useQuery({
    queryKey: ["external-participants", workspace?.id],
    queryFn: async () => {
      if (!workspace) return [];
      const { data, error } = await supabase
        .from("external_participants")
        .select("*")
        .eq("workspace_id", workspace.id)
        .order("name");
      if (error) throw error;
      return data as Participant[];
    },
    enabled: !!workspace,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const { error } = await supabase.from("external_participants").insert({
        workspace_id: workspace!.id,
        name: data.name,
        phone: data.phone,
        email: data.email || null,
        notes: data.notes || null,
        created_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["external-participants"] });
      toast.success("Participante adicionado!");
      closeDialog();
    },
    onError: () => toast.error("Erro ao adicionar participante"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof form }) => {
      const { error } = await supabase
        .from("external_participants")
        .update({
          name: data.name,
          phone: data.phone,
          email: data.email || null,
          notes: data.notes || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["external-participants"] });
      toast.success("Participante atualizado!");
      closeDialog();
    },
    onError: () => toast.error("Erro ao atualizar participante"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("external_participants").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["external-participants"] });
      toast.success("Participante removido!");
    },
    onError: () => toast.error("Erro ao remover participante"),
  });

  const closeDialog = () => {
    setDialogOpen(false);
    setEditing(null);
    setForm({ name: "", phone: "", email: "", notes: "" });
  };

  const openEdit = (p: Participant) => {
    setEditing(p);
    setForm({ name: p.name, phone: p.phone, email: p.email || "", notes: p.notes || "" });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.name.trim() || !form.phone.trim()) {
      toast.error("Nome e telefone são obrigatórios");
      return;
    }
    if (editing) {
      updateMutation.mutate({ id: editing.id, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const filtered = participants.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.phone.includes(search) ||
      (p.email && p.email.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <AppLayout>
      <div className="space-y-6 max-w-4xl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Participantes Externos</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Pessoas externas que podem ser atribuídas a tarefas
            </p>
          </div>
          {canEdit && (
            <Button onClick={() => setDialogOpen(true)} className="gap-2">
              <UserPlus className="h-4 w-4" />
              Adicionar Participante
            </Button>
          )}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, telefone ou email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                {search ? "Nenhum participante encontrado" : "Nenhum participante cadastrado"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {filtered.map((p) => (
              <Card key={p.id}>
                <CardContent className="flex items-center gap-4 p-4">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-accent text-accent-foreground font-medium">
                      {p.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{p.name}</p>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {p.phone}
                      </span>
                      {p.email && (
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {p.email}
                        </span>
                      )}
                    </div>
                    {p.notes && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">{p.notes}</p>
                    )}
                  </div>
                  {canEdit && (
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(p)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remover participante</AlertDialogTitle>
                            <AlertDialogDescription>
                              Tem certeza que deseja remover "{p.name}"? Isso também removerá suas atribuições em tarefas.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteMutation.mutate(p.id)}
                              className="bg-destructive text-destructive-foreground"
                            >
                              Remover
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editing ? "Editar Participante" : "Novo Participante"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Label>Nome *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Nome completo"
                />
              </div>
              <div>
                <Label>Telefone (WhatsApp) *</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="5511999999999"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Formato internacional sem + ou espaços
                </p>
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="email@exemplo.com"
                  type="email"
                />
              </div>
              <div>
                <Label>Observações</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Informações adicionais..."
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={closeDialog}>
                Cancelar
              </Button>
              <Button
                onClick={handleSave}
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {createMutation.isPending || updateMutation.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
