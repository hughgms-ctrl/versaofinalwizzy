import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { AppLayout } from "@/fluzz/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/fluzz/components/ui/card";
import { Button } from "@/fluzz/components/ui/button";
import { Input } from "@/fluzz/components/ui/input";
import { Label } from "@/fluzz/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/fluzz/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Save, Trash2 } from "lucide-react";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";
import { useAuth } from "@/fluzz/contexts/AuthContext";
import { RichTextEditorFull } from "@/fluzz/components/shared/RichTextEditorFull";
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

export default function NoteForm() {
  const { id } = useParams<{ id: string }>();
  const isEditing = id && id !== "new";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { workspace, isAdmin, isGestor, permissions } = useWorkspace();
  const { user } = useAuth();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [folderId, setFolderId] = useState<string | null>(null);

  const canEdit = isAdmin || isGestor || (permissions as any)?.can_edit_notes;

  const { data: note, isLoading: noteLoading } = useQuery({
    queryKey: ["note", id],
    queryFn: async () => {
      if (!id || id === "new") return null;
      const { data, error } = await supabase
        .from("notes")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id && id !== "new",
  });

  const { data: folders } = useQuery({
    queryKey: ["note-folders", workspace?.id],
    queryFn: async () => {
      if (!workspace) return [];
      const { data, error } = await supabase
        .from("note_folders")
        .select("*")
        .eq("workspace_id", workspace.id)
        .order("name", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!workspace,
  });

  useEffect(() => {
    if (note) {
      setTitle(note.title);
      setContent(note.content || "");
      setFolderId(note.folder_id);
    }
  }, [note]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!workspace?.id) {
        throw new Error("Workspace nao encontrado");
      }
      if (!user?.id) {
        throw new Error("Usuario nao autenticado");
      }

      if (isEditing) {
        const { error } = await supabase
          .from("notes")
          .update({
            title,
            content,
            folder_id: folderId,
          })
          .eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("notes")
          .insert({
            title,
            content,
            folder_id: folderId,
            workspace_id: workspace.id,
            created_by: user.id,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      queryClient.invalidateQueries({ queryKey: ["note", id] });
      toast.success(isEditing ? "Nota atualizada!" : "Nota criada!");
      navigate("/tools/wizzy-flow/workspace/notes");
    },
    onError: (error: any) => {
      console.error("Erro ao salvar nota:", error);
      toast.error(error?.message ? `Erro ao salvar nota: ${error.message}` : "Erro ao salvar nota");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("notes")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      toast.success("Nota excluída!");
      navigate("/tools/wizzy-flow/workspace/notes");
    },
    onError: () => {
      toast.error("Erro ao excluir nota");
    },
  });

  if (!canEdit) {
    return (
      <AppLayout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Você não tem permissão para editar notas.</p>
        </div>
      </AppLayout>
    );
  }

  if (noteLoading) {
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
      <div className="space-y-4 sm:space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/tools/wizzy-flow/workspace/notes")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">
              {isEditing ? "Editar Nota" : "Nova Nota"}
            </h1>
          </div>
          {isEditing && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" className="gap-2">
                  <Trash2 size={14} />
                  Excluir
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir Nota?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta ação não pode ser desfeita.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => deleteMutation.mutate()}>
                    Excluir
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Detalhes da Nota</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Título</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Título da nota"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="folder">Pasta</Label>
              <Select
                value={folderId || "none"}
                onValueChange={(value) => setFolderId(value === "none" ? null : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar pasta" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem pasta</SelectItem>
                  {folders?.map((folder) => (
                    <SelectItem key={folder.id} value={folder.id}>
                      {folder.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Conteúdo</Label>
              <RichTextEditorFull
                content={content}
                onChange={setContent}
                placeholder="Escreva o conteúdo da nota..."
              />
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={!title.trim() || saveMutation.isPending}
                className="gap-2"
              >
                <Save size={14} />
                {saveMutation.isPending ? "Salvando..." : "Salvar"}
              </Button>
              <Button variant="outline" onClick={() => navigate("/tools/wizzy-flow/workspace/notes")}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
