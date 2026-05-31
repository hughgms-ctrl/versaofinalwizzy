import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { useAuth } from "@/fluzz/contexts/AuthContext";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";
import { AppLayout } from "@/fluzz/components/layout/AppLayout";
import { Button } from "@/fluzz/components/ui/button";
import { Input } from "@/fluzz/components/ui/input";
import { Label } from "@/fluzz/components/ui/label";
import { Textarea } from "@/fluzz/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/fluzz/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/fluzz/components/ui/card";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { RichTextEditor } from "@/fluzz/components/ui/rich-text-editor";

const FREQUENCY_OPTIONS = [
  { value: "diario", label: "Diariamente" },
  { value: "semanal", label: "Semanalmente" },
  { value: "quinzenal", label: "Quinzenalmente" },
  { value: "mensal", label: "Mensalmente" },
  { value: "trimestral", label: "Trimestralmente" },
  { value: "semestral", label: "Semestralmente" },
  { value: "anual", label: "Anualmente" },
  { value: "sob_demanda", label: "Sob demanda / Quando necessário" },
];

interface MemberWithProfile {
  user_id: string;
  role: string;
  full_name: string | null;
}

export default function ProcessForm() {
  const { user } = useAuth();
  const { workspace, permissions, isAdmin, isGestor } = useWorkspace();
  const navigate = useNavigate();
  const { id } = useParams();
  const queryClient = useQueryClient();
  const isEditing = !!id;

  // Form state
  const [area, setArea] = useState("");
  const [title, setTitle] = useState("");
  const [objective, setObjective] = useState("");
  const [responsible, setResponsible] = useState("");
  const [approver, setApprover] = useState("");
  const [materials, setMaterials] = useState("");
  const [steps, setSteps] = useState("");
  const [frequency, setFrequency] = useState("");
  const [observations, setObservations] = useState("");

  const canViewProcesses = isAdmin || isGestor || permissions.can_view_processes;

  // Redirect if user doesn't have permission to view/edit processes
  useEffect(() => {
    if (workspace && !canViewProcesses) {
      toast.error("Você não tem permissão para acessar esta página");
      navigate("/tools/wizzy-flow/");
    }
  }, [workspace, canViewProcesses, navigate]);

  // Fetch process data when editing
  const { data: process, isLoading: isLoadingProcess } = useQuery({
    queryKey: ["process", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("process_documentation")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Fetch sectors (positions)
  const { data: sectors } = useQuery({
    queryKey: ["positions", workspace?.id],
    queryFn: async () => {
      if (!workspace) return [];
      const { data, error } = await supabase
        .from("positions")
        .select("id, name")
        .eq("workspace_id", workspace.id)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!workspace,
  });

  // Fetch workspace members
  const { data: members } = useQuery({
    queryKey: ["workspace-members-with-profiles", workspace?.id],
    queryFn: async () => {
      if (!workspace) return [];
      
      const { data: membersData, error: membersError } = await supabase
        .from("workspace_members")
        .select("user_id, role")
        .eq("workspace_id", workspace.id);
      
      if (membersError) throw membersError;
      if (!membersData || membersData.length === 0) return [];

      const userIds = membersData.map(m => m.user_id);
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);

      if (profilesError) throw profilesError;

      const profilesMap = new Map(profiles?.map(p => [p.id, p.full_name]) || []);

      const result: MemberWithProfile[] = membersData.map(m => ({
        user_id: m.user_id,
        role: m.role,
        full_name: profilesMap.get(m.user_id) || null,
      }));

      return result.sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
    },
    enabled: !!workspace,
  });

  // Load process data when editing
  useEffect(() => {
    if (process) {
      setArea(process.area || "");
      setTitle(process.title || "");
      setObjective(process.objective || "");
      setResponsible(process.responsible || "");
      setApprover((process as any).approver || "");
      setMaterials((process as any).materials || "");
      setFrequency((process as any).frequency || "");
      setObservations((process as any).observations || "");

      // Parse steps - could be JSON array (old format) or HTML (new format)
      if (process.steps) {
        try {
          const parsedSteps = JSON.parse(process.steps);
          if (Array.isArray(parsedSteps)) {
            // Convert old array format to HTML
            const stepsHtml = parsedSteps
              .filter((s: any) => s.content?.trim())
              .map((s: any, i: number) => `<p>${i + 1}. ${s.content}</p>`)
              .join("");
            setSteps(stepsHtml || "");
          } else {
            setSteps(process.steps);
          }
        } catch {
          // Not JSON, use as-is (HTML content)
          setSteps(process.steps);
        }
      } else if (process.content) {
        // Legacy content field
        setSteps(process.content || "");
      }
    }
  }, [process]);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!workspace) throw new Error("Dados inválidos");

      // Build content HTML for display
      const contentHtml = buildContentHtml();

      if (isEditing) {
        const { error } = await supabase
          .from("process_documentation")
          .update({
            area,
            title,
            content: contentHtml,
            objective,
            responsible,
            approver,
            materials,
            steps,
            frequency,
            observations,
          })
          .eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("process_documentation").insert([
          {
            area,
            title,
            content: contentHtml,
            objective,
            responsible,
            approver,
            materials,
            steps,
            frequency,
            observations,
            created_by: user!.id,
            workspace_id: workspace.id,
          },
        ]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["process-documentation"] });
      toast.success(isEditing ? "POP atualizado!" : "POP criado!");
      navigate("/tools/wizzy-flow/workspace/processes");
    },
    onError: () => {
      toast.error(isEditing ? "Erro ao atualizar POP" : "Erro ao criar POP");
    },
  });

  const getFrequencyLabel = (value: string) => {
    return FREQUENCY_OPTIONS.find(f => f.value === value)?.label || value;
  };

  const getMemberName = (userId: string) => {
    const member = members?.find(m => m.user_id === userId);
    return member?.full_name || "Membro não encontrado";
  };

  const buildContentHtml = () => {
    const sections: string[] = [];

    if (objective) {
      sections.push(
        `<div class="mb-6"><h3 class="text-lg font-semibold mb-2">Objetivo</h3><p>${objective}</p></div>`
      );
    }

    if (responsible || approver) {
      const responsibleName = responsible ? getMemberName(responsible) : "-";
      const approverName = approver ? getMemberName(approver) : "-";
      sections.push(
        `<div class="mb-6"><h3 class="text-lg font-semibold mb-2">Responsáveis</h3><p><strong>Executor:</strong> ${responsibleName}</p><p><strong>Aprovador:</strong> ${approverName}</p></div>`
      );
    }

    if (materials) {
      const materialsList = materials
        .split("\n")
        .filter((m) => m.trim())
        .map((m) => `<li>${m.trim()}</li>`)
        .join("");
      sections.push(
        `<div class="mb-6"><h3 class="text-lg font-semibold mb-2">Materiais Necessários</h3><ul class="list-disc pl-5">${materialsList}</ul></div>`
      );
    }

    if (steps && steps !== "<p></p>") {
      sections.push(
        `<div class="mb-6"><h3 class="text-lg font-semibold mb-2">Passo a Passo</h3><div class="prose prose-sm max-w-none">${steps}</div></div>`
      );
    }

    if (frequency) {
      sections.push(
        `<div class="mb-6"><h3 class="text-lg font-semibold mb-2">Frequência</h3><p>${getFrequencyLabel(frequency)}</p></div>`
      );
    }

    if (observations) {
      sections.push(
        `<div class="mb-6"><h3 class="text-lg font-semibold mb-2">Observações</h3><p>${observations}</p></div>`
      );
    }

    return sections.join("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!area.trim() || !title.trim()) {
      toast.error("Preencha o setor e título");
      return;
    }
    createMutation.mutate();
  };

  if (isLoadingProcess) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 max-w-4xl mx-auto px-2 md:px-0">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/tools/wizzy-flow/workspace/processes")}
          >
            <ArrowLeft size={20} />
          </Button>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">
              {isEditing ? "Editar POP" : "Novo POP"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Preencha os campos para criar um procedimento padronizado
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Informações Básicas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="area">Setor *</Label>
                  <Select value={area} onValueChange={setArea}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um setor" />
                    </SelectTrigger>
                    <SelectContent>
                      {sectors && sectors.length > 0 ? (
                        sectors.map((sector) => (
                          <SelectItem key={sector.id} value={sector.name}>
                            {sector.name}
                          </SelectItem>
                        ))
                      ) : (
                        <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                          Nenhum setor cadastrado
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="title">Título do POP *</Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Ex: Limpeza de Equipamentos"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="objective">Objetivo</Label>
                <Textarea
                  id="objective"
                  value={objective}
                  onChange={(e) => setObjective(e.target.value)}
                  placeholder="Descreva brevemente o propósito deste procedimento"
                  className="resize-y min-h-[80px]"
                />
              </div>
            </CardContent>
          </Card>

          {/* Responsibles */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Responsáveis</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="responsible">Quem executa?</Label>
                  <Select value={responsible} onValueChange={setResponsible}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um membro" />
                    </SelectTrigger>
                    <SelectContent>
                      {members && members.length > 0 ? (
                        members.map((member) => (
                          <SelectItem key={member.user_id} value={member.user_id}>
                            {member.full_name || "Sem nome"}
                          </SelectItem>
                        ))
                      ) : (
                        <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                          Nenhum membro encontrado
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="approver">Quem aprova?</Label>
                  <Select value={approver} onValueChange={setApprover}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um membro" />
                    </SelectTrigger>
                    <SelectContent>
                      {members && members.length > 0 ? (
                        members.map((member) => (
                          <SelectItem key={member.user_id} value={member.user_id}>
                            {member.full_name || "Sem nome"}
                          </SelectItem>
                        ))
                      ) : (
                        <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                          Nenhum membro encontrado
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Materials */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Materiais Necessários</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={materials}
                onChange={(e) => setMaterials(e.target.value)}
                className="resize-y min-h-[100px]"
                placeholder="Liste os materiais/equipamentos/sistemas necessários para a tarefa (um por linha)"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Digite um item por linha
              </p>
            </CardContent>
          </Card>

          {/* Steps - Rich Text Editor */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Passo a Passo</CardTitle>
              <p className="text-xs text-muted-foreground">
                Use o editor para adicionar textos formatados, imagens, vídeos e links
              </p>
            </CardHeader>
            <CardContent>
              <RichTextEditor
                content={steps}
                onChange={setSteps}
                placeholder="Descreva os passos do procedimento. Você pode formatar o texto, adicionar imagens, vídeos e links..."
              />
            </CardContent>
          </Card>

          {/* Frequency */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Frequência</CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={frequency} onValueChange={setFrequency}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a frequência" />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Observations */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Observações</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={observations}
                onChange={(e) => setObservations(e.target.value)}
                placeholder="Cuidados extras, exceções ou notas importantes"
                className="resize-y min-h-[100px]"
              />
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex gap-3 justify-end pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/tools/wizzy-flow/workspace/processes")}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending
                ? "Salvando..."
                : isEditing
                ? "Atualizar POP"
                : "Criar POP"}
            </Button>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
