import { FileText, Download, Search, Trash2, User, FolderOpen, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useGeneratedDocuments, useDeleteGeneratedDocument, useRegenerateDocumentPdf } from '@/hooks/useGeneratedDocuments';
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

interface SubmittedBy {
  name: string;
  phone: string;
  submitted_at?: string;
}

function DocCard({ doc, onDelete }: { doc: any; onDelete: (id: string) => void }) {
  const status = STATUS_MAP[doc.status] || STATUS_MAP.draft;
  const submittedBy = doc.submitted_by as SubmittedBy | null;

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-medium text-sm">{doc.name}</h3>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-xs text-muted-foreground">
                {format(new Date(doc.created_at), "dd MMM yyyy 'às' HH:mm", { locale: ptBR })}
              </p>
              {submittedBy && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {submittedBy.name}
                </span>
              )}
            </div>
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
                <AlertDialogAction onClick={() => onDelete(doc.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Excluir
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </Card>
  );
}

export function GeneratedDocumentsList() {
  const { data: documents, isLoading } = useGeneratedDocuments();
  const deleteDocument = useDeleteGeneratedDocument();
  const [search, setSearch] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const handleDelete = (id: string) => {
    deleteDocument.mutate(id, {
      onSuccess: () => toast.success('Documento excluído'),
      onError: () => toast.error('Erro ao excluir documento'),
    });
  };

  const toggleGroup = (group: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  // Group documents: those with submission_group are grouped, others are standalone
  const { grouped, standalone } = useMemo(() => {
    const filtered = documents?.filter(d =>
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      (d as any).submitted_by?.name?.toLowerCase().includes(search.toLowerCase())
    ) || [];

    const groups = new Map<string, any[]>();
    const singles: any[] = [];

    filtered.forEach(doc => {
      const sg = (doc as any).submission_group;
      if (sg) {
        if (!groups.has(sg)) groups.set(sg, []);
        groups.get(sg)!.push(doc);
      } else {
        singles.push(doc);
      }
    });

    return { grouped: Array.from(groups.entries()), standalone: singles };
  }, [documents, search]);

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
      ) : (grouped.length === 0 && standalone.length === 0) ? (
        <Card className="p-12 text-center">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Nenhum documento gerado</h3>
          <p className="text-sm text-muted-foreground">
            Documentos gerados a partir de templates aparecerão aqui.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {/* Grouped documents (from packs) */}
          {grouped.map(([groupKey, docs]) => {
            const firstDoc = docs[0];
            const submittedBy = firstDoc?.submitted_by as SubmittedBy | null;
            const isCollapsed = collapsedGroups.has(groupKey);

            return (
              <Card key={groupKey} className="overflow-hidden">
                <button
                  onClick={() => toggleGroup(groupKey)}
                  className="w-full p-4 flex items-center gap-3 hover:bg-muted/50 transition-colors text-left"
                >
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <FolderOpen className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-sm truncate">
                        {submittedBy?.name || 'Pack'}
                      </h3>
                      <Badge variant="secondary" className="text-xs shrink-0">
                        {docs.length} doc{docs.length > 1 ? 's' : ''}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {submittedBy && (
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {submittedBy.name} • {submittedBy.phone}
                          {' • '}
                          {format(new Date(firstDoc.created_at), "dd MMM yyyy 'às' HH:mm", { locale: ptBR })}
                        </span>
                      )}
                    </p>
                  </div>
                  {isCollapsed ? (
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                </button>
                {!isCollapsed && (
                  <div className="border-t px-4 pb-3 pt-2 space-y-2">
                    {docs.map(doc => (
                      <DocCard key={doc.id} doc={doc} onDelete={handleDelete} />
                    ))}
                  </div>
                )}
              </Card>
            );
          })}

          {/* Standalone documents */}
          {standalone.map(doc => (
            <DocCard key={doc.id} doc={doc} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}