import { useState, useRef } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  Plus, 
  Loader2, 
  Trash2, 
  FolderPlus,
  Folder,
  FolderOpen,
  Image,
  Video,
  FileAudio,
  FileText,
  Upload,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  MoreVertical,
  ArrowRight,
  ExternalLink,
  Paperclip,
  FileDown
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

  const [isExpanded, setIsExpanded] = useState(true);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [deleteFolderId, setDeleteFolderId] = useState<string | null>(null);
  const [deleteFileId, setDeleteFileId] = useState<string | null>(null);
  const [deleteFilePath, setDeleteFilePath] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filter files by selected folder
  const filteredFiles = files?.filter(f => {
    if (selectedFolderId === null) return true; // Show all
    return f.folder_id === selectedFolderId;
  }) || [];

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

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const totalFiles = files?.length || 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button 
          className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <Paperclip className="h-3.5 w-3.5" />
          <span>Mídias e Docs</span>
          {totalFiles > 0 && (
            <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full">
              {totalFiles}
            </span>
          )}
          {isExpanded ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
        </button>
        {isExpanded && (
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
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileUpload}
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
      />

      {isExpanded && (
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

          {/* Folders List */}
          {loadingFolders ? (
            <div className="flex justify-center py-2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : folders && folders.length > 0 ? (
            <div className="space-y-1">
              {/* All Files option */}
              <button
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-sm transition-colors ${
                  selectedFolderId === null 
                    ? 'bg-primary/10 text-primary' 
                    : 'hover:bg-muted'
                }`}
                onClick={() => setSelectedFolderId(null)}
              >
                <Folder className="h-4 w-4" />
                <span>Todos os arquivos</span>
                <span className="text-[10px] text-muted-foreground ml-auto">
                  {totalFiles}
                </span>
              </button>
              
              {folders.map((folder) => {
                const folderFileCount = files?.filter(f => f.folder_id === folder.id).length || 0;
                const isSelected = selectedFolderId === folder.id;
                
                return (
                  <div key={folder.id} className="flex items-center gap-1">
                    <button
                      className={`flex-1 flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-sm transition-colors ${
                        isSelected 
                          ? 'bg-primary/10 text-primary' 
                          : 'hover:bg-muted'
                      }`}
                      onClick={() => setSelectedFolderId(isSelected ? null : folder.id)}
                    >
                      {isSelected ? (
                        <FolderOpen className="h-4 w-4" />
                      ) : (
                        <Folder className="h-4 w-4" />
                      )}
                      <span className="truncate">{folder.name}</span>
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        {folderFileCount}
                      </span>
                    </button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100"
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
                  className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 border border-border/50 group"
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
                      {file.folder && ` • ${file.folder.name}`}
                    </p>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100"
                      >
                        <MoreVertical className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <a href={file.file_url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3.5 w-3.5 mr-2" />
                          Abrir
                        </a>
                      </DropdownMenuItem>
                      
                      {folders && folders.length > 0 && (
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger>
                            <ArrowRight className="h-3.5 w-3.5 mr-2" />
                            Mover para
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent>
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
                  : 'Nenhum arquivo arquivado'}
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
      )}

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
    </div>
  );
}
