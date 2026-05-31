import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";
import { AppLayout } from "@/fluzz/components/layout/AppLayout";
import { Button } from "@/fluzz/components/ui/button";
import { Input } from "@/fluzz/components/ui/input";
import { Label } from "@/fluzz/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { RichTextEditorFull } from "@/fluzz/components/shared/RichTextEditorFull";

export default function VisionForm() {
  const { workspace } = useWorkspace();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const { data: visionData, isLoading } = useQuery({
    queryKey: ["company-info", "vision", workspace?.id],
    queryFn: async () => {
      if (!workspace) return null;
      const { data, error } = await supabase
        .from("company_info")
        .select("*")
        .eq("section", "vision")
        .eq("workspace_id", workspace.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!workspace,
  });

  useEffect(() => {
    if (visionData) {
      setTitle(visionData.title);
      setContent(visionData.content || "");
    }
  }, [visionData]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!workspace) throw new Error("Workspace não encontrado");
      
      if (visionData) {
        const { error } = await supabase
          .from("company_info")
          .update({ title, content })
          .eq("id", visionData.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("company_info")
          .insert([{ section: "vision", title, content, workspace_id: workspace.id }]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-info", "vision"] });
      toast.success("Visão, Missão e Valores atualizados!");
      navigate("/tools/wizzy-flow/workspace/vision");
    },
    onError: () => {
      toast.error("Erro ao salvar");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Preencha o título");
      return;
    }
    saveMutation.mutate();
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

  return (
    <AppLayout>
      <div className="space-y-6 max-w-4xl mx-auto px-2 md:px-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/tools/wizzy-flow/workspace/vision")}>
            <ArrowLeft size={20} />
          </Button>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">
              Editar Visão, Missão e Valores
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Documente os princípios da empresa
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="title">Título *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Nossa Visão, Missão e Valores"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Conteúdo</Label>
            <RichTextEditorFull
              content={content}
              onChange={setContent}
              placeholder="Descreva a visão, missão e valores da empresa..."
            />
          </div>

          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={() => navigate("/tools/wizzy-flow/workspace/vision")}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
