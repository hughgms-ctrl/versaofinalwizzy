import { Card, CardContent, CardHeader, CardTitle } from "@/fluzz/components/ui/card";
import { Calendar, MapPin, DollarSign, Users } from "lucide-react";
import { formatDateBR } from "@/fluzz/lib/utils";

interface BriefingViewProps {
  briefing: any;
}

export default function BriefingView({ briefing }: BriefingViewProps) {
  const currencySymbol = briefing.currency === "BRL" ? "R$" : "$";
  const precos = briefing.precos as any;

  const formatCurrency = (value: number) => {
    return `${currencySymbol} ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
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
                  <span className="font-medium">{formatCurrency(precos.normal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Casal:</span>
                  <span className="font-medium">{formatCurrency(precos.casal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Mentorados:</span>
                  <span className="font-medium">{formatCurrency(precos.mentorados)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Players:</span>
                  <span className="font-medium">{formatCurrency(precos.players)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Convidados:</span>
                  <span className="font-medium">{formatCurrency(precos.convidados)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
