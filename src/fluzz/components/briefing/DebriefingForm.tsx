import { useState } from "react";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";
import { Button } from "@/fluzz/components/ui/button";
import { Input } from "@/fluzz/components/ui/input";
import { Label } from "@/fluzz/components/ui/label";
import { Textarea } from "@/fluzz/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/fluzz/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/fluzz/components/ui/card";
import { toast } from "sonner";
import { DollarSign, Plus, Trash2 } from "lucide-react";
import DebriefingResults from "./DebriefingResults";

interface DebriefingFormProps {
  projectId: string;
  briefingId: string;
}

interface Vendedor {
  id: string;
  vendedor_nome: string;
  leads_recebidos: number;
  vendas_realizadas: number;
  vendas_outras_estrategias: number;
  ingressos_gratuitos: number;
}

interface ExtraItem {
  id: string;
  tipo: "receita" | "despesa";
  nome: string;
  valor: number;
}

export default function DebriefingForm({ projectId, briefingId }: DebriefingFormProps) {
  const queryClient = useQueryClient();
  const { workspace, isAdmin, isGestor } = useWorkspace();
  const canSeeExtras = isAdmin || isGestor;
  const [currency, setCurrency] = useState<"BRL" | "USD">("BRL");
  const [investimentoTrafego, setInvestimentoTrafego] = useState("");
  const [leads, setLeads] = useState("");
  const [vendasIngressos, setVendasIngressos] = useState("");
  const [retornoVendasIngressos, setRetornoVendasIngressos] = useState("");
  const [mentoriasVendidas, setMentoriasVendidas] = useState("");
  const [valorVendasMentorias, setValorVendasMentorias] = useState("");
  const [participantesOutrasEstrategias, setParticipantesOutrasEstrategias] = useState("");
  const [valorOutrasEstrategias, setValorOutrasEstrategias] = useState("");
  const [totalParticipantes, setTotalParticipantes] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [extras, setExtras] = useState<ExtraItem[]>([]);

  const { data: briefing } = useQuery({
    queryKey: ["briefing", briefingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("briefings")
        .select("*")
        .eq("id", briefingId)
        .single();

      if (error) throw error;
      return data;
    },
  });

  const { data: debriefing } = useQuery({
    queryKey: ["debriefing", briefingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("debriefings")
        .select("*, debriefing_vendedores(*)")
        .eq("briefing_id", briefingId)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setInvestimentoTrafego(data.investimento_trafego.toString());
        setLeads(data.leads.toString());
        setVendasIngressos(data.vendas_ingressos.toString());
        setRetornoVendasIngressos(data.retorno_vendas_ingressos.toString());
        setMentoriasVendidas(data.mentorias_vendidas.toString());
        setValorVendasMentorias(data.valor_vendas_mentorias.toString());
        setParticipantesOutrasEstrategias(data.participantes_outras_estrategias.toString());
        setValorOutrasEstrategias(data.valor_outras_estrategias.toString());
        setTotalParticipantes(data.total_participantes.toString());
        setObservacoes(data.observacoes || "");
        setCurrency(data.currency as "BRL" | "USD");
        
        if (data.debriefing_vendedores) {
          setVendedores(data.debriefing_vendedores.map((v: any) => ({
            id: v.id,
            vendedor_nome: v.vendedor_nome,
            leads_recebidos: v.leads_recebidos,
            vendas_realizadas: v.vendas_realizadas,
            vendas_outras_estrategias: v.vendas_outras_estrategias || 0,
            ingressos_gratuitos: v.ingressos_gratuitos || 0,
          })));
        }

        // Fetch extras
        const { data: extrasData } = await supabase
          .from("debriefing_extras")
          .select("*")
          .eq("debriefing_id", data.id);
        
        if (extrasData) {
          setExtras(extrasData.map((e: any) => ({
            id: e.id,
            tipo: e.tipo,
            nome: e.nome,
            valor: e.valor,
          })));
        }
      }
      return data;
    },
  });

  const saveDebriefingMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");
      if (!workspace) throw new Error("Workspace não encontrado");

      const debriefingData = {
        briefing_id: briefingId,
        project_id: projectId,
        workspace_id: workspace.id,
        investimento_trafego: parseFloat(investimentoTrafego),
        leads: parseInt(leads),
        vendas_ingressos: parseInt(vendasIngressos),
        retorno_vendas_ingressos: parseFloat(retornoVendasIngressos),
        mentorias_vendidas: parseInt(mentoriasVendidas),
        valor_vendas_mentorias: parseFloat(valorVendasMentorias),
        participantes_outras_estrategias: parseInt(participantesOutrasEstrategias),
        valor_outras_estrategias: parseFloat(valorOutrasEstrategias),
        total_participantes: parseInt(totalParticipantes),
        observacoes,
        currency,
        created_by: user.id,
      };


      if (debriefing) {
        const { error } = await supabase
          .from("debriefings")
          .update(debriefingData)
          .eq("id", debriefing.id);
        if (error) throw error;

        // Delete and re-insert vendedores
        await supabase
          .from("debriefing_vendedores")
          .delete()
          .eq("debriefing_id", debriefing.id);

        if (vendedores.length > 0) {
          const { error: vendError } = await supabase
            .from("debriefing_vendedores")
            .insert(
              vendedores.map((v) => ({
                debriefing_id: debriefing.id,
                vendedor_nome: v.vendedor_nome,
                leads_recebidos: v.leads_recebidos,
                vendas_realizadas: v.vendas_realizadas,
                vendas_outras_estrategias: v.vendas_outras_estrategias,
                ingressos_gratuitos: v.ingressos_gratuitos,
              }))
            );
          if (vendError) throw vendError;
        }

        // Delete and re-insert extras
        await supabase
          .from("debriefing_extras")
          .delete()
          .eq("debriefing_id", debriefing.id);

        if (extras.length > 0) {
          const { error: extrasError } = await supabase
            .from("debriefing_extras")
            .insert(
              extras.map((e) => ({
                debriefing_id: debriefing.id,
                tipo: e.tipo,
                nome: e.nome,
                valor: e.valor,
                created_by: user?.id,
              }))
            );
          if (extrasError) throw extrasError;
        }
      } else {
        const { data: newDebriefing, error } = await supabase
          .from("debriefings")
          .insert(debriefingData)
          .select()
          .single();

        if (error) throw error;

        if (vendedores.length > 0) {
          const { error: vendError } = await supabase
            .from("debriefing_vendedores")
            .insert(
              vendedores.map((v) => ({
                debriefing_id: newDebriefing.id,
                vendedor_nome: v.vendedor_nome,
                leads_recebidos: v.leads_recebidos,
                vendas_realizadas: v.vendas_realizadas,
                vendas_outras_estrategias: v.vendas_outras_estrategias,
                ingressos_gratuitos: v.ingressos_gratuitos,
              }))
            );
          if (vendError) throw vendError;
        }

        if (extras.length > 0) {
          const { error: extrasError } = await supabase
            .from("debriefing_extras")
            .insert(
              extras.map((e) => ({
                debriefing_id: newDebriefing.id,
                tipo: e.tipo,
                nome: e.nome,
                valor: e.valor,
                created_by: user?.id,
              }))
            );
          if (extrasError) throw extrasError;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["debriefing", briefingId] });
      queryClient.invalidateQueries({ queryKey: ["briefings", projectId] });
      toast.success("Debriefing salvo com sucesso!");
    },
    onError: (error) => {
      console.error("Erro ao salvar debriefing:", error);
      toast.error("Erro ao salvar debriefing");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveDebriefingMutation.mutate();
  };

  const addVendedor = () => {
    setVendedores([
      ...vendedores,
      {
        id: crypto.randomUUID(),
        vendedor_nome: "",
        leads_recebidos: 0,
        vendas_realizadas: 0,
        vendas_outras_estrategias: 0,
        ingressos_gratuitos: 0,
      },
    ]);
  };

  const removeVendedor = (id: string) => {
    setVendedores(vendedores.filter((v) => v.id !== id));
  };

  const updateVendedor = (id: string, field: keyof Vendedor, value: string | number) => {
    setVendedores(
      vendedores.map((v) =>
        v.id === id ? { ...v, [field]: value } : v
      )
    );
  };

  const addExtra = () => {
    setExtras([
      ...extras,
      {
        id: crypto.randomUUID(),
        tipo: "despesa",
        nome: "",
        valor: 0,
      },
    ]);
  };

  const removeExtra = (id: string) => {
    setExtras(extras.filter((e) => e.id !== id));
  };

  const updateExtra = (id: string, field: keyof ExtraItem, value: string | number) => {
    setExtras(
      extras.map((e) =>
        e.id === id ? { ...e, [field]: value } : e
      )
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Debriefing - Resultados</CardTitle>
              <CardDescription>Insira os dados reais do evento</CardDescription>
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
              {/* Seção de Tráfego */}
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
                <Label htmlFor="leads">Leads (Tráfego)</Label>
                <Input
                  id="leads"
                  type="number"
                  value={leads}
                  onChange={(e) => setLeads(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="vendasIngressos">Vendas de Ingressos (Tráfego)</Label>
                <Input
                  id="vendasIngressos"
                  type="number"
                  value={vendasIngressos}
                  onChange={(e) => setVendasIngressos(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="retornoVendas">Retorno Vendas de Ingressos (Tráfego)</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="retornoVendas"
                    type="number"
                    step="0.01"
                    className="pl-9"
                    value={retornoVendasIngressos}
                    onChange={(e) => setRetornoVendasIngressos(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Seção de Outras Estratégias */}
              <div className="space-y-2">
                <Label htmlFor="participantesOutras">Participantes (Outras Estratégias Pagantes)</Label>
                <Input
                  id="participantesOutras"
                  type="number"
                  value={participantesOutrasEstrategias}
                  onChange={(e) => setParticipantesOutrasEstrategias(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="valorOutras">Valor (Outras Estratégias)</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="valorOutras"
                    type="number"
                    step="0.01"
                    className="pl-9"
                    value={valorOutrasEstrategias}
                    onChange={(e) => setValorOutrasEstrategias(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Total de Participantes */}
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="totalParticipantes">Total de Participantes (exceto equipe)</Label>
                <Input
                  id="totalParticipantes"
                  type="number"
                  value={totalParticipantes}
                  onChange={(e) => setTotalParticipantes(e.target.value)}
                  required
                />
              </div>

              {/* Seção de Mentorias - movida para depois de total de participantes */}
              <div className="space-y-2">
                <Label htmlFor="mentoriasVendidas">Mentorias Vendidas (Tráfego)</Label>
                <Input
                  id="mentoriasVendidas"
                  type="number"
                  value={mentoriasVendidas}
                  onChange={(e) => setMentoriasVendidas(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="valorMentorias">Valor Vendas Mentorias (Tráfego)</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="valorMentorias"
                    type="number"
                    step="0.01"
                    className="pl-9"
                    value={valorVendasMentorias}
                    onChange={(e) => setValorVendasMentorias(e.target.value)}
                    required
                  />
                </div>
              </div>
            </div>

            {/* Vendedores */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Vendedores</h3>
                <Button type="button" variant="outline" size="sm" onClick={addVendedor}>
                  <Plus className="h-4 w-4 mr-1" />
                  Adicionar Vendedor
                </Button>
              </div>

              {vendedores.map((vendedor) => (
                <div key={vendedor.id} className="grid grid-cols-1 md:grid-cols-6 gap-4 p-4 border rounded-lg">
                  <div className="space-y-2">
                    <Label>Nome do Vendedor</Label>
                    <Input
                      value={vendedor.vendedor_nome}
                      onChange={(e) => updateVendedor(vendedor.id, "vendedor_nome", e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Leads Recebidos (Tráfego)</Label>
                    <Input
                      type="number"
                      value={vendedor.leads_recebidos}
                      onChange={(e) => updateVendedor(vendedor.id, "leads_recebidos", parseInt(e.target.value) || 0)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Vendas Realizadas (Tráfego)</Label>
                    <Input
                      type="number"
                      value={vendedor.vendas_realizadas}
                      onChange={(e) => updateVendedor(vendedor.id, "vendas_realizadas", parseInt(e.target.value) || 0)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Vendas Outras Estratégias</Label>
                    <Input
                      type="number"
                      value={vendedor.vendas_outras_estrategias}
                      onChange={(e) => updateVendedor(vendedor.id, "vendas_outras_estrategias", parseInt(e.target.value) || 0)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Ingressos Gratuitos (Convidados)</Label>
                    <Input
                      type="number"
                      value={vendedor.ingressos_gratuitos}
                      onChange={(e) => updateVendedor(vendedor.id, "ingressos_gratuitos", parseInt(e.target.value) || 0)}
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => removeVendedor(vendedor.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* Outras Despesas e Receitas - Apenas para Admin/Gestor */}
            {canSeeExtras && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Outras Despesas e Receitas</h3>
                  <Button type="button" variant="outline" size="sm" onClick={addExtra}>
                    <Plus className="h-4 w-4 mr-1" />
                    Adicionar Item
                  </Button>
                </div>

                {extras.map((extra) => (
                  <div key={extra.id} className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 border rounded-lg">
                    <div className="space-y-2">
                      <Label>Tipo</Label>
                      <Select
                        value={extra.tipo}
                        onValueChange={(value: "receita" | "despesa") => updateExtra(extra.id, "tipo", value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="receita">Receita (+)</SelectItem>
                          <SelectItem value="despesa">Despesa (-)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Nome do Item</Label>
                      <Input
                        value={extra.nome}
                        onChange={(e) => updateExtra(extra.id, "nome", e.target.value)}
                        placeholder="Ex: Patrocínio, Aluguel de equipamentos..."
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Valor</Label>
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          type="number"
                          step="0.01"
                          className="pl-9"
                          value={extra.valor}
                          onChange={(e) => updateExtra(extra.id, "valor", parseFloat(e.target.value) || 0)}
                          required
                        />
                      </div>
                    </div>
                    <div className="flex items-end">
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => removeExtra(extra.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="observacoes">Observações</Label>
              <Textarea
                id="observacoes"
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                rows={4}
              />
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={saveDebriefingMutation.isPending}>
                {saveDebriefingMutation.isPending ? "Salvando..." : "Salvar Debriefing"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {debriefing && briefing && (
        <DebriefingResults
          debriefing={debriefing}
          briefing={briefing}
          vendedores={vendedores}
          extras={canSeeExtras ? extras : []}
          currency={currency}
          canSeeFinancialResult={canSeeExtras}
          isAdminOrGestor={canSeeExtras}
        />
      )}
    </div>
  );
}
