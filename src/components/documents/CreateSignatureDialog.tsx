import { useState } from 'react';
import { FileSignature, FileText } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateSignatureRequest } from '@/hooks/useDocumentSignatures';
import { GeneratedDocument } from '@/hooks/useGeneratedDocuments';

interface CreateSignatureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documents: GeneratedDocument[];
  preSelectedDocId?: string;
}

export function CreateSignatureDialog({ open, onOpenChange, documents, preSelectedDocId }: CreateSignatureDialogProps) {
  const createSignature = useCreateSignatureRequest();
  const [selectedDocId, setSelectedDocId] = useState(preSelectedDocId || '');
  const [method, setMethod] = useState('internal');
  const [signerName, setSignerName] = useState('');
  const [signerEmail, setSignerEmail] = useState('');
  const [signerPhone, setSignerPhone] = useState('');
  const [signerCpf, setSignerCpf] = useState('');
  const [requireSelfie, setRequireSelfie] = useState(true);
  const [otpChannel, setOtpChannel] = useState<'email' | 'whatsapp'>('email');

  // Update selectedDocId when preSelectedDocId changes
  useState(() => {
    if (preSelectedDocId) setSelectedDocId(preSelectedDocId);
  });

  const handleSubmit = () => {
    if (!selectedDocId || !method) return;

    // Validate based on OTP channel
    if (method === 'internal') {
      if (otpChannel === 'email' && !signerEmail) {
        return;
      }
      if (otpChannel === 'whatsapp' && !signerPhone) {
        return;
      }
    }

    createSignature.mutate({
      generated_document_id: selectedDocId,
      signing_method: method,
      signer_name: signerName || undefined,
      signer_email: signerEmail || undefined,
      signer_phone: signerPhone || undefined,
      signer_cpf: signerCpf || undefined,
      require_selfie: requireSelfie,
      otp_channel: otpChannel,
    }, {
      onSuccess: () => {
        onOpenChange(false);
        resetForm();
      },
    });
  };

  const resetForm = () => {
    setSelectedDocId('');
    setMethod('internal');
    setSignerName('');
    setSignerEmail('');
    setSignerPhone('');
    setSignerCpf('');
    setRequireSelfie(true);
    setOtpChannel('email');
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
                  <span className="flex items-center gap-2">🔐 Assinatura Interna (Avançada)</span>
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

          {method === 'internal' && (
            <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
              <p className="text-xs font-medium text-muted-foreground">Opções da assinatura interna</p>
              
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm">Exigir selfie</Label>
                  <p className="text-[10px] text-muted-foreground">Captura de foto para comprovar identidade</p>
                </div>
                <Switch checked={requireSelfie} onCheckedChange={setRequireSelfie} />
              </div>

              <div>
                <Label className="text-sm">Enviar código de verificação por</Label>
                <Select value={otpChannel} onValueChange={(v) => setOtpChannel(v as 'email' | 'whatsapp')}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">
                      <span className="flex items-center gap-2">📧 E-mail</span>
                    </SelectItem>
                    <SelectItem value="whatsapp">
                      <span className="flex items-center gap-2">💬 WhatsApp</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div className="border-t pt-4 space-y-3">
            <p className="text-xs text-muted-foreground font-medium">Dados do signatário</p>
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
                <Label className="text-xs">
                  E-mail {method === 'internal' && otpChannel === 'email' && <span className="text-destructive">*</span>}
                </Label>
                <Input value={signerEmail} onChange={e => setSignerEmail(e.target.value)} placeholder="email@exemplo.com" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">
                  Telefone {method === 'internal' && otpChannel === 'whatsapp' && <span className="text-destructive">*</span>}
                </Label>
                <Input value={signerPhone} onChange={e => setSignerPhone(e.target.value)} placeholder="(11) 99999-0000" className="mt-1" />
              </div>
            </div>
          </div>

          {method === 'internal' && (
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
              <p className="text-xs text-primary/80">
                🔐 Assinatura Eletrônica Avançada conforme Lei 14.063/2020. O signatário receberá um link e passará por: 
                verificação OTP por {otpChannel === 'email' ? 'e-mail' : 'WhatsApp'}
                {requireSelfie ? ', registro de selfie' : ''}
                , assinatura manuscrita digital e hash SHA-256 do documento.
                {otpChannel === 'email' ? ' E-mail do signatário é obrigatório.' : ' Telefone do signatário é obrigatório.'}
              </p>
            </div>
          )}

          {method === 'govbr' && (
            <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-3">
              <p className="text-xs text-green-700 dark:text-green-300">
                🏛️ Será gerado um link público para assinatura via Gov.br.
              </p>
            </div>
          )}

          {method === 'zapsign' && (
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
              <p className="text-xs text-blue-700 dark:text-blue-300">
                ✍️ A integração com ZapSign gerará um link de assinatura automático.
              </p>
            </div>
          )}

          <Button 
            onClick={handleSubmit} 
            disabled={
              !selectedDocId || 
              createSignature.isPending ||
              (method === 'internal' && otpChannel === 'email' && !signerEmail) ||
              (method === 'internal' && otpChannel === 'whatsapp' && !signerPhone)
            } 
            className="w-full gap-2"
          >
            <FileSignature className="h-4 w-4" />
            {createSignature.isPending ? 'Criando...' : 'Criar Solicitação'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
