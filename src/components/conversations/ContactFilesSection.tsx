import { useEffect, useState, useRef } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import * as pdfjsLib from 'pdfjs-dist';
import PdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?worker';
import { supabase } from '@/integrations/supabase/client';
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

pdfjsLib.GlobalWorkerOptions.workerPort = new PdfWorker();

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

function PdfPreviewPages({ pdfDocument, pageCount }: { pdfDocument: any; pageCount: number }) {
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const [isRendering, setIsRendering] = useState(true);
  const [renderError, setRenderError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const renderPages = async () => {
      if (!pdfDocument || pageCount <= 0) {
        setIsRendering(false);
        return;
      }

      setIsRendering(true);
      setRenderError(false);

      try {
        const containerWidth = Math.min(window.innerWidth * 0.86, 980);

        for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
          const canvas = canvasRefs.current[pageNumber - 1];
          if (!canvas) continue;

          const page = await pdfDocument.getPage(pageNumber);
          if (cancelled) return;

          const baseViewport = page.getViewport({ scale: 1 });
          const scale = Math.max(0.8, Math.min(2, containerWidth / baseViewport.width));
          const viewport = page.getViewport({ scale });
          const context = canvas.getContext('2d');
          if (!context) continue;

          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = `${Math.floor(viewport.width)}px`;
          canvas.style.height = `${Math.floor(viewport.height)}px`;

          context.clearRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: context, viewport }).promise;
          if (cancelled) return;
        }
      } catch (error) {
        if (!cancelled) setRenderError(true);
      } finally {
        if (!cancelled) setIsRendering(false);
      }
    };

    renderPages();

    return () => {
      cancelled = true;
    };
  }, [pdfDocument, pageCount]);

  if (renderError) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Não foi possível renderizar a pré-visualização do PDF.
      </div>
    );
  }

  return (
    <div className="relative min-h-0 w-full flex-1 overflow-auto bg-zinc-200 p-4">
      {isRendering && (
        <div className="sticky top-0 z-10 mx-auto mb-3 flex w-fit items-center gap-2 rounded-md border border-border bg-background/95 px-3 py-2 text-sm text-muted-foreground shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Renderizando PDF...
        </div>
      )}
      <div className="mx-auto flex w-fit flex-col gap-4">
        {Array.from({ length: pageCount }, (_, index) => (
          <canvas
            key={index}
            ref={(canvas) => {
              canvasRefs.current[index] = canvas;
            }}
            className="block max-w-full bg-white shadow-lg"
          />
        ))}
      </div>
    </div>
  );
}

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
  const [pdfPreviewLoading, setPdfPreviewLoading] = useState(false);
  const [pdfPreviewError, setPdfPreviewError] = useState(false);
  const [pdfDocument, setPdfDocument] = useState<any>(null);
  const [pdfPageCount, setPdfPageCount] = useState(0);
  const [imageZoom, setImageZoom] = useState(1);
  
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

  const closePreview = (event?: { preventDefault?: () => void; stopPropagation?: () => void }) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    setPreviewFile(null);
  };

  const getPreviewExtension = (file: ContactFile | null) => {
    if (!file) return '';
    let decodedUrl = '';
    try {
      decodedUrl = decodeURIComponent((file.file_url || '').split('?')[0].split('#')[0]);
    } catch {
      decodedUrl = (file.file_url || '').split('?')[0].split('#')[0];
    }
    const candidates = [
      file.name || '',
      decodedUrl,
    ];
    for (const candidate of candidates) {
      const match = candidate.toLowerCase().match(/\.([a-z0-9]+)$/i);
      if (match?.[1]) return match[1];
    }
    return '';
  };

  const isPdfFile = (file: ContactFile | null) => getPreviewExtension(file) === 'pdf';

  const getContactFileStoragePath = (file: ContactFile) => {
    if (file.storage_path) return file.storage_path;

    try {
      const url = new URL(file.file_url);
      const marker = '/storage/v1/object/public/contact-files/';
      const markerIndex = url.pathname.indexOf(marker);

      if (markerIndex >= 0) {
        return decodeURIComponent(url.pathname.slice(markerIndex + marker.length));
      }
    } catch {
      return null;
    }

    return null;
  };

  const ensurePdfBytes = (buffer: ArrayBuffer) => {
    const bytes = new Uint8Array(buffer);
    const header = new TextDecoder('latin1').decode(bytes.slice(0, 64));

    if (!header.includes('%PDF-')) {
      throw new Error(`Downloaded file is not a PDF. Header: ${header.slice(0, 24)}`);
    }

    return bytes;
  };

  const loadContactFilePdfBytes = async (file: ContactFile) => {
    const storagePath = getContactFileStoragePath(file);

    if (storagePath) {
      const { data, error } = await supabase.storage
        .from('contact-files')
        .download(storagePath);

      if (!error && data) {
        return ensurePdfBytes(await data.arrayBuffer());
      }

      console.error('Contact PDF storage download failed:', error);
    }

    const response = await fetch(file.file_url, {
      mode: 'cors',
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`PDF fetch failed: ${response.status}`);
    }

    return ensurePdfBytes(await response.arrayBuffer());
  };

  const previewIndex = previewFile ? filteredFiles.findIndex((file) => file.id === previewFile.id) : -1;
  const canNavigatePreview = filteredFiles.length > 1 && previewIndex >= 0;

  const navigatePreview = (direction: -1 | 1, event?: { preventDefault?: () => void; stopPropagation?: () => void }) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (!canNavigatePreview) return;
    const nextIndex = (previewIndex + direction + filteredFiles.length) % filteredFiles.length;
    setPreviewFile(filteredFiles[nextIndex]);
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
  const isPdfPreview = isPdfFile(previewFile);

  useEffect(() => {
    let cancelled = false;

    setPdfDocument(null);
    setPdfPageCount(0);
    setPdfPreviewError(false);

    if (!previewFile || !isPdfFile(previewFile)) {
      setPdfPreviewLoading(false);
      return;
    }

    setPdfPreviewLoading(true);
    loadContactFilePdfBytes(previewFile)
      .then((bytes) => pdfjsLib.getDocument({ data: bytes }).promise)
      .then((doc) => {
        if (cancelled) return;
        setPdfDocument(doc);
        setPdfPageCount(doc.numPages);
      })
      .catch((error) => {
        console.error('Contact PDF preview failed:', error);
        if (!cancelled) setPdfPreviewError(true);
      })
      .finally(() => {
        if (!cancelled) setPdfPreviewLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [previewFile?.id, previewFile?.file_url]);

  useEffect(() => {
    setImageZoom(1);
  }, [previewFile?.id]);

  const updateImageZoom = (delta: number) => {
    setImageZoom((zoom) => Math.min(3, Math.max(0.5, Number((zoom + delta).toFixed(2)))));
  };

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
                  className="group flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 p-2 transition-colors hover:bg-muted/60"
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    onClick={() => handleFileClick(file)}
                  >
                    {file.file_type === 'image' ? (
                      <img
                        src={file.file_url}
                        alt={file.name}
                        className="h-8 w-8 flex-shrink-0 rounded object-cover"
                      />
                    ) : (
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded bg-muted">
                        <FileIcon type={file.file_type} />
                      </div>
                    )}

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium">{file.name}</span>
                      <span className="block text-[10px] text-muted-foreground">
                        {formatFileSize(file.file_size)}
                        {!selectedFolderId && file.folder && ` • ${file.folder.name}`}
                      </span>
                    </span>
                  </button>

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
                      <DropdownMenuItem onClick={() => handleFileClick(file)}>
                        <ExternalLink className="h-3.5 w-3.5 mr-2" />
                        Visualizar
                      </DropdownMenuItem>
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

      {/* File Preview Overlay */}
      {previewFile && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 p-4"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={closePreview}
        >
          {canNavigatePreview && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="absolute left-3 top-1/2 z-10 h-10 w-10 -translate-y-1/2 rounded-full bg-background/80 shadow hover:bg-background"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => navigatePreview(-1, event)}
                title="Arquivo anterior"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-3 top-1/2 z-10 h-10 w-10 -translate-y-1/2 rounded-full bg-background/80 shadow hover:bg-background"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => navigatePreview(1, event)}
                title="Próximo arquivo"
              >
                <ArrowRight className="h-5 w-5" />
              </Button>
            </>
          )}
          <div
            className="flex h-[min(90vh,820px)] w-[min(96vw,1100px)] min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-background text-foreground shadow-2xl"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={previewFile.name}
          >
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
                  {previewFile.file_type === 'image' && (
                    <div className="mr-2 flex items-center gap-1 rounded-md border border-border bg-muted/40 px-1 py-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(event) => {
                          event.stopPropagation();
                          updateImageZoom(-0.25);
                        }}
                        disabled={imageZoom <= 0.5}
                        title="Diminuir zoom"
                      >
                        <ZoomOut className="h-4 w-4" />
                      </Button>
                      <button
                        type="button"
                        className="min-w-12 rounded px-1 text-center text-xs text-muted-foreground hover:text-foreground"
                        onClick={(event) => {
                          event.stopPropagation();
                          setImageZoom(1);
                        }}
                        title="Redefinir zoom"
                      >
                        {Math.round(imageZoom * 100)}%
                      </button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(event) => {
                          event.stopPropagation();
                          updateImageZoom(0.25);
                        }}
                        disabled={imageZoom >= 3}
                        title="Aumentar zoom"
                      >
                        <ZoomIn className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleDownloadFile(previewFile);
                    }}
                    title="Baixar"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  {previewFile.file_type === 'image' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleSaveAsPdf(previewFile);
                      }}
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
                    onClick={closePreview}
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
                    className="rounded object-contain transition-[width,max-height,max-width] duration-150"
                    style={{
                      maxWidth: imageZoom === 1 ? '100%' : 'none',
                      maxHeight: imageZoom === 1 ? '70vh' : 'none',
                      width: imageZoom === 1 ? 'auto' : `${imageZoom * 100}%`,
                    }}
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
                  pdfPreviewLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Carregando PDF...
                    </div>
                  ) : pdfDocument && !pdfPreviewError ? (
                    <PdfPreviewPages pdfDocument={pdfDocument} pageCount={pdfPageCount} />
                  ) : (
                    <div className="text-center space-y-3">
                      <FileText className="h-16 w-16 mx-auto text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">Não foi possível carregar a pré-visualização do PDF.</p>
                      <Button variant="outline" size="sm" onClick={() => handleDownloadFile(previewFile)}>
                        <Download className="h-3.5 w-3.5 mr-2" />
                        Baixar PDF
                      </Button>
                    </div>
                  )
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
        </div>
      )}
    </div>
  );
}
