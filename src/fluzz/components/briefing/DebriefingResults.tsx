import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/fluzz/components/ui/card";
import { Progress } from "@/fluzz/components/ui/progress";
import { Button } from "@/fluzz/components/ui/button";
import { Switch } from "@/fluzz/components/ui/switch";
import { Label } from "@/fluzz/components/ui/label";
import { ArrowDown, ArrowUp, TrendingUp, FileDown, Eye, EyeOff, Plus, Minus, Calendar, MapPin, DollarSign, Users } from "lucide-react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { toast } from "sonner";
import { formatDateBR } from "@/fluzz/lib/utils";

interface Vendedor {
  id: string;
  vendedor_nome: string;
  leads_recebidos: number;
  vendas_realizadas: number;
  vendas_outras_estrategias?: number;
  ingressos_gratuitos?: number;
}

interface ExtraItem {
  id: string;
  tipo: "receita" | "despesa";
  nome: string;
  valor: number;
}

interface DebriefingResultsProps {
  debriefing: any;
  briefing: any;
  vendedores: Vendedor[];
  extras: ExtraItem[];
  currency: "BRL" | "USD";
  canSeeFinancialResult?: boolean;
  isAdminOrGestor?: boolean;
}

export default function DebriefingResults({
  debriefing,
  briefing,
  vendedores,
  extras,
  currency,
  canSeeFinancialResult = true,
  isAdminOrGestor = false,
}: DebriefingResultsProps) {
  const [showFinancialResult, setShowFinancialResult] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const printContainerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const currencySymbol = currency === "BRL" ? "R$" : "$";

  // Cálculos automáticos
  const cpl = debriefing.leads > 0 ? debriefing.investimento_trafego / debriefing.leads : 0;
  const cpa = debriefing.vendas_ingressos > 0 ? debriefing.investimento_trafego / debriefing.vendas_ingressos : 0;
  const roasIngressos = debriefing.investimento_trafego > 0 
    ? debriefing.retorno_vendas_ingressos / debriefing.investimento_trafego 
    : 0;
  const conversaoGeral = debriefing.leads > 0 
    ? (debriefing.vendas_ingressos / debriefing.leads) * 100 
    : 0;
  
  const investimentoDiff = briefing.investimento_trafego - debriefing.investimento_trafego;
  const roasOutrasEstrategias = investimentoDiff > 0
    ? debriefing.valor_outras_estrategias / investimentoDiff
    : 0;
  
  const roasMentorias = debriefing.investimento_trafego > 0
    ? debriefing.valor_vendas_mentorias / debriefing.investimento_trafego
    : 0;

  // Comparativos
  const investimentoVariacao = briefing.investimento_trafego > 0
    ? ((debriefing.investimento_trafego - briefing.investimento_trafego) / briefing.investimento_trafego) * 100
    : 0;
  const totalParticipantesVariacao = briefing.participantes_pagantes > 0
    ? ((debriefing.total_participantes - briefing.participantes_pagantes) / briefing.participantes_pagantes) * 100
    : 0;

  // Cálculos do resultado financeiro geral
  const totalReceitas = 
    debriefing.retorno_vendas_ingressos + 
    debriefing.valor_outras_estrategias + 
    debriefing.valor_vendas_mentorias +
    extras.filter(e => e.tipo === "receita").reduce((sum, e) => sum + e.valor, 0);

  const totalDespesas = 
    debriefing.investimento_trafego +
    extras.filter(e => e.tipo === "despesa").reduce((sum, e) => sum + e.valor, 0);

  const resultadoGeral = totalReceitas - totalDespesas;

  const formatCurrency = (value: number) => {
    return `${currencySymbol} ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(2)}%`;
  };

  const handleExportPDF = async (includeFinancialResult: boolean) => {
    if (!printContainerRef.current) return;

    setIsExporting(true);
    const previousShowState = showFinancialResult;
    
    try {
      // Temporarily set visibility based on export preference
      setShowFinancialResult(includeFinancialResult);
      
      // Wait for React to update the DOM
      await new Promise(resolve => setTimeout(resolve, 300));

      const element = printContainerRef.current;
      
      // Capture the visual content
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: null,
        logging: false,
        width: element.scrollWidth,
        height: element.scrollHeight,
      });

      // Calculate dimensions - create custom page size to fit all content
      const imgWidthPx = canvas.width;
      const imgHeightPx = canvas.height;
      
      // Convert to mm (assuming 96 DPI, scaled by 2)
      const pxToMm = 25.4 / (96 * 2);
      const imgWidthMm = imgWidthPx * pxToMm;
      const imgHeightMm = imgHeightPx * pxToMm;

      // Create PDF with custom page size matching content exactly
      const pdf = new jsPDF({
        orientation: imgWidthMm > imgHeightMm ? "landscape" : "portrait",
        unit: "mm",
        format: [imgWidthMm, imgHeightMm],
      });

      const imgData = canvas.toDataURL("image/png");
      
      // Add image with no margins - fills entire page
      pdf.addImage(imgData, "PNG", 0, 0, imgWidthMm, imgHeightMm);

      const projectName = briefing?.local || "Evento";
      pdf.save(`${projectName}_${includeFinancialResult ? "completo" : "marketing"}.pdf`);
      toast.success("PDF exportado com sucesso!");
    } catch (error) {
      console.error("Erro ao exportar PDF:", error);
      toast.error("Erro ao exportar PDF");
    } finally {
      setShowFinancialResult(previousShowState);
      setIsExporting(false);
    }
  };

  const precos = briefing.precos as any;

  return (
    <div className="space-y-6">
      {/* Toolbar de ações - Apenas para Admin/Gestor */}
      {isAdminOrGestor && (
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 border rounded-lg bg-muted/30">
          <div className="flex items-center gap-3">
            {canSeeFinancialResult && (
              <>
                <Switch
                  id="show-financial"
                  checked={showFinancialResult}
                  onCheckedChange={setShowFinancialResult}
                />
                <Label htmlFor="show-financial" className="flex items-center gap-2 cursor-pointer">
                  {showFinancialResult ? (
                    <>
                      <Eye className="h-4 w-4" />
                      Resultado Financeiro Visível
                    </>
                  ) : (
                    <>
                      <EyeOff className="h-4 w-4" />
                      Resultado Financeiro Oculto
                    </>
                  )}
                </Label>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExportPDF(false)}
              disabled={isExporting}
            >
              <FileDown className="h-4 w-4 mr-2" />
              PDF (Marketing)
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => handleExportPDF(true)}
              disabled={isExporting}
            >
              <FileDown className="h-4 w-4 mr-2" />
              PDF (Completo)
            </Button>
          </div>
        </div>
      )}

      {/* Container para impressão - captura visual do briefing + resultados */}
      <div ref={printContainerRef} data-print-container className="space-y-6 bg-background">
        {/* Briefing - Planejamento */}
        <Card>
          <CardHeader>
            <CardTitle>Briefing - Planejamento</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Calendar className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Data do Evento</p>
                    <p className="font-semibold">{formatDateBR(briefing.data)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <MapPin className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Local</p>
                    <p className="font-semibold">{briefing.local}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <DollarSign className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Investimento em Tráfego</p>
                    <p className="font-semibold">{formatCurrency(briefing.investimento_trafego)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Users className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Participantes Pagantes (Planejado)</p>
                    <p className="font-semibold">{briefing.participantes_pagantes}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <p className="text-sm font-semibold mb-3">Preços dos Ingressos</p>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Normal:</span>
                      <span className="font-medium">{formatCurrency(precos?.normal || 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Casal:</span>
                      <span className="font-medium">{formatCurrency(precos?.casal || 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Mentorados:</span>
                      <span className="font-medium">{formatCurrency(precos?.mentorados || 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Players:</span>
                      <span className="font-medium">{formatCurrency(precos?.players || 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Convidados:</span>
                      <span className="font-medium">{formatCurrency(precos?.convidados || 0)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 1. Resumo Financeiro - Vendas de Ingressos e Mentorias */}
        <Card>
          <CardHeader>
            <CardTitle>Resumo Financeiro - Vendas de Ingressos e Mentorias</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Vendas de Ingressos (Tráfego) */}
              <div className="space-y-3 p-4 rounded-lg border bg-card">
                <p className="text-sm font-semibold text-muted-foreground">Vendas de Ingressos (Tráfego)</p>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Quantidade:</span>
                    <span className="font-semibold">{debriefing.vendas_ingressos}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Retorno:</span>
                    <span className="font-semibold">{formatCurrency(debriefing.retorno_vendas_ingressos)}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t">
                    <span className="text-sm font-semibold text-primary">ROAS:</span>
                    <span className="font-bold text-primary text-lg">{roasIngressos.toFixed(2)}x</span>
                  </div>
                </div>
              </div>

              {/* Vendas de Ingressos (Outras Estratégias) */}
              <div className="space-y-3 p-4 rounded-lg border bg-card">
                <p className="text-sm font-semibold text-muted-foreground">Vendas de Ingressos (Outras Estratégias)</p>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Quantidade:</span>
                    <span className="font-semibold">{debriefing.participantes_outras_estrategias}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Retorno:</span>
                    <span className="font-semibold">{formatCurrency(debriefing.valor_outras_estrategias)}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t">
                    <span className="text-sm font-semibold text-primary">ROAS:</span>
                    <span className="font-bold text-primary text-lg">{roasOutrasEstrategias.toFixed(2)}x</span>
                  </div>
                </div>
              </div>

              {/* Mentorias Vendidas (Tráfego) */}
              <div className="space-y-3 p-4 rounded-lg border bg-card">
                <p className="text-sm font-semibold text-muted-foreground">Mentorias Vendidas (Tráfego)</p>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Quantidade:</span>
                    <span className="font-semibold">{debriefing.mentorias_vendidas}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Valor Total:</span>
                    <span className="font-semibold">{formatCurrency(debriefing.valor_vendas_mentorias)}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t">
                    <span className="text-sm font-semibold text-primary">ROAS Mentorias:</span>
                    <span className="font-bold text-primary text-lg">{roasMentorias.toFixed(2)}x</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 2. KPIs Principais em Destaque - Somente Tráfego */}
        <Card className="border-2 border-primary shadow-lg bg-gradient-to-br from-background to-muted/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Desempenho do Tráfego
            </CardTitle>
            <p className="text-sm text-muted-foreground">Análise de conversão específica para leads e vendas do tráfego</p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* CPL */}
              <div className="text-center p-4 rounded-lg border bg-background">
                <p className="text-sm text-muted-foreground mb-2">CPL</p>
                <p className="text-sm text-muted-foreground mb-1">Custo por Lead (Tráfego)</p>
                <p className="text-2xl md:text-3xl font-bold text-foreground">{formatCurrency(cpl)}</p>
              </div>

              {/* CPA */}
              <div className="text-center p-4 rounded-lg border bg-background">
                <p className="text-sm text-muted-foreground mb-2">CPA</p>
                <p className="text-sm text-muted-foreground mb-1">Custo por Aquisição (Tráfego)</p>
                <p className="text-2xl md:text-3xl font-bold text-foreground">{formatCurrency(cpa)}</p>
              </div>

              {/* ROAS Ingresso - DESTAQUE */}
              <div className="text-center p-6 rounded-lg border-2 border-primary bg-primary/5">
                <p className="text-sm font-semibold text-primary mb-2">ROAS INGRESSO (TRÁFEGO)</p>
                <p className="text-sm text-muted-foreground mb-1">Retorno por Real Investido</p>
                <p className="text-4xl md:text-5xl font-bold text-primary">{roasIngressos.toFixed(2)}x</p>
                <p className="text-sm text-muted-foreground mt-2">{formatCurrency(debriefing.retorno_vendas_ingressos)}</p>
              </div>

              {/* Conversão Geral - Tráfego */}
              <div className="text-center p-4 rounded-lg border bg-background">
                <p className="text-sm text-muted-foreground mb-2">Conversão (Tráfego)</p>
                <p className="text-sm text-muted-foreground mb-1">Leads → Vendas</p>
                <p className="text-2xl md:text-3xl font-bold text-foreground">{formatPercentage(conversaoGeral)}</p>
                <Progress value={conversaoGeral} className="mt-3 mx-auto w-32" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 3. Comparativo Briefing vs Debriefing */}
        <Card>
          <CardHeader>
            <CardTitle>Comparativo: Planejado vs Realizado</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg hover:border-primary/50 transition-colors">
                <div>
                  <p className="text-sm font-semibold text-muted-foreground mb-1">Investimento em Tráfego</p>
                  <div className="flex gap-4 mt-1">
                    <span className="text-sm">Planejado: <span className="font-medium">{formatCurrency(briefing.investimento_trafego)}</span></span>
                    <span className="text-sm">Realizado: <span className="font-medium">{formatCurrency(debriefing.investimento_trafego)}</span></span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {investimentoVariacao > 0 ? (
                    <ArrowUp className="h-4 w-4 text-red-500" />
                  ) : (
                    <ArrowDown className="h-4 w-4 text-green-500" />
                  )}
                  <span className={`font-semibold ${investimentoVariacao > 0 ? "text-red-500" : "text-green-500"}`}>
                    {Math.abs(investimentoVariacao).toFixed(1)}%
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg hover:border-primary/50 transition-colors">
                <div>
                  <p className="text-sm font-semibold text-muted-foreground mb-1">Total de Participantes (exceto equipe)</p>
                  <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 mt-1">
                    <span className="text-sm">Planejado: <span className="font-medium">{briefing.participantes_pagantes}</span></span>
                    <span className="text-sm">Realizado: <span className="font-medium">{debriefing.total_participantes}</span></span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {totalParticipantesVariacao > 0 ? (
                    <ArrowUp className="h-4 w-4 text-green-500" />
                  ) : (
                    <ArrowDown className="h-4 w-4 text-red-500" />
                  )}
                  <span className={`font-semibold ${totalParticipantesVariacao > 0 ? "text-green-500" : "text-red-500"}`}>
                    {Math.abs(totalParticipantesVariacao).toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 4. Conversão por Vendedor */}
        {vendedores.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Conversão por Vendedor (Tráfego)</CardTitle>
              <p className="text-sm text-muted-foreground">Análise de desempenho baseada em leads e vendas do tráfego</p>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {vendedores.map((vendedor) => {
                  const conversao = vendedor.leads_recebidos > 0
                    ? (vendedor.vendas_realizadas / vendedor.leads_recebidos) * 100
                    : 0;

                  return (
                    <div key={vendedor.id} className="p-4 border rounded-lg hover:border-primary/50 transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold">{vendedor.vendedor_nome}</h4>
                        <span className="text-lg font-bold text-primary">{formatPercentage(conversao)}</span>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-2">
                        <div>
                          <span className="text-muted-foreground">Leads (Tráfego): </span>
                          <span className="font-medium">{vendedor.leads_recebidos}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Vendas (Tráfego): </span>
                          <span className="font-medium">{vendedor.vendas_realizadas}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Outras Estratégias: </span>
                          <span className="font-medium">{vendedor.vendas_outras_estrategias || 0}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Convidados: </span>
                          <span className="font-medium">{vendedor.ingressos_gratuitos || 0}</span>
                        </div>
                      </div>
                      <div className="mt-2">
                        <p className="text-xs text-muted-foreground mb-1">Taxa de Conversão (Tráfego)</p>
                        <Progress value={conversao} className="mt-1" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* 5. Outras Despesas e Receitas */}
        {extras.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Outras Despesas e Receitas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {extras.map((extra) => (
                  <div
                    key={extra.id}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      extra.tipo === "receita" ? "bg-green-500/5 border-green-500/20" : "bg-red-500/5 border-red-500/20"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {extra.tipo === "receita" ? (
                        <Plus className="h-4 w-4 text-green-600" />
                      ) : (
                        <Minus className="h-4 w-4 text-red-600" />
                      )}
                      <span className="font-medium">{extra.nome}</span>
                    </div>
                    <span className={`font-semibold ${extra.tipo === "receita" ? "text-green-600" : "text-red-600"}`}>
                      {extra.tipo === "receita" ? "+" : "-"} {formatCurrency(extra.valor)}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* 6. Resultado Financeiro Geral - Apenas para Admin/Gestor */}
        {canSeeFinancialResult && showFinancialResult && (
          <Card className="border-2 border-muted">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Resultado Financeiro Geral
                <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-1 rounded">
                  Apenas para gestores
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Total de Receitas */}
                <div className="space-y-3 p-4 rounded-lg border bg-green-500/5 border-green-500/20">
                  <p className="text-sm font-semibold text-green-700">Total de Receitas</p>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Vendas Ingressos (Tráfego):</span>
                      <span>{formatCurrency(debriefing.retorno_vendas_ingressos)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Vendas (Outras Estratégias):</span>
                      <span>{formatCurrency(debriefing.valor_outras_estrategias)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Mentorias:</span>
                      <span>{formatCurrency(debriefing.valor_vendas_mentorias)}</span>
                    </div>
                    {extras.filter(e => e.tipo === "receita").map((e) => (
                      <div key={e.id} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{e.nome}:</span>
                        <span>{formatCurrency(e.valor)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between pt-2 border-t font-semibold">
                      <span>Total:</span>
                      <span className="text-green-600 text-lg">{formatCurrency(totalReceitas)}</span>
                    </div>
                  </div>
                </div>

                {/* Total de Despesas */}
                <div className="space-y-3 p-4 rounded-lg border bg-red-500/5 border-red-500/20">
                  <p className="text-sm font-semibold text-red-700">Total de Despesas</p>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Investimento em Tráfego:</span>
                      <span>{formatCurrency(debriefing.investimento_trafego)}</span>
                    </div>
                    {extras.filter(e => e.tipo === "despesa").map((e) => (
                      <div key={e.id} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{e.nome}:</span>
                        <span>{formatCurrency(e.valor)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between pt-2 border-t font-semibold">
                      <span>Total:</span>
                      <span className="text-red-600 text-lg">{formatCurrency(totalDespesas)}</span>
                    </div>
                  </div>
                </div>

                {/* Resultado */}
                <div className={`space-y-3 p-4 rounded-lg border-2 ${resultadoGeral >= 0 ? "bg-green-500/10 border-green-500/50" : "bg-red-500/10 border-red-500/50"}`}>
                  <p className="text-sm font-semibold">Resultado Geral</p>
                  <div className="flex flex-col items-center justify-center h-full py-4">
                    <p className={`text-4xl font-bold ${resultadoGeral >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {formatCurrency(resultadoGeral)}
                    </p>
                    <p className="text-sm text-muted-foreground mt-2">
                      {resultadoGeral >= 0 ? "Lucro" : "Prejuízo"}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}