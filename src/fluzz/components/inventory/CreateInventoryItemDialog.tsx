import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/fluzz/components/ui/dialog";
import { Button } from "@/fluzz/components/ui/button";
import { Input } from "@/fluzz/components/ui/input";
import { Label } from "@/fluzz/components/ui/label";
import { Textarea } from "@/fluzz/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/fluzz/components/ui/select";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

interface CreateInventoryItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateInventoryItemDialog({ open, onOpenChange }: CreateInventoryItemDialogProps) {
  const { workspace } = useWorkspace();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    quantity: "",
    unit: "un",
    event_id: "none",
  });

  const { data: events } = useQuery({
    queryKey: ["inventory-events", workspace?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_events")
        .select("*")
        .eq("workspace_id", workspace?.id!)
        .order("date", { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!workspace?.id && open,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase.from("inventory_items").insert({
        workspace_id: workspace?.id!,
        name: formData.name,
        description: formData.description || null,
        quantity: parseInt(formData.quantity) || 0,
        unit: formData.unit,
        event_id: formData.event_id === "none" ? null : formData.event_id,
        created_by: user?.id,
      });

      if (error) throw error;

      toast.success("Material cadastrado com sucesso");
      queryClient.invalidateQueries({ queryKey: ["inventory-items"] });
      onOpenChange(false);
      setFormData({ name: "", description: "", quantity: "", unit: "un", event_id: "none" });
    } catch (error: any) {
      toast.error(error.message || "Erro ao cadastrar material");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo Material</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Nome do Material *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          <div>
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="quantity">Quantidade *</Label>
              <Input
                id="quantity"
                type="number"
                min="0"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="unit">Unidade</Label>
              <Select value={formData.unit} onValueChange={(value) => setFormData({ ...formData, unit: value })}>
                <SelectTrigger id="unit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="un">Unidade</SelectItem>
                  <SelectItem value="kg">Quilograma</SelectItem>
                  <SelectItem value="m">Metro</SelectItem>
                  <SelectItem value="l">Litro</SelectItem>
                  <SelectItem value="cx">Caixa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="event">Evento</Label>
            <Select value={formData.event_id} onValueChange={(value) => setFormData({ ...formData, event_id: value })}>
              <SelectTrigger id="event">
                <SelectValue placeholder="Selecione um evento (opcional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem evento</SelectItem>
                {events?.map((event) => (
                  <SelectItem key={event.id} value={event.id}>
                    {event.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Cadastrando..." : "Cadastrar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
