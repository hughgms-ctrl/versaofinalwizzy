import { useState } from "react";
import { AppLayout } from "@/fluzz/components/layout/AppLayout";
import { Button } from "@/fluzz/components/ui/button";
import { Input } from "@/fluzz/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/fluzz/components/ui/select";
import { Plus, Package, Calendar, LayoutGrid, List } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";
import { CreateInventoryItemDialog } from "@/fluzz/components/inventory/CreateInventoryItemDialog";
import { CreateInventoryEventDialog } from "@/fluzz/components/inventory/CreateInventoryEventDialog";
import { InventoryItemCard } from "@/fluzz/components/inventory/InventoryItemCard";
import { InventoryItemListView } from "@/fluzz/components/inventory/InventoryItemListView";
import { Skeleton } from "@/fluzz/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/fluzz/components/ui/tabs";
import { formatDateBR } from "@/fluzz/lib/utils";

export default function Inventory() {
  const { workspace } = useWorkspace();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<string>("all");
  const [createItemOpen, setCreateItemOpen] = useState(false);
  const [createEventOpen, setCreateEventOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");

  const { data: events, isLoading: eventsLoading } = useQuery({
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
    enabled: !!workspace?.id,
  });

  const { data: items, isLoading: itemsLoading } = useQuery({
    queryKey: ["inventory-items", workspace?.id, selectedEvent, searchTerm],
    queryFn: async () => {
      let query = supabase
        .from("inventory_items")
        .select("*, inventory_events(name)")
        .eq("workspace_id", workspace?.id!);
      
      if (selectedEvent && selectedEvent !== "all") {
        query = query.eq("event_id", selectedEvent);
      }
      
      if (searchTerm) {
        query = query.ilike("name", `%${searchTerm}%`);
      }
      
      const { data, error } = await query.order("created_at", { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!workspace?.id,
  });

  return (
    <AppLayout>
      <div className="space-y-4 sm:space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Inventário</h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Gerencie materiais, controle estoque e organize por eventos
          </p>
        </div>
        <Tabs defaultValue="items" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2 h-auto">
            <TabsTrigger value="items" className="text-xs sm:text-sm">
              <Package className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Materiais</span>
              <span className="sm:hidden">Materiais</span>
            </TabsTrigger>
            <TabsTrigger value="events" className="text-xs sm:text-sm">
              <Calendar className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
              Eventos
            </TabsTrigger>
          </TabsList>

          <TabsContent value="items" className="space-y-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-col gap-2 md:flex-row md:gap-4 flex-1">
                <Input
                  placeholder="Buscar material..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="md:w-64"
                />
                <Select value={selectedEvent} onValueChange={setSelectedEvent}>
                  <SelectTrigger className="md:w-48">
                    <SelectValue placeholder="Filtrar por evento" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os eventos</SelectItem>
                    {events?.map((event) => (
                      <SelectItem key={event.id} value={event.id}>
                        {event.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="flex border rounded-md">
                  <Button
                    variant={viewMode === "grid" ? "secondary" : "ghost"}
                    size="icon"
                    onClick={() => setViewMode("grid")}
                    className="h-8 w-8 sm:h-9 sm:w-9"
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={viewMode === "list" ? "secondary" : "ghost"}
                    size="icon"
                    onClick={() => setViewMode("list")}
                    className="h-8 w-8 sm:h-9 sm:w-9"
                  >
                    <List className="h-4 w-4" />
                  </Button>
                </div>
                <Button onClick={() => setCreateItemOpen(true)} size="sm" className="flex-1 sm:flex-initial">
                  <Plus className="h-4 w-4 mr-1 sm:mr-2" />
                  <span className="hidden sm:inline">Novo Material</span>
                  <span className="sm:hidden">Novo</span>
                </Button>
              </div>
            </div>

            {itemsLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-48" />
                ))}
              </div>
            ) : !items || items.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-4 opacity-20" />
                <p>Nenhum material cadastrado</p>
              </div>
            ) : viewMode === "grid" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {items.map((item) => (
                  <InventoryItemCard key={item.id} item={item} />
                ))}
              </div>
            ) : (
              <InventoryItemListView items={items} />
            )}
          </TabsContent>

          <TabsContent value="events" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setCreateEventOpen(true)} size="sm">
                <Plus className="h-4 w-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">Novo Evento</span>
                <span className="sm:hidden">Novo</span>
              </Button>
            </div>

            {eventsLoading ? (
              <div className="space-y-4">
                {[1, 2].map((i) => (
                  <Skeleton key={i} className="h-24" />
                ))}
              </div>
            ) : !events || events.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Calendar className="h-12 w-12 mx-auto mb-4 opacity-20" />
                <p>Nenhum evento cadastrado</p>
              </div>
            ) : (
              <div className="space-y-4">
                {events.map((event) => (
                  <div
                    key={event.id}
                    className="border rounded-lg p-4 hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-medium">{event.name}</h3>
                        {event.description && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {event.description}
                          </p>
                        )}
                        {event.date && (
                          <p className="text-sm text-muted-foreground mt-2">
                            Data: {formatDateBR(event.date)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <CreateInventoryItemDialog
        open={createItemOpen}
        onOpenChange={setCreateItemOpen}
      />
      <CreateInventoryEventDialog
        open={createEventOpen}
        onOpenChange={setCreateEventOpen}
      />
    </AppLayout>
  );
}
