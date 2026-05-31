import { useState } from "react";
import { Button } from "@/fluzz/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/fluzz/components/ui/dialog";
import { Input } from "@/fluzz/components/ui/input";
import { Label } from "@/fluzz/components/ui/label";
import { Textarea } from "@/fluzz/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/fluzz/components/ui/select";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";

interface CreateRoutineDialogProps {
  positionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateRoutineDialog({
  positionId,
  open,
  onOpenChange,
}: CreateRoutineDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [recurrenceType, setRecurrenceType] = useState("daily");
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast.error("Você precisa estar autenticado");
        return;
      }

      if (!workspace) {
        toast.error("Workspace não encontrado");
        return;
      }

      const { error } = await supabase.from("routines").insert({
        position_id: positionId,
        name,
        description,
        recurrence_type: recurrenceType,
        created_by: user.id,
        workspace_id: workspace.id,
      });

      if (error) throw error;

      toast.success("Rotina criada com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["routines", positionId] });
      resetForm();
      onOpenChange(false);
    } catch (error) {
      console.error("Error creating routine:", error);
      toast.error("Erro ao criar rotina");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setName("");
    setDescription("");
    setRecurrenceType("daily");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Nova Rotina</DialogTitle>
          <DialogDescription>
            Crie uma rotina com recorrência para este cargo
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Nome da Rotina *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Rotina de Fechamento de Mês"
              required
            />
          </div>

          <div>
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descreva o propósito desta rotina"
              rows={3}
            />
          </div>

          <div>
            <Label htmlFor="recurrence">Recorrência *</Label>
            <Select value={recurrenceType} onValueChange={setRecurrenceType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Diária</SelectItem>
                <SelectItem value="weekly">Semanal</SelectItem>
                <SelectItem value="monthly">Mensal</SelectItem>
                <SelectItem value="yearly">Anual</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Criando..." : "Criar Rotina"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
