import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/fluzz/components/ui/dialog";
import { Button } from "@/fluzz/components/ui/button";
import { Input } from "@/fluzz/components/ui/input";
import { Label } from "@/fluzz/components/ui/label";
import { Textarea } from "@/fluzz/components/ui/textarea";

interface EditPositionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  position: {
    id: string;
    name: string;
    description: string | null;
  };
}

export function EditPositionDialog({ open, onOpenChange, position }: EditPositionDialogProps) {
  const [name, setName] = useState(position.name);
  const [description, setDescription] = useState(position.description || "");
  const [isLoading, setIsLoading] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) {
      setName(position.name);
      setDescription(position.description || "");
    }
  }, [open, position]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { error } = await supabase
        .from("positions")
        .update({
          name,
          description: description || null,
        })
        .eq("id", position.id);

      if (error) throw error;

      toast.success("Setor atualizado com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["position", position.id] });
      queryClient.invalidateQueries({ queryKey: ["positions"] });
      onOpenChange(false);
    } catch (error) {
      console.error("Erro ao atualizar setor:", error);
      toast.error("Erro ao atualizar setor");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar Setor</DialogTitle>
          <DialogDescription>
            Atualize as informações do setor
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome do setor"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descrição do setor (opcional)"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
