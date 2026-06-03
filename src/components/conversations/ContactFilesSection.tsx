import { useState, useRef } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  Plus, 
  Loader2, 
  Trash2, 
  FolderPlus,
  Folder,
  Image,
  Video,
  FileAudio,
  FileText,
  Upload,
  MoreVertical,
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Paperclip,
  FileDown,
  Download,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { 
  useContactFolders,
  useCreateContactFolder,
  useDeleteContactFolder,
  useContactFiles,
  useAddContactFile,
  useMoveContactFile,
  useDeleteContactFile,
  uploadContactFile,
  getFileType,
  ContactFolder,
  ContactFile,
} from '@/hooks/useContactFiles';

interface ContactFilesSectionProps {
  contactId: string;
}

const FileIcon = ({ type }: { type: string }) => {
  switch (type) {
    case 'image':
      return <Image className="h-4 w-4 text-green-500" />;
    case 'video':
      return <Video className="h-4 w-4 text-purple-500" />;
    case 'audio':
      return <FileAudio className="h-4 w-4 text-blue-500" />;
    default:
      return <FileText className="h-4 w-4 text-orange-500" />;
  }
};

export function ContactFilesSection({ contactId }: ContactFilesSectionProps) {
  const { toast } = useToast();
  const { data: folders, isLoading: loadingFolders } = useContactFolders(contactId);
  const { data: files, isLoading: loadingFiles } = useContactFiles(contactId);
  const createFolder = useCreateContactFolder();
  const deleteFolder = useDeleteContactFolder();
  const addFile = useAddContactFile();
  const moveFile = useMoveContactFile();
  const deleteFile = useDeleteContactFile();

  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [deleteFolderId, setDeleteFolderId] = useState<string | null>(null);
  const [deleteFileId, setDeleteFileId] = useState<string | null>(null);
  const [deleteFilePath, setDeleteFilePath] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [previewFile, setPreviewFile] = useState<ContactFile | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedFolder = folders?.find((folder) => folder.id === selectedFolderId) || null;
  const rootFiles = files?.filter((file) => !file.folder_id) || [];
  const filteredFiles = selectedFolderId
    ? files?.filter((file) => file.folder_id === selectedFolderId) || []
    : rootFiles;

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    
    await createFolder.mutateAsync({
      contactId,
      name: newFolderName.trim(),
    });
    
    setNewFolderName('');
    setIsCreatingFolder(false);
  };

  const handleDeleteFolder = async () => {
    if (!deleteFolderId) return;
    
    await deleteFolder.mutateAsync({
      folderId: deleteFolderId,
      contactId,
    });
    
    if (selectedFolderId === deleteFolderId) {
      setSelectedFolderId(null);
    }
    setDeleteFolderId(null);
  };

  const handleDeleteFile = async () => {
    if (!deleteFileId) return;
    
    await deleteFile.mutateAsync({
      fileId: deleteFileId,
      contactId,
      storagePath: deleteFilePath,
    });
    
    setDeleteFileId(null);
    setDeleteFilePath(null);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check file size (16MB limit)
    if (file.size > 16 * 1024 * 1024) {
      toast({
        title: 'Arquivo muito grande',
        description: 'O tamanho máximo permitido é 16MB.',
        variant: 'destructive',
      });
      return;
    }

    setIsUploading(true);

    try {
      const result = await uploadContactFile(file, contactId);
      
      if (!result) {
        throw new Error('Erro ao fazer upload');
      }

      await addFile.mutateAsync({
        contactId,
        folderId: selectedFolderId,
        name: file.name,
        fileUrl: result.url,
        fileType: getFileType(file.type, file.name),
        fileSize: file.size,
        storagePath: result.path,
      });
    } catch (error: any) {
      toast({
        title: 'Erro no upload',
        description: error.message || 'Não foi possível fazer o upload do arquivo.',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleMoveFile = async (fileId: string, folderId: string | null) => {
    await moveFile.mutateAsync({
      fileId,
      folderId,
      contactId,
    });
  };

  const handleSaveAsPdf = async (file: ContactFile) => {
    try {
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);

        // Create PDF with image dimensions
        const pdfWidth = img.naturalWidth;
        const pdfHeight = img.naturalHeight;
        const A4_W = 595.28;
        const A4_H = 841.89;
        const scale = Math.min(A4_W / pdfWidth, A4_H / pdfHeight, 1);
        const scaledW = pdfWidth * scale;
        const scaledH = pdfHeight * scale;

        // Simple PDF generation
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        
        // Use a simple approach: open in new tab for print/save as PDF
        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head><title>${file.name}</title>
            <style>
              @page { size: auto; margin: 10mm; }
              body { margin: 0; display: flex; justify-content: center; align-items: flex-start; }
              img { max-width: 100%; height: auto; }
            </style>
            </head>
            <body>
              <img src="${imgData}" />
              <script>
                setTimeout(function() { window.print(); }, 500);
              </script>
            </body>
            </html>
          `);
          printWindow.document.close();
        }
      };
      img.onerror = () => {
        toast({
          title: 'Erro',
          description: 'Não foi possível carregar a imagem para gerar o PDF.',
          variant: 'destructive',
        });
      };
      img.src = file.file_url;
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Erro ao gerar PDF.',
        variant: 'destructive',
      });
    }
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleFileClick = (file: ContactFile) => {
    setPreviewFile(file);
  };

  const handleDownloadFile = async (file: ContactFile) => {
    try {
      const response = await fetch(file.file_url);
      if (!response.ok) throw new Error('fetch failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast({
        title: 'Não foi possível baixar o arquivo',
        description: 'Tente desativar bloqueadores de anúncios (ad-blocker) e recarregar a página.',
        variant: 'destructive',
      });
    }
  };

  const totalFiles = files?.length || 0;
  const previewFileName = previewFile?.name || '';
  const previewUrl = previewFile?.file_url || '';
  const isPdfPreview = Boolean(previewFile)
    && (previewFileName.toLowerCase().endsWith('.pdf') || previewUrl.toLowerCase().includes('.pdf'));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
          <Paperclip className="h-3.5 w-3.5" />
          <span>Mídias e Docs</span>
          {totalFiles > 0 && (
            <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full">
              {totalFiles}
            </span>
          )}
        </div>
        <div className="flex gap-1">
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-6 px-2"
              onClick={() => setIsCreatingFolder(true)}
              disabled={isCreatingFolder}
            >
              <FolderPlus className="h-3 w-3 mr-1" />
              Pasta
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-6 px-2"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              {isUploading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <>
                  <Upload className="h-3 w-3 mr-1" />
                  Upload
                </>
              )}
            </Button>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileUpload}
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
      />

      <>
          {/* Create Folder Form */}
          {isCreatingFolder && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 border border-border">
              <FolderPlus className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <Input
                placeholder="Nome da pasta"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                className="h-7 text-sm"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateFolder();
                  if (e.key === 'Escape') {
                    setIsCreatingFolder(false);
                    setNewFolderName('');
                  }
                }}
              />
              <Button
                size="sm"
                className="h-7 px-2"
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim() || createFolder.isPending}
              >
                {createFolder.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  'Criar'
                )}
              </Button>
            </div>
          )}

          {selectedFolder ? (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => setSelectedFolderId(null)}
                title="Voltar"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <Folder className="h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{selectedFolder.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {filteredFiles.length} {filteredFiles.length === 1 ? 'arquivo' : 'arquivos'}
                </p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => setDeleteFolderId(selectedFolder.id)}
                title="Remover pasta"
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          ) : loadingFolders ? (
            <div className="flex justify-center py-2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : folders && folders.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {folders.map((folder) => {
                const folderFileCount = files?.filter(f => f.folder_id === folder.id).length || 0;

                return (
                  <div
                    key={folder.id}
                    className="group flex min-w-0 items-center gap-2 rounded-lg border border-border bg-muted/30 p-2 transition-colors hover:bg-muted/60"
                  >
                    <button
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      onClick={() => setSelectedFolderId(folder.id)}
                    >
                      <Folder className="h-5 w-5 shrink-0 text-primary" />
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-medium">{folder.name}</span>
                        <span className="block text-[10px] text-muted-foreground">
                          {folderFileCount} {folderFileCount === 1 ? 'arquivo' : 'arquivos'}
                        </span>
                      </span>
                    </button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100"
                      onClick={() => setDeleteFolderId(folder.id)}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : null}

          {/* Files List */}
          {loadingFiles ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : filteredFiles.length > 0 ? (
            <div className="space-y-1 mt-2">
              {filteredFiles.map((file) => (
                <div 
                  key={file.id} 
                  className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 border border-border/50 group cursor-pointer hover:bg-muted/60 transition-colors"
                  onClick={() => handleFileClick(file)}
                >
                  {file.file_type === 'image' ? (
                    <img 
                      src={file.file_url} 
                      alt={file.name}
                      className="h-8 w-8 rounded object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="h-8 w-8 rounded bg-muted flex items-center justify-center flex-shrink-0">
                      <FileIcon type={file.file_type} />
                    </div>
                  )}
                  
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{file.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {formatFileSize(file.file_size)}
                      {!selectedFolderId && file.folder && ` • ${file.folder.name}`}
                    </p>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreVertical className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                     <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenuItem asChild>
                        <a href={file.file_url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3.5 w-3.5 mr-2" />
                          Abrir em nova aba
                        </a>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDownloadFile(file)}>
                        <Download className="h-3.5 w-3.5 mr-2" />
                        Baixar
                      </DropdownMenuItem>

                      {file.file_type === 'image' && (
                        <DropdownMenuItem onClick={() => handleSaveAsPdf(file)}>
                          <FileDown className="h-3.5 w-3.5 mr-2" />
                          Salvar como PDF
                        </DropdownMenuItem>
                      )}
                      
                      {folders && folders.length > 0 && (
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger>
                            <ArrowRight className="h-3.5 w-3.5 mr-2" />
                            Mover para
                          </DropdownMenuSubTrigger>
                           <DropdownMenuSubContent onClick={(e) => e.stopPropagation()}>
                            {file.folder_id && (
                              <DropdownMenuItem 
                                onClick={() => handleMoveFile(file.id, null)}
                              >
                                <Folder className="h-3.5 w-3.5 mr-2" />
                                Sem pasta
                              </DropdownMenuItem>
                            )}
                            {folders.filter(f => f.id !== file.folder_id).map((folder) => (
                              <DropdownMenuItem 
                                key={folder.id}
                                onClick={() => handleMoveFile(file.id, folder.id)}
                              >
                                <Folder className="h-3.5 w-3.5 mr-2" />
                                {folder.name}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                      )}
                      
                      <DropdownMenuSeparator />
                      
                      <DropdownMenuItem 
                        className="text-destructive"
                        onClick={() => {
                          setDeleteFileId(file.id);
                          setDeleteFilePath(file.storage_path);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-2" />
                        Remover
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-xs text-muted-foreground mb-2">
                {selectedFolderId 
                  ? 'Nenhum arquivo nesta pasta'
                  : folders && folders.length > 0
                    ? 'Nenhum arquivo fora de pasta'
                    : 'Nenhuma mídia ou documento salvo'}
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
              >
                <Upload className="h-3 w-3 mr-1" />
                Fazer upload
              </Button>
            </div>
          )}
      </>

      {/* Delete Folder Confirmation */}
      <AlertDialog open={!!deleteFolderId} onOpenChange={() => setDeleteFolderId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover pasta?</AlertDialogTitle>
            <AlertDialogDescription>
              Os arquivos dentro da pasta não serão excluídos, apenas movidos para "Sem pasta".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteFolder}>
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete File Confirmation */}
      <AlertDialog open={!!deleteFileId} onOpenChange={() => {
        setDeleteFileId(null);
        setDeleteFilePath(null);
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover arquivo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O arquivo será permanentemente removido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteFile}>
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* File Preview Dialog */}
      <Dialog open={!!previewFile} onOpenChange={(open) => !open && setPreviewFile(null)}>
        <DialogContent className="flex h-[min(90vh,820px)] w-[min(96vw,1100px)] max-w-none flex-col gap-0 overflow-hidden p-0 [&>button.absolute]:hidden">
          {previewFile && (
            <div className="flex min-h-0 flex-1 flex-col">
              {/* Header */}
              <div className="flex shrink-0 items-center justify-between border-b border-border p-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{previewFile.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(previewFile.file_size)}
                    {previewFile.folder && ` • ${previewFile.folder.name}`}
                  </p>
                </div>
                <div className="flex items-center gap-1 ml-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleDownloadFile(previewFile)}
                    title="Baixar"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  {previewFile.file_type === 'image' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleSaveAsPdf(previewFile)}
                      title="Salvar como PDF"
                    >
                      <FileDown className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    asChild
                  >
                    <a href={previewFile.file_url} target="_blank" rel="noopener noreferrer" title="Abrir em nova aba">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setPreviewFile(null)}
                    title="Fechar"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {/* Content */}
              <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-background/50 p-4">
                {previewFile.file_type === 'image' ? (
                  <img 
                    src={previewFile.file_url} 
                    alt={previewFile.name}
                    className="max-w-full max-h-[70vh] object-contain rounded"
                  />
                ) : previewFile.file_type === 'video' ? (
                  <video 
                    src={previewFile.file_url} 
                    controls 
                    className="max-w-full max-h-[70vh] rounded"
                  />
                ) : previewFile.file_type === 'audio' ? (
                  <audio src={previewFile.file_url} controls className="w-full max-w-md" />
                ) : isPdfPreview ? (
                  <iframe
                    src={`${previewFile.file_url}#toolbar=1&navpanes=0`}
                    title={previewFile.name}
                    className="h-full min-h-[420px] w-full rounded border border-border bg-background"
                  />
                ) : (
                  <div className="text-center space-y-3">
                    <FileText className="h-16 w-16 mx-auto text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Pré-visualização não disponível para este tipo de arquivo.</p>
                    <Button variant="outline" size="sm" onClick={() => handleDownloadFile(previewFile)}>
                      <Download className="h-3.5 w-3.5 mr-2" />
                      Baixar arquivo
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
