import { useState } from 'react';
import { Paperclip, Loader2, FolderPlus, Folder, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import { Input } from '@/components/ui/input';
import { 
  useContactFolders, 
  useAddContactFile, 
  useCreateContactFolder,
  getFileType 
} from '@/hooks/useContactFiles';

interface ArchiveMediaButtonProps {
  contactId: string;
  messageId: string;
  mediaUrl: string;
  mediaType: 'image' | 'video' | 'audio' | 'document';
  fileName?: string;
}

export function ArchiveMediaButton({ 
  contactId, 
  messageId, 
  mediaUrl, 
  mediaType,
  fileName 
}: ArchiveMediaButtonProps) {
  const { data: folders } = useContactFolders(contactId);
  const addFile = useAddContactFile();
  const createFolder = useCreateContactFolder();
  
  const [isOpen, setIsOpen] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isArchiving, setIsArchiving] = useState(false);
  const [archived, setArchived] = useState(false);

  const handleArchive = async (folderId: string | null) => {
    setIsArchiving(true);
    try {
      // Generate file name from URL or use provided name
      const name = fileName || `${mediaType}-${new Date().toISOString().split('T')[0]}`;
      
      await addFile.mutateAsync({
        contactId,
        folderId,
        messageId,
        name,
        fileUrl: mediaUrl,
        fileType: mediaType,
      });
      
      setArchived(true);
      setIsOpen(false);
    } catch (error) {
      // Error handled by mutation
    } finally {
      setIsArchiving(false);
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    
    try {
      const folder = await createFolder.mutateAsync({
        contactId,
        name: newFolderName.trim(),
      });
      
      // Archive to the new folder
      if (folder) {
        await handleArchive(folder.id);
      }
      
      setNewFolderName('');
      setIsCreatingFolder(false);
    } catch (error) {
      // Error handled by mutation
    }
  };

  if (archived) {
    return (
      <div className="flex items-center gap-1 text-[10px] opacity-60">
        <Check className="h-3 w-3" />
        <span>Salvo</span>
      </div>
    );
  }

  return (
    <>
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-[10px] opacity-60 hover:opacity-100"
            disabled={isArchiving}
          >
            {isArchiving ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <>
                <Paperclip className="h-3 w-3 mr-1" />
                Salvar
              </>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuItem onClick={() => handleArchive(null)}>
            <Folder className="h-3.5 w-3.5 mr-2" />
            Sem pasta
          </DropdownMenuItem>
          
          {folders && folders.length > 0 && (
            <>
              <DropdownMenuSeparator />
              {folders.map((folder) => (
                <DropdownMenuItem 
                  key={folder.id}
                  onClick={() => handleArchive(folder.id)}
                >
                  <Folder className="h-3.5 w-3.5 mr-2" />
                  {folder.name}
                </DropdownMenuItem>
              ))}
            </>
          )}
          
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setIsCreatingFolder(true)}>
            <FolderPlus className="h-3.5 w-3.5 mr-2" />
            Nova pasta...
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Create Folder Dialog */}
      <Dialog open={isCreatingFolder} onOpenChange={setIsCreatingFolder}>
        <DialogContent className="sm:max-w-[300px]">
          <DialogHeader>
            <DialogTitle>Nova pasta</DialogTitle>
            <DialogDescription>
              Crie uma pasta e salve o arquivo nela.
            </DialogDescription>
          </DialogHeader>
          </DialogHeader>
          <Input
            placeholder="Nome da pasta"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateFolder();
            }}
          />
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setIsCreatingFolder(false);
                setNewFolderName('');
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCreateFolder}
              disabled={!newFolderName.trim() || createFolder.isPending || addFile.isPending}
            >
              {(createFolder.isPending || addFile.isPending) ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Criar e arquivar'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
