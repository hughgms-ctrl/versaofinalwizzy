import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FileSignature, Search, Send, CheckCircle2, Clock, Eye, Download, ShieldCheck, User, Calendar, RefreshCw, Loader2, Archive, ArchiveRestore, Trash2, MoreHorizontal, Link2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDocumentSignatures, useUpdateSignatureStatus, useArchiveSignature, useDeleteSignature } from '@/hooks/useDocumentSignatures';
import { useGeneratedDocuments } from '@/hooks/useGeneratedDocuments';
import { CreateSignatureDialog } from './CreateSignatureDialog';
import { SignerLinksList } from './SignerLinksList';
import { EditFilledDataDialog } from './EditFilledDataDialog';
import { Pencil } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import JSZip from 'jszip';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const STATUS_MAP: Record<string, { label: string; icon: any; pill: string; dot: string }> = {
  pending:  { label: 'Aguardando', icon: Clock,         pill: 'bg-amber-500/10 text-amber-400 border border-amber-500/30',  dot: 'bg-amber-400' },
  sent:     { label: 'Enviado',    icon: Send,          pill: 'bg-sky-500/10 text-sky-400 border border-sky-500/30',         dot: 'bg-sky-400' },
  opened:   { label: 'Visualizado',icon: Eye,           pill: 'bg-violet-500/10 text-violet-300 border border-violet-500/30',dot: 'bg-violet-400' },
  signed:   { label: 'Assinado',   icon: CheckCircle2,  pill: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30', dot: 'bg-emerald-400' },
  rejected: { label: 'Rejeitado',  icon: null,          pill: 'bg-rose-500/10 text-rose-400 border border-rose-500/30',      dot: 'bg-rose-400' },
  expired:  { label: 'Expirado',   icon: null,          pill: 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/30',      dot: 'bg-zinc-400' },
};

const METHOD_MAP: Record<string, { label: string; cls: string }> = {
  internal: { label: 'OTP + Selfie',     cls: 'bg-gradient-to-r from-pink-500/15 to-rose-500/15 text-pink-300 border border-pink-500/30' },
  manual:   { label: 'Manual',           cls: 'bg-zinc-500/10 text-zinc-300 border border-zinc-500/30' },
  govbr:    { label: 'Gov.br',           cls: 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30' },
  zapsign:  { label: 'Wizzy Sign',       cls: 'bg-sky-500/10 text-sky-300 border border-sky-500/30' },
};

const PAGE_SIZE_OPTIONS = [10, 50, 100, 500];
type SignatureFilter = 'all' | 'signed' | 'partial' | 'pending' | 'rejected' | 'expired';

function getSigningSummary(signatures: any[]) {
  const signerBuckets = new Map<string, any[]>();
  for (const sig of signatures) {
    const key = sig.signer_email || sig.signer_phone || sig.signer_name || sig.id;
    const bucket = signerBuckets.get(key) || [];
    bucket.push(sig);
    signerBuckets.set(key, bucket);
  }

  const totalSigners = signerBuckets.size || signatures.length;
  const signedSigners = Array.from(signerBuckets.values()).filter(items => items.some(s => s.status === 'signed')).length;
  const hasRejected = signatures.some(sig => sig.status === 'rejected');
  const hasExpired = signatures.some(sig => sig.status === 'expired');

  return { totalSigners, signedSigners, hasRejected, hasExpired };
}

function getSignatureGroupStatus(signatures: any[]): SignatureFilter {
  const { totalSigners, signedSigners, hasRejected, hasExpired } = getSigningSummary(signatures);
  if (hasRejected) return 'rejected';
  if (hasExpired) return 'expired';
  if (signedSigners === totalSigners && totalSigners > 0) return 'signed';
  if (signedSigners > 0) return 'partial';
  return 'pending';
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

export function SignaturesList() {
  const [showArchived, setShowArchived] = useState(false);
  const { data: signatures, isLoading } = useDocumentSignatures(showArchived);
  const { data: documents } = useGeneratedDocuments();
  const updateStatus = useUpdateSignatureStatus();
  const archiveMut = useArchiveSignature();
  const deleteMut = useDeleteSignature();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<SignatureFilter>('all');
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState<{ ids: string[]; label: string } | null>(null);
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);

  const regenerateReceipt = async (signatureId: string) => {
    setRegeneratingId(signatureId);
    try {
      const { data, error } = await supabase.functions.invoke('signature-receipt-regenerate', {
        body: { signatureId },
      });
      if (error) throw error;
      if (data?.receiptUrl) {
        toast({ title: 'Recibo regerado', description: 'Abrindo nova versão...' });
        window.open(data.receiptUrl + '?t=' + Date.now(), '_blank');
      } else {
        toast({ title: 'Recibo regerado' });
      }
    } catch (e: any) {
      toast({ title: 'Erro ao regerar recibo', description: e.message, variant: 'destructive' });
    } finally {
      setRegeneratingId(null);
    }
  };

  const deleteSignatureGroup = async () => {
    if (!confirmDeleteGroup) return;
    try {
      const { error } = await (supabase as any)
        .from('document_signatures')
        .delete()
        .in('id', confirmDeleteGroup.ids);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['document-signatures'] });
      toast({ title: 'Assinaturas excluídas' });
      if (selectedGroupKey) setSelectedGroupKey(null);
    } catch (e: any) {
      toast({ title: 'Erro ao excluir', description: e.message, variant: 'destructive' });
    } finally {
      setConfirmDeleteGroup(null);
    }
  };

  const filtered = signatures?.filter(s => {
    const docName = s.generated_document?.name || '';
    const signerName = s.signer_name || '';
    const q = search.toLowerCase();
    return docName.toLowerCase().includes(q) || signerName.toLowerCase().includes(q);
  }) || [];

  // Group signatures by pack submission when available, otherwise by document.
  // Packs generate several documents at once, but should appear as one signing job.
  const grouped = useMemo(() => {
    const map = new Map<string, {
      key: string;
      docId: string;
      docIds: string[];
      docName: string;
      documents: Array<{ id: string; name: string; originalUrl: string | null; signedUrl: string | null }>;
      fillerName: string | null;
      signedPdfUrl: string | null;
      signedPdfUrls: string[];
      packId: string | null;
      submissionGroup: string | null;
      createdAt: string;
      signatures: typeof filtered;
    }>();

    for (const sig of filtered) {
      const docId = (sig as any).generated_document_id;
      if (!docId) continue;
      const submittedBy = (sig as any).generated_document?.submitted_by;
      const fillerName = submittedBy?.name || null;
      const docSignedPdfUrl = (sig as any).generated_document?.signed_pdf_url || sig.signed_pdf_url || null;
      const packId = (sig as any).generated_document?.pack_id || null;
      const submissionGroup = (sig as any).generated_document?.submission_group || null;
      const groupKey = packId && submissionGroup ? `pack:${packId}:${submissionGroup}` : `doc:${docId}`;
      const rawDocName = sig.generated_document?.name || 'Documento';
      const docOriginalPdfUrl = sig.generated_document?.pdf_url || null;
      const displayName = packId && submissionGroup ? rawDocName.split(' - ')[0] || rawDocName : rawDocName;
      const existing = map.get(groupKey);

      if (existing) {
        existing.signatures.push(sig);
        if (!existing.docIds.includes(docId)) {
          existing.docIds.push(docId);
          existing.documents.push({ id: docId, name: rawDocName, originalUrl: docOriginalPdfUrl, signedUrl: docSignedPdfUrl });
        }
        if (!existing.signedPdfUrl && docSignedPdfUrl) existing.signedPdfUrl = docSignedPdfUrl;
        if (docSignedPdfUrl && !existing.signedPdfUrls.includes(docSignedPdfUrl)) existing.signedPdfUrls.push(docSignedPdfUrl);
        if (!existing.fillerName && fillerName) existing.fillerName = fillerName;
        if (sig.created_at < existing.createdAt) existing.createdAt = sig.created_at;
      } else {
        map.set(groupKey, {
          key: groupKey,
          docId,
          docIds: [docId],
          docName: displayName,
          documents: [{ id: docId, name: rawDocName, originalUrl: docOriginalPdfUrl, signedUrl: docSignedPdfUrl }],
          fillerName,
          signedPdfUrl: docSignedPdfUrl,
          signedPdfUrls: docSignedPdfUrl ? [docSignedPdfUrl] : [],
          packId,
          submissionGroup,
          createdAt: sig.created_at,
          signatures: [sig],
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [filtered]);

  const pendingCount = signatures?.filter(s => s.status === 'pending' || s.status === 'sent' || s.status === 'opened').length || 0;
  const signedCount = signatures?.filter(s => s.status === 'signed').length || 0;
  const totalCount = signatures?.length || 0;
  const filteredGroups = grouped.filter(group => statusFilter === 'all' || getSignatureGroupStatus(group.signatures) === statusFilter);
  const totalPages = Math.max(1, Math.ceil(filteredGroups.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visibleGroups = filteredGroups.slice((safePage - 1) * pageSize, safePage * pageSize);

  const handlePageSizeChange = (nextPageSize: number) => {
    setPageSize(nextPageSize);
    setPage(1);
  };

  const handleFilterChange = (nextFilter: SignatureFilter) => {
    setStatusFilter(nextFilter);
    setPage(1);
  };

  const availableDocuments = documents?.filter(d => d.pdf_url && d.status !== 'draft') || [];
  const selectedGroup = selectedGroupKey ? grouped.find(group => group.key === selectedGroupKey) : null;

  if (selectedGroup) {
    const docSignatures = selectedGroup.signatures;
    const signerBuckets = new Map<string, typeof docSignatures>();
    for (const sig of docSignatures) {
      const key = sig.signer_email || sig.signer_phone || sig.signer_name || sig.id;
      const bucket = signerBuckets.get(key) || [];
      bucket.push(sig);
      signerBuckets.set(key, bucket);
    }
    const totalSigners = signerBuckets.size || docSignatures.length;
    const signedSigners = Array.from(signerBuckets.values()).filter(items => items.some(s => s.status === 'signed')).length;
    const allSigned = signedSigners === totalSigners;
    const firstMethod = METHOD_MAP[docSignatures[0].signing_method] || METHOD_MAP.manual;
    const verificationCode = (docSignatures.find(s => (s.metadata as any)?.verification_code)?.metadata as any)?.verification_code;
    const selectedPackGroups = selectedGroup.packId && selectedGroup.submissionGroup
      ? grouped.filter(group => group.packId === selectedGroup.packId && group.submissionGroup === selectedGroup.submissionGroup)
      : [selectedGroup];
    const downloadablePackGroups = selectedGroup.signedPdfUrls.map((url, index) => ({
      docId: `${selectedGroup.docId}-${index}`,
      docName: `${selectedGroup.docName}-${index + 1}`,
      signedPdfUrl: url,
    }));
    const detailRows = Array.from(signerBuckets.entries()).map(([key, items]) => {
      const signed = items.some(s => s.status === 'signed');
      const primary = items.find(s => s.status === 'signed') || items[0];
      const waitingCount = items.filter(s => s.status !== 'signed').length;
      return { key, items, primary, signed, waitingCount };
    });

    const downloadPackZip = async () => {
      if (downloadablePackGroups.length === 0) {
        toast({ title: 'Nenhum PDF assinado disponível', variant: 'destructive' });
        return;
      }
      try {
        const zip = new JSZip();
        for (const group of downloadablePackGroups) {
          const res = await fetch(group.signedPdfUrl!);
          const blob = await res.blob();
          const safeName = group.docName.replace(/[\\/:*?"<>|]+/g, '-').slice(0, 120) || group.docId;
          zip.file(`${safeName}.pdf`, blob);
        }
        const content = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${(selectedGroup.fillerName || selectedGroup.docName || 'documentos-assinados').replace(/[\\/:*?"<>|]+/g, '-')}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1500);
      } catch (e: any) {
        toast({ title: 'Erro ao gerar ZIP', description: e.message || 'Tente novamente.', variant: 'destructive' });
      }
    };

    return (
      <div className="space-y-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setSelectedGroupKey(null)} className="shrink-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-lg font-semibold">
                  {selectedGroup.docName}
                  {selectedGroup.fillerName && (
                    <span className="ml-1 font-normal text-muted-foreground">— {selectedGroup.fillerName}</span>
                  )}
                </h2>
                <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium', firstMethod.cls)}>{firstMethod.label}</span>
                <Badge variant="secondary" className="text-[10px]">{signedSigners}/{totalSigners} assinado{totalSigners > 1 ? 's' : ''}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">Links e status dos signatários deste documento.</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', allSigned ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/10 text-amber-400 border border-amber-500/30')}>
              {allSigned ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
              {allSigned ? 'Concluído' : 'Em andamento'}
            </span>
            {signedSigners === 0 && (
              <Button variant="outline" size="sm" className="gap-1" onClick={() => setEditingDocId(selectedGroup.docId)}>
                <Pencil className="h-3.5 w-3.5" /> Editar dados
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1">
                  <Download className="h-3.5 w-3.5" /> Baixar PDF
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                {selectedGroup.documents.map((doc, index) => (
                  <div key={doc.id}>
                    {index > 0 && <DropdownMenuSeparator />}
                    <div className="px-2 py-1.5 text-[11px] font-medium text-muted-foreground truncate">{doc.name}</div>
                    {doc.originalUrl && (
                      <DropdownMenuItem asChild>
                        <a href={doc.originalUrl} target="_blank" rel="noopener noreferrer">
                          <Download className="h-3.5 w-3.5 mr-2" /> Original
                        </a>
                      </DropdownMenuItem>
                    )}
                    {doc.signedUrl ? (
                      <DropdownMenuItem asChild>
                        <a href={doc.signedUrl} target="_blank" rel="noopener noreferrer">
                          <ShieldCheck className="h-3.5 w-3.5 mr-2" /> Assinado
                        </a>
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem disabled>
                        <ShieldCheck className="h-3.5 w-3.5 mr-2" /> Assinado indisponivel
                      </DropdownMenuItem>
                    )}
                  </div>
                ))}
                {downloadablePackGroups.length > 1 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={downloadPackZip}>
                      <Download className="h-3.5 w-3.5 mr-2" />
                      Baixar assinados em ZIP
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            {signedSigners > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={() => regenerateReceipt(docSignatures.find(s => s.status === 'signed')!.id)}
                disabled={regeneratingId !== null}
              >
                {regeneratingId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Regerar PDF
              </Button>
            )}
            {verificationCode && (
              <Button variant="outline" size="sm" className="gap-1" asChild>
                <a href={`https://wizzybr.com/verificar/${verificationCode}`} target="_blank" rel="noopener noreferrer">
                  <ShieldCheck className="h-3.5 w-3.5" /> Verificar
                </a>
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setConfirmDeleteGroup({ ids: docSignatures.map(sig => sig.id), label: selectedGroup.docName })}
              title="Excluir assinaturas"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <Card className="p-4">
          <SignerLinksList
            documentIds={selectedGroup.docIds}
            title="Links dos signatários"
            description="Copie ou reenvie o link de cada signatário a qualquer momento."
          />
        </Card>

        <Card className="p-4 space-y-2">
          <h3 className="text-sm font-semibold">Status detalhado</h3>
          {detailRows.map(row => {
            const sig = row.primary;
            const status = row.signed ? STATUS_MAP.signed : (STATUS_MAP[sig.status] || STATUS_MAP.pending);
            const StatusIcon = status.icon;
            return (
              <div key={row.key} className="flex items-center justify-between gap-2 rounded border border-border bg-muted/30 px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs truncate">{sig.signer_name || 'Sem nome'}</span>
                  {sig.signer_email && <span className="text-[10px] text-muted-foreground truncate">· {sig.signer_email}</span>}
                  {row.items.length > 1 && <Badge variant="outline" className="text-[10px]">{row.items.length} documentos</Badge>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium', status.pill)}>
                    {StatusIcon && <StatusIcon className="h-2.5 w-2.5" />}
                    {status.label}
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-6 w-6">
                        <MoreHorizontal className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      {sig.status === 'pending' && sig.signing_method === 'manual' && (
                        <DropdownMenuItem onClick={() => updateStatus.mutate({ id: sig.id, status: 'signed' })}>
                          <CheckCircle2 className="h-3.5 w-3.5 mr-2" /> Marcar assinado
                        </DropdownMenuItem>
                      )}
                      {(sig as any).archived_at ? (
                        <DropdownMenuItem onClick={() => archiveMut.mutate({ id: sig.id, archive: false })}>
                          <ArchiveRestore className="h-3.5 w-3.5 mr-2" /> Restaurar
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onClick={() => archiveMut.mutate({ id: sig.id, archive: true })}>
                          <Archive className="h-3.5 w-3.5 mr-2" /> Arquivar
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive" onClick={() => setConfirmDeleteId(sig.id)}>
                        <Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
        </Card>

        <AlertDialog open={!!confirmDeleteId} onOpenChange={(o) => !o && setConfirmDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir assinatura permanentemente?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação não pode ser desfeita. Todas as evidências (selfie, IP, geolocalização, recibo) também serão removidas.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  if (confirmDeleteId) deleteMut.mutate(confirmDeleteId);
                  setConfirmDeleteId(null);
                }}
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={!!confirmDeleteGroup} onOpenChange={(o) => !o && setConfirmDeleteGroup(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir este envio?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação remove os registros de assinatura deste envio. Os documentos gerados continuam disponíveis na aba de documentos.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={deleteSignatureGroup}
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {editingDocId && (
          <EditFilledDataDialog
            open={!!editingDocId}
            onOpenChange={(o) => !o && setEditingDocId(null)}
            documentId={editingDocId}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Hero header with gradient — landing-style */}
      <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 p-5">
        <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-pink-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-violet-500/20 blur-3xl" />

        <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-pink-300/80">
              <ShieldCheck className="h-3.5 w-3.5" />
              ASSINATURA ELETRÔNICA AVANÇADA
            </div>
            <h2 className="mt-1 text-xl font-bold text-white">Assinaturas</h2>
            <p className="text-sm text-zinc-400">
              Acompanhe documentos enviados, assinados e auditoria completa.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowArchived(v => !v)}
              className="gap-2 border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10"
            >
              {showArchived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
              {showArchived ? 'Ver ativas' : 'Ver arquivadas'}
            </Button>
            <Button
              onClick={() => setShowCreateDialog(true)}
              size="sm"
              className="gap-2 bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-lg shadow-pink-500/20 hover:from-pink-600 hover:to-rose-600"
            >
              <FileSignature className="h-4 w-4" /> Nova assinatura
            </Button>
          </div>
        </div>

        {/* Stat chips */}
        <div className="relative mt-5 grid grid-cols-3 gap-3">
          <StatChip label="Total"      value={totalCount}    accent="from-violet-500/20 to-fuchsia-500/20" />
          <StatChip label="Pendentes"  value={pendingCount}  accent="from-amber-500/20 to-orange-500/20" />
          <StatChip label="Assinados"  value={signedCount}   accent="from-emerald-500/20 to-teal-500/20" />
        </div>
      </div>

      {/* Search */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <div className="relative max-w-md flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por documento ou signatário..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="pl-9"
        />
        </div>
        <Select value={statusFilter} onValueChange={(value) => handleFilterChange(value as SignatureFilter)}>
          <SelectTrigger className="w-full md:w-56">
            <SelectValue placeholder="Filtrar status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="signed">Todos assinados</SelectItem>
            <SelectItem value="partial">Assinado parcialmente</SelectItem>
            <SelectItem value="pending">Em assinatura</SelectItem>
            <SelectItem value="rejected">Rejeitados</SelectItem>
            <SelectItem value="expired">Expirados</SelectItem>
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
      ) : filteredGroups.length === 0 ? (
        <Card className="p-12 text-center">
          <FileSignature className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Nenhuma assinatura</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Crie sua primeira solicitação de assinatura.
          </p>
          <Button onClick={() => setShowCreateDialog(true)} size="sm" className="gap-2">
            <FileSignature className="h-4 w-4" /> Solicitar Assinatura
          </Button>
        </Card>
      ) : (
        <>
        <div className="space-y-2.5">
          {visibleGroups.map(group => {
            const docSignatures = group.signatures;
            const signerBuckets = new Map<string, typeof docSignatures>();
            for (const sig of docSignatures) {
              const key = sig.signer_email || sig.signer_phone || sig.signer_name || sig.id;
              const bucket = signerBuckets.get(key) || [];
              bucket.push(sig);
              signerBuckets.set(key, bucket);
            }
            const totalSigners = signerBuckets.size || docSignatures.length;
            const signedSigners = Array.from(signerBuckets.values()).filter(items => items.some(s => s.status === 'signed')).length;
            const allSigned = signedSigners === totalSigners;
            const firstMethod = METHOD_MAP[docSignatures[0].signing_method] || METHOD_MAP.manual;
            const verificationCode = (docSignatures.find(s => (s.metadata as any)?.verification_code)?.metadata as any)?.verification_code;

            return (
              <Card key={group.key} className="group relative overflow-hidden border-white/5 bg-gradient-to-br from-zinc-950/60 via-zinc-900/40 to-zinc-950/60">
                <span className={cn('absolute inset-y-0 left-0 w-1', allSigned ? 'bg-emerald-400' : 'bg-amber-400')} />

                <div className="flex flex-col gap-3 pl-3 p-4 md:flex-row md:items-center md:justify-between">
                  <button
                    type="button"
                    onClick={() => setSelectedGroupKey(group.key)}
                    className="flex min-w-0 items-center gap-3 text-left flex-1"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-pink-500/20 to-violet-500/20 ring-1 ring-pink-500/20">
                      <FileSignature className="h-5 w-5 text-pink-300" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="truncate text-sm font-semibold text-foreground">
                          {group.docName}
                          {group.fillerName && (
                            <span className="ml-1 font-normal text-muted-foreground">— {group.fillerName}</span>
                          )}
                        </h3>
                        {group.docIds.length > 1 && (
                          <Badge variant="outline" className="text-[10px]">{group.docIds.length} documentos</Badge>
                        )}
                        <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium', firstMethod.cls)}>{firstMethod.label}</span>
                        <Badge variant="secondary" className="text-[10px]">{signedSigners}/{totalSigners} assinado{totalSigners > 1 ? 's' : ''}</Badge>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(group.createdAt), "dd MMM yyyy 'às' HH:mm", { locale: ptBR })}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Link2 className="h-3 w-3" /> Clique para ver/copiar links
                        </span>
                      </div>
                    </div>
                  </button>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', allSigned ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/10 text-amber-400 border border-amber-500/30')}>
                      {allSigned ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                      {allSigned ? 'Concluído' : 'Em andamento'}
                    </span>

                    {signedSigners === 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs gap-1"
                        onClick={() => setEditingDocId(group.docId)}
                        title="Editar dados antes da assinatura"
                      >
                        <Pencil className="h-3 w-3" /> Editar dados
                      </Button>
                    )}

                    {group.signedPdfUrl && (
                      <Button variant="ghost" size="icon" className="h-8 w-8" asChild title="Baixar PDF assinado consolidado">
                        <a href={group.signedPdfUrl} target="_blank" rel="noopener noreferrer">
                          <Download className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                    {signedSigners > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs gap-1"
                        onClick={() => regenerateReceipt(docSignatures.find(s => s.status === 'signed')!.id)}
                        disabled={regeneratingId !== null}
                        title="Regera o PDF consolidado com todas as assinaturas"
                      >
                        {regeneratingId ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                        Regerar PDF
                      </Button>
                    )}
                    {verificationCode && (
                      <Button variant="ghost" size="icon" className="h-8 w-8" asChild title="Verificar autenticidade">
                        <a href={`https://wizzybr.com/verificar/${verificationCode}`} target="_blank" rel="noopener noreferrer">
                          <ShieldCheck className="h-4 w-4 text-emerald-400" />
                        </a>
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setConfirmDeleteGroup({ ids: docSignatures.map(sig => sig.id), label: group.docName })}
                      title="Excluir envio"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
        <PaginationControls
          page={safePage}
          pageSize={pageSize}
          total={filteredGroups.length}
          onPageChange={setPage}
          onPageSizeChange={handlePageSizeChange}
        />
        </>
      )}

      <CreateSignatureDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        documents={availableDocuments}
      />

      {editingDocId && (
        <EditFilledDataDialog
          open={!!editingDocId}
          onOpenChange={(o) => !o && setEditingDocId(null)}
          documentId={editingDocId}
        />
      )}

      <AlertDialog open={!!confirmDeleteId} onOpenChange={(o) => !o && setConfirmDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir assinatura permanentemente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Todas as evidências (selfie, IP, geolocalização, recibo) também serão removidas.
              <br /><br />
              <strong>Sugestão:</strong> se forem testes que você quer apenas esconder, prefira <em>Arquivar</em> — o histórico continua disponível para auditoria.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (confirmDeleteId) deleteMut.mutate(confirmDeleteId);
                setConfirmDeleteId(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmDeleteGroup} onOpenChange={(o) => !o && setConfirmDeleteGroup(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir este envio?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação remove os registros de assinatura deste envio. Os documentos gerados continuam disponíveis na aba de documentos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={deleteSignatureGroup}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatChip({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className={cn('rounded-xl border border-white/5 bg-gradient-to-br p-3 backdrop-blur', accent)}>
      <div className="text-2xl font-bold text-white tabular-nums">{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-zinc-300/80">{label}</div>
    </div>
  );
}
