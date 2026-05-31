import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { AppLayout } from "@/fluzz/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/fluzz/components/ui/card";
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
import { useNavigate } from "react-router-dom";
import { FileText, Calendar, MapPin, DollarSign, Trash2 } from "lucide-react";
import { formatDateBR } from "@/fluzz/lib/utils";

export default function BriefingRepository() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: briefings, isLoading } = useQuery({
    queryKey: ["all-briefings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("briefings")
        .select(`
          *,
          projects (
            id,
            name
          ),
          debriefings (
            id,
            investimento_trafego,
            leads,
            vendas_ingressos
          )
        `)
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
      queryClient.invalidateQueries({ queryKey: ["all-briefings"] });
      toast.success("Briefing excluído com sucesso!");
    },
    onError: (error) => {
      console.error("Erro ao excluir briefing:", error);
      toast.error("Erro ao excluir briefing");
    },
  });

  const formatCurrency = (value: number, currency: string) => {
    const symbol = currency === "BRL" ? "R$" : "$";
    return `${symbol} ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <AppLayout>
      <div className="space-y-4 sm:space-y-6">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground">Repositório de Briefings & Debriefings</h1>
          <p className="text-xs sm:text-sm md:text-base text-muted-foreground mt-1 sm:mt-2">
            Visualize todos os briefings e debriefings de todos os projetos em um só lugar
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : briefings && briefings.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {briefings.map((briefing: any) => (
              <Card
                key={briefing.id}
                className="hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => navigate(`/tools/wizzy-flow/briefing/${briefing.id}`)}
              >
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <FileText className="h-5 w-5" />
                    {briefing.projects?.name || "Projeto"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>{formatDateBR(briefing.data)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span>{briefing.local}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <span>Investimento: {formatCurrency(briefing.investimento_trafego, briefing.currency)}</span>
                  </div>
                  <div className="pt-2 border-t">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Participantes:</span>
                      <span className="font-semibold">{briefing.participantes_pagantes}</span>
                    </div>
                  </div>
                  {briefing.debriefings && briefing.debriefings.length > 0 && (
                    <div className="pt-2 border-t">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Status:</span>
                        <span className="text-xs font-medium text-green-600 bg-green-100 px-2 py-1 rounded">
                          Debriefing Completo
                        </span>
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2 mt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/tools/wizzy-flow/briefing/${briefing.id}`);
                      }}
                    >
                      Ver Documento
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/tools/wizzy-flow/projects/${briefing.project_id}`);
                      }}
                    >
                      Editar
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:bg-destructive/10"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                          <AlertDialogDescription>
                            Tem certeza que deseja excluir este briefing? Esta ação também excluirá todos os debriefings associados e não pode ser desfeita.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteBriefingMutation.mutate(briefing.id);
                            }}
                            className="bg-destructive hover:bg-destructive/90"
                          >
                            Excluir
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 space-y-4">
              <FileText className="h-12 w-12 text-muted-foreground" />
              <div className="text-center space-y-2">
                <p className="text-lg font-medium">Nenhum Briefing encontrado</p>
                <p className="text-sm text-muted-foreground">
                  Crie briefings nos seus projetos para vê-los aqui.
                </p>
              </div>
              <Button onClick={() => navigate("/tools/wizzy-flow/projects")}>
                Ir para Projetos
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
