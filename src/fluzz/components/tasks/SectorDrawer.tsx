import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/fluzz/components/ui/sheet";
import { Button } from "@/fluzz/components/ui/button";
import { Badge } from "@/fluzz/components/ui/badge";
import { Briefcase, Users } from "lucide-react";
import { ScrollArea } from "@/fluzz/components/ui/scroll-area";

interface SectorDrawerProps {
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
  showMultipleSectors?: boolean;
}

export const SectorDrawer = ({ value, onValueChange, children, showMultipleSectors = true }: SectorDrawerProps) => {
  const { workspace } = useWorkspace();

  const { data: sectors, isLoading } = useQuery({
    queryKey: ["positions", workspace?.id],
    queryFn: async () => {
      if (!workspace) return [];
      
      const { data, error } = await supabase
        .from("positions")
        .select("*")
        .eq("workspace_id", workspace.id)
        .order("name");
      
      if (error) throw error;
      return data;
    },
    enabled: !!workspace,
  });

  const selectedSector = sectors?.find(s => s.id === value);

  return (
    <Sheet>
      <SheetTrigger asChild>
        {children}
      </SheetTrigger>
      <SheetContent side="bottom" className="h-[80vh]">
        <SheetHeader>
          <SheetTitle>Selecionar Cargo</SheetTitle>
          <SheetDescription>
            Escolha o cargo responsável por esta tarefa
          </SheetDescription>
        </SheetHeader>
        
        <ScrollArea className="h-[calc(80vh-120px)] mt-4">
          <div className="space-y-2">
            {showMultipleSectors && (
              <Button
                variant={value === "Multiplos" ? "default" : "outline"}
                className="w-full justify-between h-auto py-4 border-dashed"
                onClick={() => {
                  onValueChange("Multiplos");
                  document.querySelector('[data-radix-dialog-close]')?.dispatchEvent(
                    new Event('click', { bubbles: true })
                  );
                }}
              >
                <div className="flex items-center gap-3 flex-1 text-left">
                  <Users size={20} className="flex-shrink-0" />
                  <div>
                    <div className="font-semibold">Múltiplos Setores</div>
                    <div className="text-xs text-muted-foreground font-normal mt-1">
                      Permite selecionar responsáveis de qualquer setor
                    </div>
                  </div>
                </div>
                {value === "Multiplos" && (
                  <Badge variant="secondary" className="ml-2">Selecionado</Badge>
                )}
              </Button>
            )}

            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              </div>
            ) : sectors && sectors.length > 0 ? (
              sectors.map((sector) => (
                <Button
                  key={sector.id}
                  variant={value === sector.id ? "default" : "outline"}
                  className="w-full justify-between h-auto py-4"
                  onClick={() => {
                    onValueChange(sector.id);
                    document.querySelector('[data-radix-dialog-close]')?.dispatchEvent(
                      new Event('click', { bubbles: true })
                    );
                  }}
                >
                  <div className="flex items-center gap-3 flex-1 text-left">
                    <Briefcase size={20} className="flex-shrink-0" />
                    <div>
                      <div className="font-semibold">{sector.name}</div>
                      {sector.description && (
                        <div className="text-xs text-muted-foreground font-normal mt-1">
                          {sector.description}
                        </div>
                      )}
                    </div>
                  </div>
                  {value === sector.id && (
                    <Badge variant="secondary" className="ml-2">Selecionado</Badge>
                  )}
                </Button>
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Briefcase size={48} className="mx-auto mb-4 opacity-20" />
                <p>Nenhum cargo cadastrado</p>
                <p className="text-sm mt-2">
                  Cadastre cargos em Cargos e Setores
                </p>
              </div>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};
