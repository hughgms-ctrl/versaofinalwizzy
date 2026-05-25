import { useState, useEffect } from 'react';
import { X, Send, Loader2, FileText, Music, Paperclip } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface MediaPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: File | null;
  type: 'image' | 'document' | 'audio';
  onSend: (caption: string) => Promise<void>;
  isSending: boolean;
  confirmLabel?: string;
}

export function MediaPreviewDialog({
  open,
  onOpenChange,
  file,
  type,
  onSend,
  isSending,
  confirmLabel = 'Enviar',
}: MediaPreviewDialogProps) {
  const [caption, setCaption] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Create preview URL when file changes
  useEffect(() => {
    if (file && open) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      return () => {
        URL.revokeObjectURL(url);
      };
    } else {
      setPreviewUrl(null);
    }
  }, [file, open]);

  const handleClose = () => {
    setCaption('');
    onOpenChange(false);
  };

  const handleSend = async () => {
    await onSend(caption);
    setCaption('');
  };

  const renderPreview = () => {
    if (!file || !previewUrl) return null;

    if (type === 'image') {
      return (
        <div className="relative rounded-lg overflow-hidden bg-muted max-h-[400px] flex items-center justify-center">
          <img
            src={previewUrl}
            alt="Preview"
            className="max-w-full max-h-[400px] object-contain"
          />
        </div>
      );
    }

    if (type === 'audio') {
      return (
        <div className="flex flex-col items-center gap-4 p-6 bg-muted rounded-lg">
          <div className="h-16 w-16 rounded-full bg-primary/20 flex items-center justify-center">
            <Music className="h-8 w-8 text-primary" />
          </div>
          <audio controls src={previewUrl} className="w-full max-w-md" />
          <p className="text-sm text-muted-foreground">{file.name}</p>
        </div>
      );
    }

    if (type === 'document') {
      return (
        <div className="flex items-center gap-4 p-6 bg-muted rounded-lg">
          <div className="h-16 w-16 rounded-lg bg-primary/20 flex items-center justify-center">
            <FileText className="h-8 w-8 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{file.name}</p>
            <p className="text-sm text-muted-foreground">
              {(file.size / 1024 / 1024).toFixed(2)} MB
            </p>
          </div>
        </div>
      );
    }

    return null;
  };

  const isAttachMode = confirmLabel === 'Anexar';

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>
              {isAttachMode ? (
                <>
                  {type === 'image' && 'Anexar imagem'}
                  {type === 'audio' && 'Anexar áudio'}
                  {type === 'document' && 'Anexar documento'}
                </>
              ) : (
                <>
                  {type === 'image' && 'Enviar imagem'}
                  {type === 'audio' && 'Enviar áudio'}
                  {type === 'document' && 'Enviar documento'}
                </>
              )}
            </span>
            <Button variant="ghost" size="icon" onClick={handleClose}>
              <X className="h-4 w-4" />
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {renderPreview()}

          {type !== 'audio' && (
            <Input
              placeholder={type === 'document' ? 'Nome do arquivo (opcional)' : 'Adicionar legenda (opcional)'}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !isSending && handleSend()}
            />
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleClose} disabled={isSending}>
              Cancelar
            </Button>
            <Button onClick={handleSend} disabled={isSending}>
              {isSending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  {isAttachMode ? (
                    <Paperclip className="h-4 w-4 mr-2" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  {confirmLabel}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
