import { useState } from 'react';
import { FileSignature, Search, Send, ExternalLink, CheckCircle2, Clock, Eye, Copy, FileText, Download, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useDocumentSignatures, useUpdateSignatureStatus } from '@/hooks/useDocumentSignatures';
import { useGeneratedDocuments } from '@/hooks/useGeneratedDocuments';
import { CreateSignatureDialog } from './CreateSignatureDialog';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from '@/hooks/use-toast';

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: any }> = {
  pending: { label: 'Pendente', variant: 'secondary', icon: Clock },
  sent: { label: 'Enviado', variant: 'outline', icon: Send },
  opened: { label: 'Visualizado', variant: 'outline', icon: Eye },
  signed: { label: 'Assinado', variant: 'default', icon: CheckCircle2 },
  rejected: { label: 'Rejeitado', variant: 'destructive', icon: null },
  expired: { label: 'Expirado', variant: 'destructive', icon: null },
};

const METHOD_MAP: Record<string, { label: string; color: string }> = {
  internal: { label: 'Interna (Avançada)', color: 'bg-purple-100 text-purple-700' },
  manual: { label: 'Manual', color: 'bg-slate-100 text-slate-700' },
  govbr: { label: 'Gov.br', color: 'bg-green-100 text-green-700' },
  zapsign: { label: 'ZapSign', color: 'bg-blue-100 text-blue-700' },
};

export function SignaturesList() {
  const { data: signatures, isLoading } = useDocumentSignatures();
  const { data: documents } = useGeneratedDocuments();
  const updateStatus = useUpdateSignatureStatus();
  const [search, setSearch] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const filtered = signatures?.filter(s => {
    const docName = s.generated_document?.name || '';
    const signerName = s.signer_name || '';
    const q = search.toLowerCase();
    return docName.toLowerCase().includes(q) || signerName.toLowerCase().includes(q);
  }) || [];

  const pendingCount = signatures?.filter(s => s.status === 'pending' || s.status === 'sent').length || 0;
  const signedCount = signatures?.filter(s => s.status === 'signed').length || 0;

  const copyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    toast({ title: 'Link copiado!' });
  };

  const availableDocuments = documents?.filter(d => d.pdf_url && d.status !== 'draft') || [];

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm">
          <Clock className="h-4 w-4 text-amber-500" />
          <span className="font-medium">{pendingCount}</span>
          <span className="text-muted-foreground">pendentes</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          <span className="font-medium">{signedCount}</span>
          <span className="text-muted-foreground">assinados</span>
        </div>
        <div className="ml-auto">
          <Button onClick={() => setShowCreateDialog(true)} size="sm" className="gap-2">
            <FileSignature className="h-4 w-4" /> Nova Assinatura
          </Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar assinaturas..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
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
          <FileSignature className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Nenhuma assinatura</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Solicite assinaturas para documentos gerados usando Gov.br ou ZapSign.
          </p>
          <Button onClick={() => setShowCreateDialog(true)} size="sm" className="gap-2">
            <FileSignature className="h-4 w-4" /> Solicitar Assinatura
          </Button>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(sig => {
            const status = STATUS_MAP[sig.status] || STATUS_MAP.pending;
            const method = METHOD_MAP[sig.signing_method] || METHOD_MAP.manual;
            const StatusIcon = status.icon;

            return (
              <Card key={sig.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <FileSignature className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-medium text-sm flex items-center gap-2">
                        {sig.generated_document?.name || 'Documento'}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${method.color}`}>
                          {method.label}
                        </span>
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {sig.signer_name && <span className="mr-2">{sig.signer_name}</span>}
                        {format(new Date(sig.created_at), "dd MMM yyyy 'às' HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={status.variant} className="gap-1">
                      {StatusIcon && <StatusIcon className="h-3 w-3" />}
                      {status.label}
                    </Badge>

                    {/* Actions based on method and status */}
                    {sig.signature_url && sig.status !== 'signed' && (
                      <Button variant="ghost" size="icon" onClick={() => copyLink(sig.signature_url!)} title="Copiar link">
                        <Copy className="h-4 w-4" />
                      </Button>
                    )}
                    {sig.signature_url && (
                      <Button variant="ghost" size="icon" asChild title="Abrir link">
                        <a href={sig.signature_url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                    {sig.signed_pdf_url && (
                      <Button variant="ghost" size="icon" asChild title="Baixar assinado">
                        <a href={sig.signed_pdf_url} target="_blank" rel="noopener noreferrer">
                          <Download className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                    {(sig.metadata as any)?.verification_code && (
                      <Button variant="ghost" size="icon" asChild title="Verificar autenticidade">
                        <a
                          href={`https://wizzybr.com/verificar/${(sig.metadata as any).verification_code}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ShieldCheck className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                    {sig.status === 'pending' && sig.signing_method === 'manual' && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs gap-1"
                        onClick={() => updateStatus.mutate({ id: sig.id, status: 'signed' })}
                      >
                        <CheckCircle2 className="h-3 w-3" /> Marcar assinado
                      </Button>
                    )}
                    {sig.status === 'pending' && sig.signing_method !== 'manual' && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs gap-1"
                        onClick={() => updateStatus.mutate({ id: sig.id, status: 'sent' })}
                      >
                        <Send className="h-3 w-3" /> Enviar
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <CreateSignatureDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        documents={availableDocuments}
      />
    </div>
  );
}
