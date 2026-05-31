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
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { RichTextEditorFull } from "@/fluzz/components/shared/RichTextEditorFull";

export default function GettingStartedForm() {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const navigate = useNavigate();
  const { id } = useParams();
  const queryClient = useQueryClient();
  const isEditing = !!id;

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [sectionOrder, setSectionOrder] = useState(0);

  const { data: section, isLoading } = useQuery({
    queryKey: ["getting-started-section", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("getting_started_sections")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  useEffect(() => {
    if (section) {
      setTitle(section.title);
      setContent(section.content || "");
      setSectionOrder(section.section_order);
    }
  }, [section]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!workspace) throw new Error("Workspace não encontrado");
      
      if (isEditing) {
        const { error } = await supabase
          .from("getting_started_sections")
          .update({ 
            title, 
            content,
            content_type: "text",
            section_order: sectionOrder 
          })
          .eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("getting_started_sections")
          .insert([{ 
            title, 
            content,
            content_type: "text",
            section_order: sectionOrder,
            workspace_id: workspace.id,
            created_by: user?.id
          }]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["getting-started-sections"] });
      toast.success(isEditing ? "Página atualizada!" : "Página criada!");
      navigate("/tools/wizzy-flow/workspace/getting-started");
    },
    onError: () => {
      toast.error(isEditing ? "Erro ao atualizar" : "Erro ao criar");
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
          <Button variant="ghost" size="icon" onClick={() => navigate("/tools/wizzy-flow/workspace/getting-started")}>
            <ArrowLeft size={20} />
          </Button>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">
              {isEditing ? "Editar Página" : "Nova Página"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {isEditing ? "Atualize as informações da página" : "Crie uma nova página de tutorial"}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="title">Título *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Como criar um projeto"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="order">Ordem</Label>
              <Input
                id="order"
                type="number"
                value={sectionOrder}
                onChange={(e) => setSectionOrder(parseInt(e.target.value) || 0)}
                placeholder="0"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Conteúdo</Label>
            <RichTextEditorFull
              content={content}
              onChange={setContent}
              placeholder="Escreva o conteúdo do tutorial... (Cole imagens e vídeos)"
            />
          </div>

          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={() => navigate("/tools/wizzy-flow/workspace/getting-started")}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Salvando..." : isEditing ? "Salvar" : "Criar Página"}
            </Button>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
