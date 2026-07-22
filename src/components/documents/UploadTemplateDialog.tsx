import { useState } from 'react';
import { Upload, Loader2, FileText, CheckCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface UploadTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fecha o dialog e abre o editor manual pré-preenchido com o conteúdo extraído. */
  onEditManually: (draft: { name: string; content: string; fields: any[] }) => void;
}

export function UploadTemplateDialog({ open, onOpenChange, onEditManually }: UploadTemplateDialogProps) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<{ content: string; fields: any[]; aiUsed: boolean } | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      if (!name) {
        setName(selected.name.replace(/\.[^.]+$/, ''));
      }
    }
  };

  const handleProcess = async () => {
    if (!file || !profile) return;
    setProcessing(true);
    try {
      // Sanitize file name for storage path (remove accents and special chars)
      const safeName = file.name
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = `${profile.organization_id}/templates/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from('contact-files')
        .upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('contact-files')
        .getPublicUrl(filePath);

      // Process with AI
      const { data, error } = await supabase.functions.invoke('process-document-template', {
        body: { file_url: urlData.publicUrl, file_name: file.name },
      });
      if (error) {
        console.error('Edge function error:', error);
        throw new Error(typeof error === 'object' && error.message ? error.message : 'Erro ao processar documento com IA');
      }
      if (!data || typeof data.content !== 'string') {
        console.error('Invalid response:', data);
        throw new Error('Resposta inválida ao processar o documento. Tente novamente.');
      }

      setResult({
        content: data.content,
        fields: data.fields || [],
        aiUsed: data.ai_used !== false,
      });
    } catch (error: any) {
      toast({ title: 'Erro ao processar documento', description: error.message, variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  const handleEditManually = () => {
    if (!result || !name.trim()) return;
    onEditManually({ name, content: result.content, fields: result.fields });
    onOpenChange(false);
    setFile(null);
    setName('');
    setResult(null);
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      setFile(null);
      setName('');
      setResult(null);
      setProcessing(false);
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload de Modelo</DialogTitle>
          <DialogDescription>
            Envie um PDF ou DOCX. Se a IA estiver disponível, os campos variáveis são sugeridos
            automaticamente; caso contrário, você marca os campos manualmente no editor a seguir.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Nome do template</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Contrato de Honorários" />
          </div>

          {!result ? (
            <>
              <div>
                <Label>Arquivo modelo</Label>
              <label className="mt-1 border-2 border-dashed border-border rounded-lg p-6 text-center block cursor-pointer relative hover:border-primary/50 transition-colors">
                  {file ? (
                    <div className="flex items-center justify-center gap-2">
                      <FileText className="h-5 w-5 text-primary" />
                      <span className="text-sm font-medium">{file.name}</span>
                    </div>
                  ) : (
                    <div>
                      <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">Arraste ou clique para selecionar</p>
                      <p className="text-xs text-muted-foreground mt-1">PDF ou DOCX</p>
                    </div>
                  )}
                  <input
                    type="file"
                    accept=".pdf,.docx,.doc"
                    onChange={handleFileChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                </label>
              </div>
              <Button
                onClick={handleProcess}
                disabled={!file || !name.trim() || processing}
                className="w-full"
              >
                {processing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Extraindo conteúdo...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Processar documento
                  </>
                )}
              </Button>
            </>
          ) : (
            <>
              {result.aiUsed ? (
                <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="text-sm font-medium text-green-800 dark:text-green-200">Documento analisado pela IA!</p>
                    <p className="text-xs text-green-600 dark:text-green-400">
                      {result.fields.length} campos variáveis sugeridos — revise no editor.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 p-3 bg-muted rounded-lg border border-border">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Conteúdo extraído do documento</p>
                    <p className="text-xs text-muted-foreground">
                      IA indisponível no momento — marque os campos variáveis manualmente no editor.
                    </p>
                  </div>
                </div>
              )}
              {result.fields.length > 0 && (
                <div>
                  <Label>Campos detectados</Label>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {result.fields.map((field: any) => (
                      <span
                        key={field.name}
                        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary"
                      >
                        {`{{${field.name}}}`}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <Label>Preview do conteúdo</Label>
                <div className="mt-1 max-h-48 overflow-y-auto text-xs font-mono p-3 bg-muted rounded-lg whitespace-pre-wrap">
                  {result.content.slice(0, 1000)}{result.content.length > 1000 ? '...' : ''}
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setResult(null)}>
                  Reprocessar
                </Button>
                <Button className="flex-1" onClick={handleEditManually}>
                  Editar manualmente
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
