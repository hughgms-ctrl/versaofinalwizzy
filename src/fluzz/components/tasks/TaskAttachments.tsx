import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { Button } from "@/fluzz/components/ui/button";
import { Input } from "@/fluzz/components/ui/input";
import { Label } from "@/fluzz/components/ui/label";
import { useAuth } from "@/fluzz/contexts/AuthContext";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";
import { toast } from "sonner";
import { 
  Upload, 
  Trash2, 
  FileIcon, 
  Download,
  Link as LinkIcon,
  ExternalLink,
  File,
  FileImage,
  FileVideo,
  FileAudio,
  FileText,
  Archive,
  X,
  ZoomIn
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/fluzz/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/fluzz/components/ui/dialog";

interface TaskAttachmentsProps {
  taskId: string;
  isEditing?: boolean;
}

const getFileIcon = (fileType: string | null) => {
  if (!fileType) return <FileIcon size={16} />;
  
  if (fileType.startsWith("image/")) return <FileImage size={16} />;
  if (fileType.startsWith("video/")) return <FileVideo size={16} />;
  if (fileType.startsWith("audio/")) return <FileAudio size={16} />;
  if (fileType.includes("pdf") || fileType.includes("document") || fileType.includes("text")) 
    return <FileText size={16} />;
  if (fileType.includes("zip") || fileType.includes("rar") || fileType.includes("archive"))
    return <Archive size={16} />;
  
  return <FileIcon size={16} />;
};

const formatFileSize = (bytes: number | null) => {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const isImageFile = (fileType: string | null) => {
  return fileType?.startsWith("image/") || false;
};

export function TaskAttachments({ taskId, isEditing = false }: TaskAttachmentsProps) {
  const { user } = useAuth();
  const { isAdmin } = useWorkspace();
  const queryClient = useQueryClient();
  const [isUploading, setIsUploading] = useState(false);
  const [attachmentToDelete, setAttachmentToDelete] = useState<{ id: string; name: string } | null>(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkName, setLinkName] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [previewImage, setPreviewImage] = useState<{ url: string; name: string } | null>(null);

  const { data: attachments, isLoading } = useQuery({
    queryKey: ["task-attachments", taskId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_attachments")
        .select("*")
        .eq("task_id", taskId)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  const canDelete = (uploadedBy: string | null) => {
    if (isAdmin) return true;
    return uploadedBy === user?.id;
  };

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const fileExt = file.name.split(".").pop();
      const fileName = `${taskId}/${Date.now()}-${file.name}`;
      
      const { error: uploadError } = await supabase.storage
        .from("task-files")
        .upload(fileName, file);
      
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("task-files")
        .getPublicUrl(fileName);

      const { error: insertError } = await supabase
        .from("task_attachments")
        .insert({
          task_id: taskId,
          name: file.name,
          file_url: urlData.publicUrl,
          file_type: file.type,
          file_size: file.size,
          uploaded_by: user?.id,
        });

      if (insertError) throw insertError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-attachments", taskId] });
      toast.success("Arquivo enviado!");
    },
    onError: (error: any) => {
      toast.error("Erro ao enviar arquivo: " + error.message);
    },
  });

  const addLinkMutation = useMutation({
    mutationFn: async ({ name, url }: { name: string; url: string }) => {
      const { error } = await supabase
        .from("task_attachments")
        .insert({
          task_id: taskId,
          name,
          file_url: url,
          file_type: "link",
          file_size: null,
          uploaded_by: user?.id,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-attachments", taskId] });
      setLinkDialogOpen(false);
      setLinkName("");
      setLinkUrl("");
      toast.success("Link adicionado!");
    },
    onError: (error: any) => {
      toast.error("Erro ao adicionar link: " + error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (attachmentId: string) => {
      const { error } = await supabase
        .from("task_attachments")
        .delete()
        .eq("id", attachmentId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-attachments", taskId] });
      setAttachmentToDelete(null);
      toast.success("Anexo removido!");
    },
    onError: (error: any) => {
      toast.error("Erro ao remover anexo: " + error.message);
    },
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        await uploadMutation.mutateAsync(files[i]);
      }
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  const handleAddLink = () => {
    if (!linkName.trim() || !linkUrl.trim()) {
      toast.error("Preencha o nome e a URL do link");
      return;
    }
    addLinkMutation.mutate({ name: linkName, url: linkUrl });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {isEditing && (
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Input
              type="file"
              multiple
              onChange={handleFileUpload}
              className="hidden"
              id="file-upload"
              disabled={isUploading}
            />
            <Label
              htmlFor="file-upload"
              className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-md cursor-pointer transition-colors"
            >
              <Upload size={14} />
              {isUploading ? "Enviando..." : "Enviar Arquivo"}
            </Label>
          </div>

          <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <LinkIcon size={14} />
                Adicionar Link
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Adicionar Link</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Nome do Link</Label>
                  <Input
                    value={linkName}
                    onChange={(e) => setLinkName(e.target.value)}
                    placeholder="Ex: Documento de referência"
                  />
                </div>
                <div className="space-y-2">
                  <Label>URL</Label>
                  <Input
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    placeholder="https://..."
                  />
                </div>
                <Button 
                  onClick={handleAddLink} 
                  disabled={addLinkMutation.isPending}
                  className="w-full"
                >
                  Adicionar
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {attachments && attachments.length > 0 ? (
        <div className="space-y-2">
          {attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="flex items-center gap-3 p-2 rounded bg-muted/50 hover:bg-muted group"
            >
              {/* Image Preview Thumbnail */}
              {isImageFile(attachment.file_type) ? (
                <button
                  onClick={() => setPreviewImage({ url: attachment.file_url, name: attachment.name })}
                  className="flex-shrink-0 w-10 h-10 rounded overflow-hidden border border-border hover:border-primary transition-colors cursor-pointer"
                >
                  <img 
                    src={attachment.file_url} 
                    alt={attachment.name}
                    className="w-full h-full object-cover"
                  />
                </button>
              ) : (
                <div className="flex-shrink-0 text-muted-foreground">
                  {attachment.file_type === "link" ? (
                    <LinkIcon size={16} />
                  ) : (
                    getFileIcon(attachment.file_type)
                  )}
                </div>
              )}
              
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{attachment.name}</p>
                {attachment.file_size && (
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(attachment.file_size)}
                  </p>
                )}
              </div>
              
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {isImageFile(attachment.file_type) && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setPreviewImage({ url: attachment.file_url, name: attachment.name })}
                  >
                    <ZoomIn size={14} />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  asChild
                >
                  <a
                    href={attachment.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    download={attachment.file_type !== "link"}
                  >
                    {attachment.file_type === "link" ? (
                      <ExternalLink size={14} />
                    ) : (
                      <Download size={14} />
                    )}
                  </a>
                </Button>
                {canDelete(attachment.uploaded_by) && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => setAttachmentToDelete({ id: attachment.id, name: attachment.name })}
                  >
                    <Trash2 size={14} />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {isEditing ? "Nenhum arquivo anexado. Use os botões acima para adicionar." : "Nenhum arquivo anexado."}
        </p>
      )}

      {/* Image Preview Dialog */}
      <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-0 overflow-hidden">
          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 z-10 bg-background/80 hover:bg-background"
              onClick={() => setPreviewImage(null)}
            >
              <X size={20} />
            </Button>
            {previewImage && (
              <div className="flex flex-col">
                <div className="p-4 border-b">
                  <h3 className="font-medium truncate">{previewImage.name}</h3>
                </div>
                <div className="flex items-center justify-center p-4 bg-muted/30 max-h-[70vh] overflow-auto">
                  <img 
                    src={previewImage.url} 
                    alt={previewImage.name}
                    className="max-w-full max-h-[65vh] object-contain"
                  />
                </div>
                <div className="p-4 border-t flex justify-end">
                  <Button asChild>
                    <a
                      href={previewImage.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      download
                    >
                      <Download size={16} className="mr-2" />
                      Baixar
                    </a>
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!attachmentToDelete} onOpenChange={(open) => !open && setAttachmentToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover Anexo</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover "{attachmentToDelete?.name}"?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => attachmentToDelete && deleteMutation.mutate(attachmentToDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
