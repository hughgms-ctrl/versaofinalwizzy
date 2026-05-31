import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/fluzz/components/ui/table";
import { Button } from "@/fluzz/components/ui/button";
import { ArrowUp, ArrowDown, History, Trash2, Pencil } from "lucide-react";
import { useState } from "react";
import { RegisterMovementDialog } from "./RegisterMovementDialog";
import { MovementHistoryDialog } from "./MovementHistoryDialog";
import { EditInventoryItemDialog } from "./EditInventoryItemDialog";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { toast } from "sonner";
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

interface InventoryItemListViewProps {
  items: any[];
}

export function InventoryItemListView({ items }: InventoryItemListViewProps) {
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [movementType, setMovementType] = useState<"entrada" | "saida">("entrada");
  const [movementDialogOpen, setMovementDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  const handleMovement = (item: any, type: "entrada" | "saida") => {
    setSelectedItem(item);
    setMovementType(type);
    setMovementDialogOpen(true);
  };

  const handleHistory = (item: any) => {
    setSelectedItem(item);
    setHistoryDialogOpen(true);
  };

  const handleEdit = (item: any) => {
    setSelectedItem(item);
    setEditDialogOpen(true);
  };

  const deleteMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase
        .from("inventory_items")
        .delete()
        .eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory-items"] });
      toast.success("Item excluído com sucesso");
    },
    onError: () => {
      toast.error("Erro ao excluir item");
    },
  });

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Material</TableHead>
            <TableHead>Quantidade</TableHead>
            <TableHead>Unidade</TableHead>
            <TableHead>Evento</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>
                <div>
                  <p className="font-medium">{item.name}</p>
                  {item.description && (
                    <p className="text-sm text-muted-foreground line-clamp-1">
                      {item.description}
                    </p>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <span className="font-semibold">{item.quantity}</span>
              </TableCell>
              <TableCell>{item.unit}</TableCell>
              <TableCell>
                {item.inventory_events?.name || "-"}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleMovement(item, "entrada")}
                    title="Entrada"
                  >
                    <ArrowUp className="h-4 w-4 text-green-600" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleMovement(item, "saida")}
                    title="Saída"
                  >
                    <ArrowDown className="h-4 w-4 text-red-600" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleHistory(item)}
                    title="Histórico"
                  >
                    <History className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleEdit(item)}
                    title="Editar"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" title="Excluir">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir item</AlertDialogTitle>
                        <AlertDialogDescription>
                          Tem certeza que deseja excluir "{item.name}"? Esta ação não pode ser desfeita.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteMutation.mutate(item.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Excluir
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {selectedItem && (
        <>
          <RegisterMovementDialog
            open={movementDialogOpen}
            onOpenChange={setMovementDialogOpen}
            itemId={selectedItem.id}
            itemName={selectedItem.name}
            type={movementType}
          />
          <MovementHistoryDialog
            open={historyDialogOpen}
            onOpenChange={setHistoryDialogOpen}
            itemId={selectedItem.id}
            itemName={selectedItem.name}
          />
          <EditInventoryItemDialog
            open={editDialogOpen}
            onOpenChange={setEditDialogOpen}
            item={selectedItem}
          />
        </>
      )}
    </>
  );
}
