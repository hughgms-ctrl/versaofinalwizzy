import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/fluzz/components/ui/dialog";
import { Button } from "@/fluzz/components/ui/button";
import { Input } from "@/fluzz/components/ui/input";
import { Label } from "@/fluzz/components/ui/label";
import { Textarea } from "@/fluzz/components/ui/textarea";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { toast } from "sonner";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";

interface CreatePositionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreatePositionDialog({ open, onOpenChange }: CreatePositionDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");
      if (!workspace) throw new Error("Workspace não encontrado");

      const { error } = await supabase.from("positions").insert({
        name,
        description,
        created_by: user.id,
        workspace_id: workspace.id,
      });

      if (error) throw error;

      toast.success("Cargo criado com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["positions"] });
      setName("");
      setDescription("");
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || "Erro ao criar cargo");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Criar Novo Cargo/Setor</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome do Cargo *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Gerente de Vendas"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descreva as responsabilidades e objetivos deste cargo"
              rows={4}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Criando..." : "Criar Cargo"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
