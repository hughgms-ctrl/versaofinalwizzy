import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/fluzz/components/ui/dialog";
import { Button } from "@/fluzz/components/ui/button";
import { Input } from "@/fluzz/components/ui/input";
import { Label } from "@/fluzz/components/ui/label";
import { Textarea } from "@/fluzz/components/ui/textarea";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface RegisterMovementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId: string;
  itemName: string;
  type: "entrada" | "saida";
}

export function RegisterMovementDialog({ 
  open, 
  onOpenChange, 
  itemId, 
  itemName,
  type 
}: RegisterMovementDialogProps) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    quantity: "",
    notes: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const quantity = parseInt(formData.quantity);

      // Get current item
      const { data: item, error: fetchError } = await supabase
        .from("inventory_items")
        .select("quantity")
        .eq("id", itemId)
        .single();

      if (fetchError) throw fetchError;

      // Calculate new quantity
      const newQuantity = type === "entrada" 
        ? item.quantity + quantity 
        : item.quantity - quantity;

      if (newQuantity < 0) {
        toast.error("Quantidade insuficiente em estoque");
        setLoading(false);
        return;
      }

      // Register movement
      const { error: movementError } = await supabase
        .from("inventory_movements")
        .insert({
          item_id: itemId,
          type,
          quantity,
          notes: formData.notes || null,
          created_by: user?.id,
        });

      if (movementError) throw movementError;

      // Update item quantity
      const { error: updateError } = await supabase
        .from("inventory_items")
        .update({ quantity: newQuantity })
        .eq("id", itemId);

      if (updateError) throw updateError;

      toast.success(`${type === "entrada" ? "Entrada" : "Saída"} registrada com sucesso`);
      queryClient.invalidateQueries({ queryKey: ["inventory-items"] });
      onOpenChange(false);
      setFormData({ quantity: "", notes: "" });
    } catch (error: any) {
      toast.error(error.message || "Erro ao registrar movimentação");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {type === "entrada" ? "Registrar Entrada" : "Registrar Saída"} - {itemName}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="quantity">Quantidade *</Label>
            <Input
              id="quantity"
              type="number"
              min="1"
              value={formData.quantity}
              onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
              required
            />
          </div>

          <div>
            <Label htmlFor="notes">Observações</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Notas sobre esta movimentação..."
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Registrando..." : "Registrar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
