import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { AppLayout } from "@/fluzz/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/fluzz/components/ui/card";
import { Button } from "@/fluzz/components/ui/button";
import { Input } from "@/fluzz/components/ui/input";
import { toast } from "sonner";
import { Edit, Trash2, Plus, FolderOpen, FileText, ChevronRight, Search } from "lucide-react";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";
import { useAuth } from "@/fluzz/contexts/AuthContext";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/fluzz/components/ui/dialog";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function Notes() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { workspace, isAdmin, isGestor, permissions } = useWorkspace();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);

  const canEdit = isAdmin || isGestor || (permissions as any)?.can_edit_notes;

  const { data: folders, isLoading: foldersLoading } = useQuery({
    queryKey: ["note-folders", workspace?.id],
    queryFn: async () => {
      if (!workspace) return [];
      const { data, error } = await supabase
        .from("note_folders")
        .select("*")
        .eq("workspace_id", workspace.id)
        .order("folder_order", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!workspace,
  });

  const { data: notes, isLoading: notesLoading } = useQuery({
    queryKey: ["notes", workspace?.id],
    queryFn: async () => {
      if (!workspace) return [];
      const { data, error } = await supabase
        .from("notes")
        .select("*")
        .eq("workspace_id", workspace.id)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!workspace,
  });

  const createFolderMutation = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase
        .from("note_folders")
        .insert({
          name,
          workspace_id: workspace!.id,
          created_by: user?.id,
          folder_order: (folders?.length || 0) + 1,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["note-folders"] });
      toast.success("Pasta criada com sucesso!");
      setNewFolderName("");
      setFolderDialogOpen(false);
    },
    onError: () => {
      toast.error("Erro ao criar pasta");
    },
  });

  const deleteFolderMutation = useMutation({
    mutationFn: async (folderId: string) => {
      const { error } = await supabase
        .from("note_folders")
        .delete()
        .eq("id", folderId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["note-folders"] });
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      toast.success("Pasta excluída com sucesso!");
    },
    onError: () => {
      toast.error("Erro ao excluir pasta");
    },
  });

  const filteredNotes = notes?.filter(note => 
    note.title.toLowerCase().includes(search.toLowerCase())
  );

  const notesWithoutFolder = filteredNotes?.filter(note => !note.folder_id);
  const getNotesByFolder = (folderId: string) => 
    filteredNotes?.filter(note => note.folder_id === folderId) || [];

  if (foldersLoading || notesLoading) {
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Notas</h1>
            <p className="text-sm md:text-base text-muted-foreground mt-1">
              Gerencie notas e documentos do workspace
            </p>
          </div>
          {canEdit && (
            <div className="flex gap-2">
              <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <FolderOpen size={14} />
                    Nova Pasta
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Criar Nova Pasta</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <Input
                      placeholder="Nome da pasta"
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                    />
                    <Button 
                      onClick={() => createFolderMutation.mutate(newFolderName)}
                      disabled={!newFolderName.trim()}
                      className="w-full"
                    >
                      Criar Pasta
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
              <Button onClick={() => navigate("/tools/wizzy-flow/workspace/notes/new")} className="gap-2" size="sm">
                <Plus size={14} />
                Nova Nota
              </Button>
            </div>
          )}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Buscar notas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Folders */}
        {folders && folders.length > 0 && (
          <div className="space-y-4">
            {folders.map((folder) => (
              <Card key={folder.id}>
                <CardHeader className="py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FolderOpen className="h-5 w-5 text-primary" />
                      <CardTitle className="text-lg">{folder.name}</CardTitle>
                      <span className="text-xs text-muted-foreground">
                        ({getNotesByFolder(folder.id).length} notas)
                      </span>
                    </div>
                    {canEdit && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                            <Trash2 size={14} />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir Pasta?</AlertDialogTitle>
                            <AlertDialogDescription>
                              As notas dentro desta pasta não serão excluídas, apenas movidas para "Sem pasta".
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteFolderMutation.mutate(folder.id)}>
                              Excluir
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {getNotesByFolder(folder.id).length > 0 ? (
                    <div className="space-y-2">
                      {getNotesByFolder(folder.id).map((note) => (
                        <div
                          key={note.id}
                          onClick={() => navigate(`/tools/wizzy-flow/workspace/notes/${note.id}`)}
                          className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 cursor-pointer transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{note.title}</span>
                          </div>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <span className="text-xs">
                              {format(new Date(note.updated_at), "dd MMM yyyy", { locale: ptBR })}
                            </span>
                            <ChevronRight className="h-4 w-4" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Nenhuma nota nesta pasta
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Notes without folder */}
        {notesWithoutFolder && notesWithoutFolder.length > 0 && (
          <Card>
            <CardHeader className="py-3">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-lg">Sem Pasta</CardTitle>
                <span className="text-xs text-muted-foreground">
                  ({notesWithoutFolder.length} notas)
                </span>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {notesWithoutFolder.map((note) => (
                  <div
                    key={note.id}
                    onClick={() => navigate(`/tools/wizzy-flow/workspace/notes/${note.id}`)}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{note.title}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span className="text-xs">
                        {format(new Date(note.updated_at), "dd MMM yyyy", { locale: ptBR })}
                      </span>
                      <ChevronRight className="h-4 w-4" />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Empty state */}
        {(!folders || folders.length === 0) && (!notes || notes.length === 0) && (
          <div className="text-center py-12 border-2 border-dashed rounded-lg">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground mb-4">
              Nenhuma nota cadastrada ainda.
            </p>
            {canEdit && (
              <Button onClick={() => navigate("/tools/wizzy-flow/workspace/notes/new")}>
                <Plus className="h-4 w-4 mr-2" />
                Criar Primeira Nota
              </Button>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
