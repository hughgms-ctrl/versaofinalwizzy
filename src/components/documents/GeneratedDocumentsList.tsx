import { FileText, Download, Search, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useGeneratedDocuments, useDeleteGeneratedDocument } from '@/hooks/useGeneratedDocuments';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
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
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: 'Rascunho', variant: 'secondary' },
  generated: { label: 'Gerado', variant: 'default' },
  sent: { label: 'Enviado', variant: 'outline' },
  signed: { label: 'Assinado', variant: 'default' },
};

export function GeneratedDocumentsList() {
  const { data: documents, isLoading } = useGeneratedDocuments();
  const deleteDocument = useDeleteGeneratedDocument();
  const [search, setSearch] = useState('');

  const filtered = documents?.filter(d =>
    d.name.toLowerCase().includes(search.toLowerCase())
  ) || [];

  const handleDelete = (id: string) => {
    deleteDocument.mutate(id, {
      onSuccess: () => toast.success('Documento excluído'),
      onError: () => toast.error('Erro ao excluir documento'),
    });
  };

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar documentos..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <Card key={i} className="p-4 animate-pulse">
              <div className="h-5 bg-muted rounded w-1/2" />
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Nenhum documento gerado</h3>
          <p className="text-sm text-muted-foreground">
            Documentos gerados a partir de templates aparecerão aqui.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(doc => {
            const status = STATUS_MAP[doc.status] || STATUS_MAP.draft;
            return (
              <Card key={doc.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-medium text-sm">{doc.name}</h3>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(doc.created_at), "dd MMM yyyy 'às' HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={status.variant}>{status.label}</Badge>
                    {doc.signing_method && (
                      <Badge variant="outline" className="text-xs">
                        {doc.signing_method === 'manual' ? 'Manual' : doc.signing_method === 'govbr' ? 'Gov.br' : 'ZapSign'}
                      </Badge>
                    )}
                    {doc.pdf_url && (
                      <Button variant="ghost" size="icon" asChild>
                        <a href={doc.pdf_url} target="_blank" rel="noopener noreferrer">
                          <Download className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir documento?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Esta ação não pode ser desfeita. O documento e suas assinaturas serão permanentemente excluídos.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(doc.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Excluir
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
