import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { FileSignature, CheckCircle2, FileText, ExternalLink, Loader2, ShieldCheck, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface SignatureData {
  id: string;
  signer_name: string | null;
  signing_method: string;
  status: string;
  generated_document: {
    id: string;
    name: string;
    pdf_url: string | null;
  };
}

export default function SignaturePage() {
  const { documentId } = useParams();
  const [loading, setLoading] = useState(true);
  const [signature, setSignature] = useState<SignatureData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'view' | 'signing' | 'done'>('view');

  useEffect(() => {
    loadSignature();
  }, [documentId]);

  const loadSignature = async () => {
    try {
      const { data, error: fetchError } = await (supabase as any)
        .from('document_signatures')
        .select('id, signer_name, signing_method, status, generated_document:generated_documents(id, name, pdf_url)')
        .eq('generated_document_id', documentId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fetchError) throw fetchError;
      if (!data) {
        setError('Solicitação de assinatura não encontrada.');
        setLoading(false);
        return;
      }

      if (data.status === 'signed') {
        setStep('done');
      }

      setSignature(data);
    } catch (e: any) {
      setError(e.message || 'Erro ao carregar dados.');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkSigned = async () => {
    if (!signature) return;
    setStep('signing');

    try {
      await (supabase as any)
        .from('document_signatures')
        .update({ status: 'signed', signed_at: new Date().toISOString() })
        .eq('id', signature.id);

      await (supabase as any)
        .from('generated_documents')
        .update({ signing_status: 'signed' })
        .eq('id', signature.generated_document.id);

      setStep('done');
    } catch {
      setStep('view');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !signature) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 text-center">
          <AlertCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
          <h2 className="text-lg font-semibold mb-2">Erro</h2>
          <p className="text-sm text-muted-foreground">{error || 'Documento não encontrado.'}</p>
        </Card>
      </div>
    );
  }

  if (step === 'done') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-50 to-background dark:from-green-950/20 dark:to-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 text-center">
          <CheckCircle2 className="h-16 w-16 mx-auto text-green-500 mb-4" />
          <h2 className="text-xl font-semibold mb-2">Documento Assinado!</h2>
          <p className="text-sm text-muted-foreground mb-4">
            A assinatura de "{signature.generated_document.name}" foi registrada com sucesso.
          </p>
          <Badge variant="default" className="gap-1">
            <ShieldCheck className="h-3 w-3" /> Assinatura Digital Válida
          </Badge>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted">
      {/* Header */}
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileSignature className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="font-semibold text-sm">Assinatura Digital</h1>
              <p className="text-xs text-muted-foreground">
                {signature.signing_method === 'govbr' ? 'Via Gov.br' : 'ZapSign'}
              </p>
            </div>
          </div>
          <Badge variant="secondary">
            {signature.signer_name || 'Signatário'}
          </Badge>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Document info */}
        <Card className="p-6">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <FileText className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1">
              <h2 className="font-semibold text-lg">{signature.generated_document.name}</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Revise o documento abaixo antes de prosseguir com a assinatura.
              </p>
            </div>
          </div>

          {signature.generated_document.pdf_url && (
            <div className="mt-4">
              <iframe
                src={signature.generated_document.pdf_url}
                className="w-full h-[500px] border rounded-lg"
                title="Documento para assinatura"
              />
              <Button variant="outline" className="mt-3 gap-2" asChild>
                <a href={signature.generated_document.pdf_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" /> Abrir em nova aba
                </a>
              </Button>
            </div>
          )}
        </Card>

        {/* Gov.br signing section */}
        {signature.signing_method === 'govbr' && (
          <Card className="p-6 border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20">
            <div className="flex items-center gap-3 mb-4">
              <ShieldCheck className="h-6 w-6 text-green-600" />
              <h3 className="font-semibold text-green-800 dark:text-green-300">Assinatura Digital Gov.br</h3>
            </div>

            <div className="space-y-4">
              <div className="text-sm text-green-700 dark:text-green-300 space-y-2">
                <p><strong>Passo 1:</strong> Revise o documento acima.</p>
                <p><strong>Passo 2:</strong> Acesse o portal de assinatura do Gov.br clicando no botão abaixo.</p>
                <p><strong>Passo 3:</strong> Faça login com sua conta Gov.br e siga as instruções.</p>
                <p><strong>Passo 4:</strong> Após assinar, clique em "Confirmar Assinatura" nesta página.</p>
              </div>

              <div className="flex flex-col gap-3">
                <Button
                  className="gap-2 bg-green-600 hover:bg-green-700 text-white"
                  asChild
                >
                  <a href="https://assinador.iti.br/" target="_blank" rel="noopener noreferrer">
                    <ShieldCheck className="h-4 w-4" /> Acessar Assinador Gov.br
                  </a>
                </Button>

                {/* Instructional video embed */}
                <div className="rounded-lg overflow-hidden border border-green-200 dark:border-green-800">
                  <div className="bg-green-100 dark:bg-green-900/50 px-4 py-2">
                    <p className="text-xs font-medium text-green-700 dark:text-green-300">
                      📹 Como assinar com Gov.br
                    </p>
                  </div>
                  <div className="aspect-video bg-muted flex items-center justify-center">
                    <div className="text-center">
                      <ShieldCheck className="h-12 w-12 text-green-500 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">
                        Acesse o portal assinador.iti.br, faça upload do PDF e assine com sua conta Gov.br
                      </p>
                    </div>
                  </div>
                </div>

                <Button
                  onClick={handleMarkSigned}
                  variant="default"
                  className="gap-2"
                  disabled={step === 'signing'}
                >
                  {step === 'signing' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  Confirmar Assinatura
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* ZapSign section */}
        {signature.signing_method === 'zapsign' && (
          <Card className="p-6 border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
            <div className="flex items-center gap-3 mb-4">
              <FileSignature className="h-6 w-6 text-blue-600" />
              <h3 className="font-semibold text-blue-800 dark:text-blue-300">Assinatura via ZapSign</h3>
            </div>
            <p className="text-sm text-blue-700 dark:text-blue-300 mb-4">
              O link de assinatura será enviado automaticamente quando a integração ZapSign estiver configurada.
            </p>
            <Button
              onClick={handleMarkSigned}
              variant="default"
              className="gap-2"
              disabled={step === 'signing'}
            >
              {step === 'signing' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Confirmar Assinatura Manual
            </Button>
          </Card>
        )}
      </main>
    </div>
  );
}
