import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";
import { AppLayout } from "@/fluzz/components/layout/AppLayout";
import { Button } from "@/fluzz/components/ui/button";
import { ArrowLeft, FileText } from "lucide-react";
import BriefingView from "@/fluzz/components/briefing/BriefingView";
import DebriefingResults from "@/fluzz/components/briefing/DebriefingResults";
import { Card, CardContent, CardHeader, CardTitle } from "@/fluzz/components/ui/card";
import { formatDateWithOptions } from "@/fluzz/lib/utils";

export default function BriefingDocument() {
  const { briefingId } = useParams();
  const navigate = useNavigate();
  const { isAdmin, isGestor } = useWorkspace();
  const canSeeExtras = isAdmin || isGestor;

  const { data: briefing, isLoading: briefingLoading } = useQuery({
    queryKey: ["briefing", briefingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("briefings")
        .select("*, projects(id, name)")
        .eq("id", briefingId)
        .single();

      if (error) throw error;
      return data;
    },
  });

  const { data: debriefing, isLoading: debriefingLoading } = useQuery({
    queryKey: ["debriefing", briefingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("debriefings")
        .select("*, debriefing_vendedores(*)")
        .eq("briefing_id", briefingId)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
  });

  const { data: extras = [], isLoading: extrasLoading } = useQuery({
    queryKey: ["debriefing-extras", debriefing?.id],
    queryFn: async () => {
      if (!debriefing?.id) return [];
      const { data, error } = await supabase
        .from("debriefing_extras")
        .select("*")
        .eq("debriefing_id", debriefing.id);

      if (error) throw error;
      return data || [];
    },
    enabled: !!debriefing?.id,
  });

  const isLoading = briefingLoading || debriefingLoading || extrasLoading;

  const formatDate = (date: string) => {
    return formatDateWithOptions(date, {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </AppLayout>
    );
  }

  if (!briefing) {
    return (
      <AppLayout>
        <div className="text-center py-16">
          <p className="text-muted-foreground mb-4">Documento não encontrado</p>
          <Button onClick={() => navigate("/tools/wizzy-flow/briefings")}>Voltar ao Repositório</Button>
        </div>
      </AppLayout>
    );
  }

  const vendedores = debriefing?.debriefing_vendedores?.map((v: any) => ({
    id: v.id,
    vendedor_nome: v.vendedor_nome,
    leads_recebidos: v.leads_recebidos,
    vendas_realizadas: v.vendas_realizadas,
  })) || [];

  return (
    <AppLayout>
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/tools/wizzy-flow/briefings")}
            >
              <ArrowLeft size={20} />
            </Button>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  {briefing.projects?.name || "Projeto"}
                </span>
              </div>
              <h1 className="text-3xl font-bold text-foreground">
                Briefing & Debriefing - {formatDate(briefing.data)}
              </h1>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => navigate(`/tools/wizzy-flow/projects/${briefing.project_id}`)}
          >
            Ir para o Projeto
          </Button>
        </div>

        {/* Documento Consolidado */}
        <div className="space-y-8">
          {/* Parte 1: Briefing (Planejamento) */}
          <div>
            <h2 className="text-xl font-semibold mb-4">Planejamento (Briefing)</h2>
            <BriefingView briefing={briefing} />
          </div>

          {/* Parte 2: Debriefing (Dados Brutos) */}
          {debriefing ? (
            <>
              <div>
                <h2 className="text-xl font-semibold mb-4">Dados Realizados (Debriefing)</h2>
                <Card>
                  <CardHeader>
                    <CardTitle>Dados do Evento</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Investimento em Tráfego</p>
                        <p className="font-semibold">
                          {debriefing.currency === "BRL" ? "R$" : "$"} {debriefing.investimento_trafego.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Leads</p>
                        <p className="font-semibold">{debriefing.leads}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Vendas de Ingressos</p>
                        <p className="font-semibold">{debriefing.vendas_ingressos}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Retorno Vendas Ingressos</p>
                        <p className="font-semibold">
                          {debriefing.currency === "BRL" ? "R$" : "$"} {debriefing.retorno_vendas_ingressos.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Mentorias Vendidas</p>
                        <p className="font-semibold">{debriefing.mentorias_vendidas}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Valor Vendas Mentorias</p>
                        <p className="font-semibold">
                          {debriefing.currency === "BRL" ? "R$" : "$"} {debriefing.valor_vendas_mentorias.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Participantes (Outras Estratégias)</p>
                        <p className="font-semibold">{debriefing.participantes_outras_estrategias}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Valor (Outras Estratégias)</p>
                        <p className="font-semibold">
                          {debriefing.currency === "BRL" ? "R$" : "$"} {debriefing.valor_outras_estrategias.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Total de Participantes</p>
                        <p className="font-semibold">{debriefing.total_participantes}</p>
                      </div>
                    </div>
                    {debriefing.observacoes && (
                      <div className="mt-4 pt-4 border-t">
                        <p className="text-sm text-muted-foreground mb-1">Observações:</p>
                        <p className="text-sm whitespace-pre-wrap">{debriefing.observacoes}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Parte 3: Dashboard de Resultados */}
              <div>
                <h2 className="text-xl font-semibold mb-4">Análise e Resultados</h2>
                <DebriefingResults
                  debriefing={debriefing}
                  briefing={briefing}
                  vendedores={vendedores}
                  currency={debriefing.currency as "BRL" | "USD"}
                  extras={canSeeExtras ? extras.map(e => ({
                    id: e.id,
                    tipo: e.tipo as "receita" | "despesa",
                    nome: e.nome,
                    valor: e.valor
                  })) : []}
                  canSeeFinancialResult={canSeeExtras}
                  isAdminOrGestor={canSeeExtras}
                />
              </div>
            </>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 space-y-4">
                <FileText className="h-12 w-12 text-muted-foreground" />
                <div className="text-center space-y-2">
                  <p className="text-lg font-medium">Debriefing não realizado</p>
                  <p className="text-sm text-muted-foreground">
                    Este evento ainda não possui um debriefing registrado.
                  </p>
                </div>
                <Button onClick={() => navigate(`/tools/wizzy-flow/projects/${briefing.project_id}`)}>
                  Ir para o Projeto
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
