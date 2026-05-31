import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/fluzz/components/ui/dialog";
import { Button } from "@/fluzz/components/ui/button";
import { Input } from "@/fluzz/components/ui/input";
import { Label } from "@/fluzz/components/ui/label";
import { Textarea } from "@/fluzz/components/ui/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { toast } from "sonner";

interface EditInventoryItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: {
    id: string;
    name: string;
    description?: string;
    unit: string;
  };
}

export function EditInventoryItemDialog({
  open,
  onOpenChange,
  item,
}: EditInventoryItemDialogProps) {
  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description || "");
  const [unit, setUnit] = useState(item.unit);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) {
      setName(item.name);
      setDescription(item.description || "");
      setUnit(item.unit);
    }
  }, [open, item]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("inventory_items")
        .update({
          name,
          description: description || null,
          unit,
        })
        .eq("id", item.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory-items"] });
      toast.success("Item atualizado com sucesso");
      onOpenChange(false);
    },
    onError: () => {
      toast.error("Erro ao atualizar item");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    updateMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar Item</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome do item"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descrição do item (opcional)"
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="unit">Unidade</Label>
            <Input
              id="unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="un, kg, m, etc."
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
