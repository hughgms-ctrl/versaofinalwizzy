import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Copy, Check, Mail, MessageCircle, Loader2, User, Send } from 'lucide-react';
import { toast } from 'sonner';
import { getPublicAppOrigin } from '@/lib/publicOrigin';

interface SignerLinksListProps {
  documentIds: string[];
  /** Optional explanatory header */
  title?: string;
  description?: string;
}

interface SignerRow {
  id: string;
  signer_name: string;
  signer_email: string | null;
  signer_phone: string | null;
  signer_role: string | null;
  signature_token: string;
  status: string;
  sent_at: string | null;
  signed_at: string | null;
  generated_document_id: string;
}

export function SignerLinksList({
  documentIds,
  title = 'Links de assinatura',
  description = 'Cada signatário possui um link único. Copie e envie, ou dispare automaticamente.',
}: SignerLinksListProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);

  const { data: signers, isLoading, refetch } = useQuery({
    queryKey: ['signer-links', documentIds],
    queryFn: async () => {
      if (documentIds.length === 0) return [];
      const { data, error } = await (supabase as any)
        .from('document_signers')
        .select('*')
        .in('generated_document_id', documentIds)
        .order('order', { ascending: true });
      if (error) throw error;
      return data as SignerRow[];
    },
    enabled: documentIds.length > 0,
  });

  const buildLink = (token: string) => `${getPublicAppOrigin()}/sign/${token}`;

  const copyLink = async (signer: SignerRow) => {
    await navigator.clipboard.writeText(buildLink(signer.signature_token));
    setCopiedId(signer.id);
    setTimeout(() => setCopiedId(null), 2000);
    toast.success('Link copiado!');
  };

  const openWhatsApp = (signer: SignerRow) => {
    if (!signer.signer_phone) {
      toast.error('Signatário sem telefone cadastrado');
      return;
    }
    const phone = signer.signer_phone.replace(/\D/g, '');
    const msg = encodeURIComponent(
      `Olá ${signer.signer_name}, segue o link para assinar o documento:\n\n${buildLink(signer.signature_token)}`
    );
    window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
  };

  const sendByEmail = async (signer: SignerRow) => {
    if (!signer.signer_email) {
      toast.error('Signatário sem e-mail cadastrado');
      return;
    }
    setSendingId(signer.id);
    try {
      const { data, error } = await supabase.functions.invoke('send-signer-link', {
        body: {
          signer_id: signer.id,
          channel: 'email',
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Falha ao enviar');
      toast.success(`E-mail enviado para ${signer.signer_email}`);
      refetch();
    } catch (e: any) {
      toast.error('Erro ao enviar: ' + (e.message || ''));
    } finally {
      setSendingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!signers || signers.length === 0) {
    return (
      <Card className="p-6 text-center border-dashed">
        <User className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Nenhum signatário cadastrado</p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {(title || description) && (
        <div>
          {title && <h4 className="text-sm font-semibold">{title}</h4>}
          {description && <p className="text-[11px] text-muted-foreground">{description}</p>}
        </div>
      )}

      {signers.map((signer, idx) => {
        const link = buildLink(signer.signature_token);
        const isSigned = signer.status === 'signed';
        return (
          <Card key={signer.id} className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold shrink-0">
                  {idx + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">
                    {signer.signer_name || 'Sem nome'}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                    <Badge variant="outline" className="text-[10px]">
                      {signer.signer_role || 'Assinar'}
                    </Badge>
                    {isSigned ? (
                      <Badge className="text-[10px] bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/10">
                        ✓ Assinado
                      </Badge>
                    ) : signer.sent_at ? (
                      <Badge className="text-[10px] bg-blue-500/10 text-blue-600 hover:bg-blue-500/10">
                        Enviado
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">
                        Pendente
                      </Badge>
                    )}
                    {signer.signer_email && (
                      <span className="text-[10px] text-muted-foreground truncate">
                        {signer.signer_email}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Input
                value={link}
                readOnly
                className="font-mono text-[11px] h-9"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 gap-1.5"
                onClick={() => copyLink(signer)}
              >
                {copiedId === signer.id ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {copiedId === signer.id ? 'Copiado' : 'Copiar'}
              </Button>
            </div>

            {!isSigned && (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => openWhatsApp(signer)}
                  disabled={!signer.signer_phone}
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  WhatsApp
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => sendByEmail(signer)}
                  disabled={!signer.signer_email || sendingId === signer.id}
                >
                  {sendingId === signer.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Mail className="h-3.5 w-3.5" />
                  )}
                  Enviar e-mail
                </Button>
                {signer.signer_phone && signer.signer_email && (
                  <Button
                    type="button"
                    size="sm"
                    className="gap-1.5"
                    onClick={async () => {
                      await sendByEmail(signer);
                      openWhatsApp(signer);
                    }}
                  >
                    <Send className="h-3.5 w-3.5" />
                    Enviar todos
                  </Button>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
