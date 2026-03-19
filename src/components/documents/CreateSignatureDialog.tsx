import { useState } from 'react';
import { FileSignature, FileText } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateSignatureRequest } from '@/hooks/useDocumentSignatures';
import { GeneratedDocument } from '@/hooks/useGeneratedDocuments';

interface CreateSignatureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documents: GeneratedDocument[];
}

export function CreateSignatureDialog({ open, onOpenChange, documents }: CreateSignatureDialogProps) {
  const createSignature = useCreateSignatureRequest();
  const [selectedDocId, setSelectedDocId] = useState('');
  const [method, setMethod] = useState('govbr');
  const [signerName, setSignerName] = useState('');
  const [signerEmail, setSignerEmail] = useState('');
  const [signerPhone, setSignerPhone] = useState('');
  const [signerCpf, setSignerCpf] = useState('');

  const handleSubmit = () => {
    if (!selectedDocId || !method) return;
    createSignature.mutate({
      generated_document_id: selectedDocId,
      signing_method: method,
      signer_name: signerName || undefined,
      signer_email: signerEmail || undefined,
      signer_phone: signerPhone || undefined,
      signer_cpf: signerCpf || undefined,
    }, {
      onSuccess: () => {
        onOpenChange(false);
        resetForm();
      },
    });
  };

  const resetForm = () => {
    setSelectedDocId('');
    setMethod('govbr');
    setSignerName('');
    setSignerEmail('');
    setSignerPhone('');
    setSignerCpf('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSignature className="h-5 w-5 text-primary" />
            Solicitar Assinatura
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Documento</Label>
            <Select value={selectedDocId} onValueChange={setSelectedDocId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Selecionar documento..." />
              </SelectTrigger>
              <SelectContent>
                {documents.map(doc => (
                  <SelectItem key={doc.id} value={doc.id}>
                    <span className="flex items-center gap-2">
                      <FileText className="h-3 w-3" />
                      {doc.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Método de Assinatura</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="internal">
                  <span className="flex items-center gap-2">🔐 Assinatura Interna (OTP + Selfie)</span>
                </SelectItem>
                <SelectItem value="manual">
                  <span className="flex items-center gap-2">📝 Manual</span>
                </SelectItem>
                <SelectItem value="govbr">
                  <span className="flex items-center gap-2">🏛️ Gov.br</span>
                </SelectItem>
                <SelectItem value="zapsign">
                  <span className="flex items-center gap-2">✍️ ZapSign</span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="border-t pt-4 space-y-3">
            <p className="text-xs text-muted-foreground font-medium">Dados do signatário (opcional)</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Nome</Label>
                <Input value={signerName} onChange={e => setSignerName(e.target.value)} placeholder="Nome completo" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">CPF</Label>
                <Input value={signerCpf} onChange={e => setSignerCpf(e.target.value)} placeholder="000.000.000-00" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">E-mail</Label>
                <Input value={signerEmail} onChange={e => setSignerEmail(e.target.value)} placeholder="email@exemplo.com" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Telefone</Label>
                <Input value={signerPhone} onChange={e => setSignerPhone(e.target.value)} placeholder="(11) 99999-0000" className="mt-1" />
              </div>
            </div>
          </div>

          {method === 'govbr' && (
            <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-3">
              <p className="text-xs text-green-700 dark:text-green-300">
                🏛️ Será gerado um link público para assinatura via Gov.br. O signatário acessará a página, visualizará o documento e será direcionado ao portal de assinatura digital.
              </p>
            </div>
          )}

          {method === 'zapsign' && (
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
              <p className="text-xs text-blue-700 dark:text-blue-300">
                ✍️ A integração com ZapSign gerará um link de assinatura automático. Configure sua API key nas configurações para ativar.
              </p>
            </div>
          )}

          <Button onClick={handleSubmit} disabled={!selectedDocId || createSignature.isPending} className="w-full gap-2">
            <FileSignature className="h-4 w-4" />
            {createSignature.isPending ? 'Criando...' : 'Criar Solicitação'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
