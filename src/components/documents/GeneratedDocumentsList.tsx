import { FileText, Download, Search, Trash2, User, FolderOpen, ChevronDown, ChevronRight, RefreshCw, Archive, Pencil } from 'lucide-react';
import { useState, useMemo } from 'react';
import JSZip from 'jszip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useGeneratedDocuments, useDeleteGeneratedDocument, useRegenerateDocumentPdf } from '@/hooks/useGeneratedDocuments';
import { resolveDocFileUrl, resolveDocFileUrls } from './documentFiles';
import { EditFilledDataDialog } from './EditFilledDataDialog';
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

const PAGE_SIZE_OPTIONS = [10, 50, 100, 500];
type DocumentFilter = 'all' | 'signed' | 'partial' | 'pending' | 'unsigned' | 'failed';

interface SubmittedBy {
  name: string;
  phone: string;
  submitted_at?: string;
}

function PaginationControls({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  const pages = Array.from({ length: totalPages }, (_, index) => index + 1)
    .filter((pageNumber) => totalPages <= 7 || pageNumber === 1 || pageNumber === totalPages || Math.abs(pageNumber - page) <= 2);

  return (
    <div className="flex flex-col gap-3 border-t pt-3 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Exibir</span>
        <Select value={String(pageSize)} onValueChange={(value) => onPageSizeChange(Number(value))}>
          <SelectTrigger className="h-8 w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((option) => (
              <SelectItem key={option} value={String(option)}>{option}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span>{start}-{end} de {total}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <Button variant="outline" size="sm" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
          Anterior
        </Button>
        {pages.map((pageNumber, index) => {
          const previous = pages[index - 1];
          return (
            <span key={pageNumber} className="flex items-center gap-1">
              {previous && pageNumber - previous > 1 && <span className="px-1 text-xs text-muted-foreground">...</span>}
              <Button
                variant={pageNumber === page ? 'default' : 'outline'}
                size="sm"
                className="h-8 min-w-8 px-2"
                onClick={() => onPageChange(pageNumber)}
              >
                {pageNumber}
              </Button>
            </span>
          );
        })}
        <Button variant="outline" size="sm" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>
          Próxima
        </Button>
      </div>
    </div>
  );
}

function getDocumentItemStatus(docs: any[]): DocumentFilter {
  const hasPdfFailure = docs.some((doc) => !doc.pdf_url && doc.status === 'generated');
  if (hasPdfFailure) return 'failed';

  const signedCount = docs.filter((doc) => doc.signing_status === 'signed' || doc.status === 'signed').length;
  const hasSigning = docs.some((doc) => Boolean(doc.signing_method || doc.signing_status));
  const hasPending = docs.some((doc) => ['pending', 'sent', 'opened'].includes(doc.signing_status));

  if (signedCount === docs.length && docs.length > 0) return 'signed';
  if (signedCount > 0) return 'partial';
  if (hasPending) return 'pending';
  if (!hasSigning) return 'unsigned';
  return 'pending';
}

function DocCard({ doc, onDelete, onRegenerate, onDownload, onEdit, isRegenerating }: { doc: any; onDelete: (id: string) => void; onRegenerate: (doc: any) => void; onDownload: (doc: any) => void; onEdit: (id: string) => void; isRegenerating: boolean }) {
  const isMissingPdf = !doc.pdf_url && doc.status === 'generated';
  const status = isMissingPdf 
    ? { label: 'PDF falhou', variant: 'destructive' as const }
    : (STATUS_MAP[doc.status] || STATUS_MAP.draft);
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
              {doc.signing_method === 'manual' ? 'Manual' : doc.signing_method === 'govbr' ? 'Gov.br' : 'Wizzy Sign'}
            </Badge>
          )}
          {isMissingPdf && (
            <Button variant="outline" size="sm" onClick={() => onRegenerate(doc)} disabled={isRegenerating} className="text-xs gap-1">
              <RefreshCw className={`h-3 w-3 ${isRegenerating ? 'animate-spin' : ''}`} />
              {isRegenerating ? 'Gerando...' : 'Regenerar PDF'}
            </Button>
          )}
          {doc.pdf_url && (
            <Button variant="ghost" size="icon" onClick={() => onDownload(doc)}>
              <Download className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={() => onEdit(doc.id)} title="Editar dados e assinatura">
            <Pencil className="h-4 w-4" />
          </Button>
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
  const regeneratePdf = useRegenerateDocumentPdf();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<DocumentFilter>('all');
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [editingDocId, setEditingDocId] = useState<string | null>(null);

  const handleDelete = (id: string) => {
    deleteDocument.mutate(id, {
      onSuccess: () => toast.success('Documento excluído'),
      onError: () => toast.error('Erro ao excluir documento'),
    });
  };

  const handleDownload = async (doc: any) => {
    if (!doc.pdf_url) return;
    // Bucket contact-files privatizável: assina a URL por org antes de baixar.
    const signedUrl = await resolveDocFileUrl({ table: 'generated_documents', id: doc.id, field: 'pdf_url', rawUrl: doc.pdf_url });
    if (!signedUrl) return;
    try {
      const response = await fetch(signedUrl);
      if (!response.ok) throw new Error('Falha ao baixar arquivo');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${doc.name || 'documento'}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      window.open(signedUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const toggleGroup = (group: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  const allItems = useMemo(() => {
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

    return [
      ...Array.from(groups.entries()).map(([groupKey, docs]) => ({ type: 'group' as const, groupKey, docs })),
      ...singles.map((doc) => ({ type: 'single' as const, doc })),
    ].filter((item) => {
      if (statusFilter === 'all') return true;
      const itemDocs = item.type === 'group' ? item.docs : [item.doc];
      return getDocumentItemStatus(itemDocs) === statusFilter;
    });
  }, [documents, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(allItems.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visibleItems = allItems.slice((safePage - 1) * pageSize, safePage * pageSize);

  const handlePageSizeChange = (nextPageSize: number) => {
    setPageSize(nextPageSize);
    setPage(1);
  };

  const handleFilterChange = (nextFilter: DocumentFilter) => {
    setStatusFilter(nextFilter);
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar documentos..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={(value) => handleFilterChange(value as DocumentFilter)}>
          <SelectTrigger className="w-full md:w-56">
            <SelectValue placeholder="Filtrar status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="signed">Todos assinados</SelectItem>
            <SelectItem value="partial">Assinado parcialmente</SelectItem>
            <SelectItem value="pending">Em assinatura</SelectItem>
            <SelectItem value="unsigned">Sem assinatura</SelectItem>
            <SelectItem value="failed">PDF falhou</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <Card key={i} className="p-4 animate-pulse">
              <div className="h-5 bg-muted rounded w-1/2" />
            </Card>
          ))}
        </div>
      ) : (allItems.length === 0) ? (
        <Card className="p-12 text-center">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Nenhum documento encontrado</h3>
          <p className="text-sm text-muted-foreground">
            Documentos gerados a partir de templates aparecerão aqui.
          </p>
        </Card>
      ) : (
        <>
        <div className="space-y-3">
          {/* Grouped documents (from packs) */}
          {visibleItems.map((item) => {
            if (item.type === 'single') {
              return (
                <DocCard
                  key={item.doc.id}
                  doc={item.doc}
                  onDelete={handleDelete}
                  onRegenerate={(d) => regeneratePdf.mutate(d)}
                  onDownload={handleDownload}
                  onEdit={setEditingDocId}
                  isRegenerating={regeneratePdf.isPending}
                />
              );
            }

            const { groupKey, docs } = item;
            const firstDoc = docs[0];
            const submittedBy = firstDoc?.submitted_by as SubmittedBy | null;
            const isCollapsed = !expandedGroups.has(groupKey);

            return (
              <Card key={groupKey} className="overflow-hidden">
                <div className="flex items-center">
                  <button
                    onClick={() => toggleGroup(groupKey)}
                    className="flex-1 p-4 flex items-center gap-3 hover:bg-muted/50 transition-colors text-left"
                  >
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <FolderOpen className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-sm truncate">
                          {docs[0]?.document_packs?.name || 'Pack'}
                        </h3>
                        <Badge variant="secondary" className="text-xs shrink-0">
                          {docs.length} doc{docs.length > 1 ? 's' : ''}
                        </Badge>
                      </div>
                      {submittedBy && (
                        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {submittedBy.name} • {submittedBy.phone}
                          {' • '}
                          {format(new Date(firstDoc.created_at), "dd MMM yyyy 'às' HH:mm", { locale: ptBR })}
                        </p>
                      )}
                    </div>
                    {isCollapsed ? (
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                  </button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mr-1 gap-1 text-xs shrink-0"
                    title="Baixar todos os documentos do grupo em ZIP"
                    onClick={async () => {
                      const downloadable = docs.filter((d: any) => d.pdf_url);
                      if (downloadable.length === 0) {
                        toast.error('Nenhum PDF disponível para download');
                        return;
                      }
                      try {
                        toast.info('Preparando ZIP...');
                        const zip = new JSZip();
                        // Assina todas as URLs (contact-files) por org num único batch.
                        const signedMap = await resolveDocFileUrls(
                          downloadable.map((d: any) => ({ table: 'generated_documents', id: d.id, field: 'pdf_url', rawUrl: d.pdf_url })),
                        );
                        await Promise.all(downloadable.map(async (d: any) => {
                          const signed = signedMap.get(`generated_documents:${d.id}:pdf_url`) || d.pdf_url;
                          if (!signed) return;
                          const r = await fetch(signed);
                          if (!r.ok) return;
                          const blob = await r.blob();
                          const safeName = (d.name || 'documento').replace(/[^\w\-. ]/g, '_');
                          zip.file(`${safeName}.pdf`, blob);
                        }));
                        const content = await zip.generateAsync({ type: 'blob' });
                        const url = URL.createObjectURL(content);
                        const a = document.createElement('a');
                        a.href = url;
                        const groupName = (docs[0]?.document_packs?.name || 'pack').replace(/[^\w\-. ]/g, '_');
                        a.download = `${groupName}.zip`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                        toast.success('ZIP gerado!');
                      } catch (e) {
                        toast.error('Erro ao gerar ZIP');
                      }
                    }}
                  >
                    <Archive className="h-3.5 w-3.5" /> ZIP
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="mr-2 text-destructive hover:text-destructive shrink-0">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir todos os documentos do grupo?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Isso excluirá {docs.length} documento(s) e suas assinaturas permanentemente.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => docs.forEach(d => handleDelete(d.id))}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Excluir grupo
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
                {!isCollapsed && (
                  <div className="border-t px-4 pb-3 pt-2 space-y-2">
                    {docs.map(doc => (
                      <DocCard key={doc.id} doc={doc} onDelete={handleDelete} onRegenerate={(d) => regeneratePdf.mutate(d)} onDownload={handleDownload} onEdit={setEditingDocId} isRegenerating={regeneratePdf.isPending} />
                    ))}
                  </div>
                )}
              </Card>
            );
          })}

        </div>
        <PaginationControls
          page={safePage}
          pageSize={pageSize}
          total={allItems.length}
          onPageChange={setPage}
          onPageSizeChange={handlePageSizeChange}
        />
        </>
      )}
      {editingDocId && (
        <EditFilledDataDialog
          open={!!editingDocId}
          onOpenChange={(open) => !open && setEditingDocId(null)}
          documentId={editingDocId}
        />
      )}
    </div>
  );
}
