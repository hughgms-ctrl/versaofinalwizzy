import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/fluzz/components/ui/dialog";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { Badge } from "@/fluzz/components/ui/badge";
import { Skeleton } from "@/fluzz/components/ui/skeleton";
import { ArrowUp, ArrowDown } from "lucide-react";

interface MovementHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId: string;
  itemName: string;
}

export function MovementHistoryDialog({ 
  open, 
  onOpenChange, 
  itemId, 
  itemName 
}: MovementHistoryDialogProps) {
  const { data: movements, isLoading } = useQuery({
    queryKey: ["inventory-movements", itemId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_movements")
        .select("*")
        .eq("item_id", itemId)
        .order("date", { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Histórico de Movimentações - {itemName}</DialogTitle>
        </DialogHeader>
        
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        ) : !movements || movements.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground">
            Nenhuma movimentação registrada
          </p>
        ) : (
          <div className="space-y-4">
            {movements.map((movement) => (
              <div
                key={movement.id}
                className="flex items-start justify-between border-b pb-4 last:border-0"
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${
                    movement.type === "entrada" 
                      ? "bg-green-100 dark:bg-green-900/20" 
                      : "bg-red-100 dark:bg-red-900/20"
                  }`}>
                    {movement.type === "entrada" ? (
                      <ArrowUp className="h-4 w-4 text-green-600 dark:text-green-400" />
                    ) : (
                      <ArrowDown className="h-4 w-4 text-red-600 dark:text-red-400" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant={movement.type === "entrada" ? "default" : "destructive"}>
                        {movement.type === "entrada" ? "Entrada" : "Saída"}: {movement.quantity}
                      </Badge>
                    </div>
                    {movement.notes && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {movement.notes}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-2">
                      {new Date(movement.date).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
