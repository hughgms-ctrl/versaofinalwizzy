import { useState } from "react";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";
import { Button } from "@/fluzz/components/ui/button";
import { Input } from "@/fluzz/components/ui/input";
import { Label } from "@/fluzz/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/fluzz/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/fluzz/components/ui/card";
import { toast } from "sonner";
import { DollarSign } from "lucide-react";

interface BriefingFormProps {
  projectId: string;
  onSuccess?: () => void;
}

interface BriefingFormProps {
  projectId: string;
  onSuccess?: () => void;
  briefingId?: string;
}

export default function BriefingForm({ projectId, onSuccess, briefingId }: BriefingFormProps) {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const [currency, setCurrency] = useState<"BRL" | "USD">("BRL");
  const [data, setData] = useState("");
  const [investimentoTrafego, setInvestimentoTrafego] = useState("");
  const [participantesPagantes, setParticipantesPagantes] = useState("");
  const [local, setLocal] = useState("");
  const [precoNormal, setPrecoNormal] = useState("");
  const [precoCasal, setPrecoCasal] = useState("");
  const [precoMentorados, setPrecoMentorados] = useState("");
  const [precoPlayers, setPrecoPlayers] = useState("");
  const [precoConvidados, setPrecoConvidados] = useState("");

  const { data: existingBriefing } = useQuery({
    queryKey: ["briefing", briefingId],
    queryFn: async () => {
      if (!briefingId) return null;
      const { data, error } = await supabase
        .from("briefings")
        .select("*")
        .eq("id", briefingId)
        .single();

      if (error) throw error;
      
      // Populate form with existing data
      setData(data.data);
      setInvestimentoTrafego(data.investimento_trafego.toString());
      setParticipantesPagantes(data.participantes_pagantes.toString());
      setLocal(data.local);
      setCurrency(data.currency as "BRL" | "USD");
      
      const precos = data.precos as any;
      setPrecoNormal(precos.normal.toString());
      setPrecoCasal(precos.casal.toString());
      setPrecoMentorados(precos.mentorados.toString());
      setPrecoPlayers(precos.players.toString());
      setPrecoConvidados(precos.convidados.toString());
      
      return data;
    },
    enabled: !!briefingId,
  });

  const createBriefingMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");
      if (!workspace) throw new Error("Workspace não encontrado");

      const briefingData = {
        project_id: projectId,
        workspace_id: workspace.id,
        data,
        investimento_trafego: parseFloat(investimentoTrafego),
        participantes_pagantes: parseInt(participantesPagantes),
        local,
        precos: {
          normal: parseFloat(precoNormal),
          casal: parseFloat(precoCasal),
          mentorados: parseFloat(precoMentorados),
          players: parseFloat(precoPlayers),
          convidados: parseFloat(precoConvidados),
        },
        currency,
        created_by: user.id,
      };

      if (briefingId) {
        const { error } = await supabase
          .from("briefings")
          .update(briefingData)
          .eq("id", briefingId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("briefings")
          .insert(briefingData);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["briefings", projectId] });
      queryClient.invalidateQueries({ queryKey: ["briefing", briefingId] });
      toast.success(briefingId ? "Briefing atualizado com sucesso!" : "Briefing criado com sucesso!");
      if (!briefingId) {
        resetForm();
      }
      onSuccess?.();
    },
    onError: (error) => {
      console.error("Erro ao criar briefing:", error);
      toast.error("Erro ao criar briefing");
    },
  });

  const resetForm = () => {
    setData("");
    setInvestimentoTrafego("");
    setParticipantesPagantes("");
    setLocal("");
    setPrecoNormal("");
    setPrecoCasal("");
    setPrecoMentorados("");
    setPrecoPlayers("");
    setPrecoConvidados("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createBriefingMutation.mutate();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Briefing - Planejamento</CardTitle>
            <CardDescription>Insira os dados de planejamento do evento</CardDescription>
          </div>
          <Select value={currency} onValueChange={(value: "BRL" | "USD") => setCurrency(value)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="BRL">R$ - Real</SelectItem>
              <SelectItem value="USD">$ - Dólar</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="data">Data</Label>
              <Input
                id="data"
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="investimento">Investimento em Tráfego</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="investimento"
                  type="number"
                  step="0.01"
                  className="pl-9"
                  value={investimentoTrafego}
                  onChange={(e) => setInvestimentoTrafego(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="participantes">Participantes Pagantes</Label>
              <Input
                id="participantes"
                type="number"
                value={participantesPagantes}
                onChange={(e) => setParticipantesPagantes(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="local">Local</Label>
              <Input
                id="local"
                type="text"
                value={local}
                onChange={(e) => setLocal(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Preços dos Ingressos</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="precoNormal">Normal</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="precoNormal"
                    type="number"
                    step="0.01"
                    className="pl-9"
                    value={precoNormal}
                    onChange={(e) => setPrecoNormal(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="precoCasal">Casal</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="precoCasal"
                    type="number"
                    step="0.01"
                    className="pl-9"
                    value={precoCasal}
                    onChange={(e) => setPrecoCasal(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="precoMentorados">Mentorados</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="precoMentorados"
                    type="number"
                    step="0.01"
                    className="pl-9"
                    value={precoMentorados}
                    onChange={(e) => setPrecoMentorados(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="precoPlayers">Players</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="precoPlayers"
                    type="number"
                    step="0.01"
                    className="pl-9"
                    value={precoPlayers}
                    onChange={(e) => setPrecoPlayers(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="precoConvidados">Convidados (Mentorados/Players)</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="precoConvidados"
                    type="number"
                    step="0.01"
                    className="pl-9"
                    value={precoConvidados}
                    onChange={(e) => setPrecoConvidados(e.target.value)}
                    required
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={resetForm}>
              Limpar
            </Button>
            <Button type="submit" disabled={createBriefingMutation.isPending}>
              {createBriefingMutation.isPending ? "Salvando..." : (briefingId ? "Atualizar Briefing" : "Salvar Briefing")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
