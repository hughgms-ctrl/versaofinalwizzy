import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Shield, Search, CheckCircle2, XCircle, Loader2, Download, FileText, User, Calendar, Globe, Smartphone, Camera, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type Result =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'not_found' }
  | { state: 'error'; message: string }
  | { state: 'found'; data: any };

export default function PublicVerificationPage() {
  const { codigo } = useParams<{ codigo: string }>();
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<Result>({ state: 'idle' });

  useEffect(() => {
    if (codigo) {
      setQuery(codigo);
      void verify(codigo);
    }
  }, [codigo]);

  const verify = async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    setResult({ state: 'loading' });
    try {
      const { data, error } = await supabase.functions.invoke('signature-verify-public', {
        body: { code: trimmed },
      });
      if (error) throw error;
      if (!data?.found) {
        setResult({ state: 'not_found' });
      } else {
        setResult({ state: 'found', data });
      }
    } catch (err: any) {
      setResult({ state: 'error', message: err?.message || 'Erro ao verificar' });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <Shield className="h-6 w-6 text-primary" />
          <div>
            <h1 className="font-semibold text-base">Validação de Documento</h1>
            <p className="text-xs text-muted-foreground">Wizzy — Certificação de Assinatura Eletrônica</p>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Search */}
        <Card className="p-6">
          <h2 className="font-medium text-sm mb-2">Verificar autenticidade</h2>
          <p className="text-xs text-muted-foreground mb-4">
            Cole o código de verificação (10 caracteres) ou o hash SHA-256 completo do documento.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void verify(query);
            }}
            className="flex gap-2"
          >
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ex: ABC123XYZ4 ou hash SHA-256..."
              className="font-mono text-sm"
            />
            <Button type="submit" disabled={!query.trim() || result.state === 'loading'} className="gap-2">
              {result.state === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Verificar
            </Button>
          </form>
        </Card>

        {/* States */}
        {result.state === 'loading' && (
          <Card className="p-12 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Verificando...</p>
          </Card>
        )}

        {result.state === 'not_found' && (
          <Card className="p-8 text-center border-destructive/30">
            <div className="h-14 w-14 mx-auto bg-destructive/10 rounded-full flex items-center justify-center mb-3">
              <XCircle className="h-8 w-8 text-destructive" />
            </div>
            <h3 className="font-semibold text-base mb-1">Documento não encontrado</h3>
            <p className="text-sm text-muted-foreground">
              Verifique o código ou hash informado e tente novamente.
            </p>
          </Card>
        )}

        {result.state === 'error' && (
          <Card className="p-6 border-destructive/30 text-center">
            <p className="text-sm text-destructive">{result.message}</p>
          </Card>
        )}

        {result.state === 'found' && (
          <div className="space-y-4">
            {/* Authenticity badge */}
            <Card className="p-6 border-green-500/30 bg-green-50 dark:bg-green-950/20">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 bg-green-500/15 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="h-7 w-7 text-green-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-base text-green-700 dark:text-green-400">Documento autêntico</h3>
                  <p className="text-xs text-muted-foreground">
                    Assinatura validada conforme {result.data.legal?.law_reference || 'Lei 14.063/2020'}
                  </p>
                </div>
                <Badge variant="default" className="ml-auto bg-green-600 hover:bg-green-700">
                  <Shield className="h-3 w-3 mr-1" /> Verificado
                </Badge>
              </div>
            </Card>

            {/* Document */}
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-medium text-sm">Documento</h3>
              </div>
              <div className="space-y-2 text-sm">
                <Row label="Nome" value={result.data.document.name} />
                <Row label="Código de verificação" value={result.data.verification_code} mono />
                <Row label="Hash SHA-256" value={result.data.document.hash} mono breakAll />
                <Row
                  label="Assinado em"
                  value={
                    result.data.document.signed_at
                      ? format(new Date(result.data.document.signed_at), "dd 'de' MMMM 'de' yyyy 'às' HH:mm:ss", { locale: ptBR })
                      : 'N/A'
                  }
                />
              </div>
              <div className="flex flex-wrap gap-2 mt-4">
                {result.data.document.signed_pdf_url && (
                  <Button size="sm" variant="outline" asChild>
                    <a href={result.data.document.signed_pdf_url} target="_blank" rel="noopener noreferrer">
                      <Download className="h-4 w-4 mr-2" /> Baixar documento assinado
                    </a>
                  </Button>
                )}
                {result.data.document.receipt_pdf_url && (
                  <Button size="sm" variant="outline" asChild>
                    <a href={result.data.document.receipt_pdf_url} target="_blank" rel="noopener noreferrer">
                      <Download className="h-4 w-4 mr-2" /> Baixar comprovante
                    </a>
                  </Button>
                )}
              </div>
            </Card>

            {/* Signer */}
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <User className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-medium text-sm">Signatário</h3>
              </div>
              <div className="space-y-2 text-sm">
                <Row label="Nome" value={result.data.signer.name} />
                <Row label="E-mail" value={result.data.signer.email_masked} />
                <Row label="Telefone" value={result.data.signer.phone_masked} />
              </div>
            </Card>

            {/* Authentication */}
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-medium text-sm">Pontos de autenticação</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <InfoItem icon={Calendar} label="Método" value={`OTP via ${result.data.authentication.otp_channel === 'whatsapp' ? 'WhatsApp' : 'E-mail'}`} />
                <InfoItem icon={Globe} label="IP" value={result.data.authentication.ip_masked} />
                <InfoItem icon={Smartphone} label="Dispositivo" value={`${result.data.authentication.browser || '?'} / ${result.data.authentication.os || '?'}`} />
                <InfoItem icon={Camera} label="Selfie" value={result.data.authentication.has_selfie ? 'Capturada' : 'Não'} />
                {result.data.authentication.has_geolocation && (
                  <InfoItem icon={MapPin} label="Geolocalização" value="Registrada" />
                )}
              </div>
            </Card>

            {/* Legal */}
            <Card className="p-5 bg-muted/30">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Este documento foi assinado eletronicamente conforme <strong>MP 2.200-2/2001 (art. 10, §2º)</strong> e
                <strong> Lei 14.063/2020</strong>. A assinatura eletrônica avançada possui validade jurídica entre as
                partes signatárias e perante terceiros. Para mais informações sobre a infraestrutura de chaves
                públicas brasileira, consulte o ITI (Instituto Nacional de Tecnologia da Informação).
              </p>
            </Card>
          </div>
        )}

        <p className="text-center text-[11px] text-muted-foreground pt-4">
          Wizzy — Plataforma de Assinatura Eletrônica
        </p>
      </div>
    </div>
  );
}

function Row({ label, value, mono, breakAll }: { label: string; value: string; mono?: boolean; breakAll?: boolean }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:gap-3">
      <span className="text-muted-foreground text-xs sm:w-40 shrink-0">{label}</span>
      <span className={`flex-1 ${mono ? 'font-mono text-xs' : ''} ${breakAll ? 'break-all' : ''}`}>{value}</span>
    </div>
  );
}

function InfoItem({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm truncate">{value}</p>
      </div>
    </div>
  );
}
