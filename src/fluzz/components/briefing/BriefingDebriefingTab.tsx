import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/fluzz/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/fluzz/components/ui/select";
import { Card, CardContent } from "@/fluzz/components/ui/card";
import { Button } from "@/fluzz/components/ui/button";
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
import { toast } from "sonner";
import BriefingForm from "./BriefingForm";
import { formatDateBR } from "@/fluzz/lib/utils";
import BriefingView from "./BriefingView";
import DebriefingForm from "./DebriefingForm";
import { FileText, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";

interface BriefingDebriefingTabProps {
  projectId: string;
}

export default function BriefingDebriefingTab({ projectId }: BriefingDebriefingTabProps) {
  const [selectedBriefingId, setSelectedBriefingId] = useState<string>("");
  const [showBriefingForm, setShowBriefingForm] = useState(false);
  const queryClient = useQueryClient();
  const { isAdmin, isGestor } = useWorkspace();

  const { data: briefings, isLoading } = useQuery({
    queryKey: ["briefings", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("briefings")
        .select("*")
        .eq("project_id", projectId)
        .order("data", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const deleteBriefingMutation = useMutation({
    mutationFn: async (briefingId: string) => {
      // Primeiro deleta os debriefings associados
      const { error: debriefingError } = await supabase
        .from("debriefings")
        .delete()
        .eq("briefing_id", briefingId);

      if (debriefingError) throw debriefingError;

      // Depois deleta o briefing
      const { error } = await supabase
        .from("briefings")
        .delete()
        .eq("id", briefingId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["briefings", projectId] });
      toast.success("Briefing excluído com sucesso!");
      setShowBriefingForm(false);
    },
    onError: (error) => {
      console.error("Erro ao excluir briefing:", error);
      toast.error("Erro ao excluir briefing");
    },
  });

  const handleBriefingCreated = () => {
    // Refresh briefings list after creation
  };

  const latestBriefing = briefings?.[0];

  return (
    <div className="space-y-6">
      {/* Visualização e Edição do Briefing */}
      {latestBriefing && (
        <div className="space-y-4">
          <BriefingView briefing={latestBriefing} />
          
          {(isAdmin || isGestor) && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowBriefingForm(!showBriefingForm)}
                >
                  {showBriefingForm ? (
                    <>
                      <ChevronUp className="h-4 w-4 mr-2" />
                      Ocultar Formulário de Edição
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-4 w-4 mr-2" />
                      Editar Briefing
                    </>
                  )}
                </Button>
                
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                      <AlertDialogDescription>
                        Tem certeza que deseja excluir este briefing? Esta ação também excluirá todos os debriefings associados e não pode ser desfeita.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteBriefingMutation.mutate(latestBriefing.id)}
                        className="bg-destructive hover:bg-destructive/90"
                      >
                        Excluir
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
              
              {showBriefingForm && (
                <div className="mt-4">
                  <BriefingForm 
                    projectId={projectId} 
                    briefingId={latestBriefing.id}
                    onSuccess={handleBriefingCreated} 
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Criar Novo Briefing se não houver nenhum */}
      {!latestBriefing && !isLoading && (isAdmin || isGestor) && (
        <BriefingForm projectId={projectId} onSuccess={handleBriefingCreated} />
      )}

      {/* Seleção e Edição do Debriefing */}
      {isLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-8">
            <p className="text-muted-foreground">Carregando briefings...</p>
          </CardContent>
        </Card>
      ) : briefings && briefings.length > 0 ? (
        <>
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Selecione um Briefing para criar/editar o Debriefing
                </label>
                <Select 
                  value={selectedBriefingId || latestBriefing?.id} 
                  onValueChange={setSelectedBriefingId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha um briefing..." />
                  </SelectTrigger>
                  <SelectContent>
                    {briefings.map((briefing) => (
                      <SelectItem key={briefing.id} value={briefing.id}>
                        {formatDateBR(briefing.data)} - {briefing.local}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {(selectedBriefingId || latestBriefing) && (
            <DebriefingForm 
              projectId={projectId} 
              briefingId={selectedBriefingId || latestBriefing.id} 
            />
          )}
        </>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 space-y-4">
            <FileText className="h-12 w-12 text-muted-foreground" />
            <div className="text-center space-y-2">
              <p className="text-lg font-medium">Nenhum Briefing encontrado</p>
              <p className="text-sm text-muted-foreground">
                Crie um Briefing primeiro para poder criar um Debriefing.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
