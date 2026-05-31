import { AppLayout } from "@/fluzz/components/layout/AppLayout";
import { Button } from "@/fluzz/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/fluzz/components/ui/card";
import { Plus, LayoutGrid, List } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { CreatePositionDialog } from "@/fluzz/components/positions/CreatePositionDialog";
import { PositionCard } from "@/fluzz/components/positions/PositionCard";
import { PositionListItem } from "@/fluzz/components/positions/PositionListItem";
import { Skeleton } from "@/fluzz/components/ui/skeleton";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";

export default function Positions() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const {
    isAdmin,
    isGestor,
    workspace
  } = useWorkspace();

  const {
    data: positions,
    isLoading
  } = useQuery({
    queryKey: ["positions", workspace?.id],
    queryFn: async () => {
      if (!workspace) return [];
      const {
        data,
        error
      } = await supabase.from("positions").select("*").eq("workspace_id", workspace.id).order("created_at", {
        ascending: false
      });
      if (error) throw error;
      return data;
    },
    enabled: !!workspace
  });

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Setores</h1>
            <p className="text-sm md:text-base text-muted-foreground mt-1">
              Gerencie setores e suas rotinas
            </p>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="flex items-center border rounded-md">
              <Button
                variant={viewMode === "grid" ? "secondary" : "ghost"}
                size="icon"
                onClick={() => setViewMode("grid")}
                className="rounded-r-none h-8 w-8 sm:h-9 sm:w-9"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "list" ? "secondary" : "ghost"}
                size="icon"
                onClick={() => setViewMode("list")}
                className="rounded-l-none h-8 w-8 sm:h-9 sm:w-9"
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
            {(isAdmin || isGestor) && (
              <Button onClick={() => setCreateDialogOpen(true)} className="flex-1 sm:flex-initial" size="sm">
                <Plus className="h-4 w-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">Novo Setor</span>
                <span className="sm:hidden">Novo</span>
              </Button>
            )}
          </div>
        </div>

        {isLoading ? (
          viewMode === "grid" ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map(i => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-4 w-full mt-2" />
                  </CardHeader>
                </Card>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          )
        ) : positions && positions.length > 0 ? (
          viewMode === "grid" ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {positions.map(position => (
                <PositionCard key={position.id} position={position} />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {positions.map(position => (
                <PositionListItem key={position.id} position={position} />
              ))}
            </div>
          )
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Nenhum cargo cadastrado</CardTitle>
              <CardDescription>
                Comece criando seu primeiro cargo ou setor
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        <CreatePositionDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} />
      </div>
    </AppLayout>
  );
}
