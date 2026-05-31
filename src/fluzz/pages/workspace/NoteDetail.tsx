import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { AppLayout } from "@/fluzz/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/fluzz/components/ui/card";
import { Button } from "@/fluzz/components/ui/button";
import { ArrowLeft, Edit, FolderOpen } from "lucide-react";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function NoteDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin, isGestor, permissions } = useWorkspace();

  const canEdit = isAdmin || isGestor || (permissions as any)?.can_edit_notes;

  const { data: note, isLoading } = useQuery({
    queryKey: ["note", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("notes")
        .select("*, note_folders(name)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </AppLayout>
    );
  }

  if (!note) {
    return (
      <AppLayout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Nota não encontrada.</p>
          <Button variant="link" onClick={() => navigate("/tools/wizzy-flow/workspace/notes")}>
            Voltar para Notas
          </Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-4 sm:space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/tools/wizzy-flow/workspace/notes")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">{note.title}</h1>
            <div className="flex items-center gap-2 mt-1 text-muted-foreground text-sm">
              {note.note_folders && (
                <div className="flex items-center gap-1">
                  <FolderOpen className="h-3 w-3" />
                  <span>{note.note_folders.name}</span>
                  <span>•</span>
                </div>
              )}
              <span>
                Atualizado em {format(new Date(note.updated_at), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
              </span>
            </div>
          </div>
          {canEdit && (
            <Button onClick={() => navigate(`/tools/wizzy-flow/workspace/notes/${id}/edit`)} className="gap-2" size="sm">
              <Edit size={14} />
              Editar
            </Button>
          )}
        </div>

        <Card>
          <CardContent className="pt-6">
            <div 
              className="prose prose-sm max-w-none dark:prose-invert"
              dangerouslySetInnerHTML={{ __html: note.content || "<p>Sem conteúdo</p>" }}
            />
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
