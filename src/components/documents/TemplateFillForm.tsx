import { useState, useMemo } from 'react';
import { ArrowLeft, Loader2, FileDown, Send, Users, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { DocumentTemplate } from '@/hooks/useDocumentTemplates';
import { useQueryClient } from '@tanstack/react-query';
import { fillTemplate } from '@/lib/documentFormatters';
import { FillModeStep, FillMode } from './FillModeStep';
import { SignersManager } from './SignersManager';
import { SignerLinksList } from './SignerLinksList';
import { SignerInput, useCreateSigners } from '@/hooks/useDocumentSigners';
import { getPublicAppOrigin } from '@/lib/publicOrigin';

interface TemplateFillFormProps {
  template: DocumentTemplate;
  onBack: () => void;
  onGeneratedForSignature?: (documentId: string) => void;
}

export function TemplateFillForm({ template, onBack, onGeneratedForSignature }: TemplateFillFormProps) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createSigners = useCreateSigners();

  const [fillMode, setFillMode] = useState<FillMode>('internal');
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [documentName, setDocumentName] = useState(template.name);
  const [signers, setSigners] = useState<SignerInput[]>([]);
  const [generating, setGenerating] = useState(false);
  const [publicLink, setPublicLink] = useState<string | null>(null);
  const [generatedDocId, setGeneratedDocId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fields = (template.fields || []) as Array<{ name: string; label: string; type: string; required: boolean }>;

  const handleFieldChange = (fieldName: string, value: string) => {
    setFormData((prev) => ({ ...prev, [fieldName]: value }));
  };

  // ---- Internal flow: fill now → generate PDF → optionally sign
  const handleGenerateInternal = async (advanceToSignature = false) => {
    if (!profile) return;
    const missing = fields.filter((f) => f.required && !formData[f.name]?.trim());
    if (missing.length > 0) {
      toast({ title: 'Campos obrigatórios', description: `Preencha: ${missing.map((f) => f.label).join(', ')}`, variant: 'destructive' });
      return;
    }
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-document-pdf', {
        body: {
          template_content: template.content,
          template_content_html: template.content_html,
          fields,
          filled_data: formData,
          document_name: documentName,
          logo_url: template.logo_url || null,
          template_id: template.id,
        },
      });
      if (error) throw new Error(typeof error === 'object' && error.message ? error.message : 'Erro ao gerar PDF');
      if (!data?.pdf_url) throw new Error('PDF não foi gerado corretamente');

      const { data: docData, error: dbError } = await (supabase as any)
        .from('generated_documents')
        .insert({
          organization_id: profile.organization_id,
          template_id: template.id,
          name: documentName,
          filled_data: formData,
          pdf_url: data.pdf_url,
          status: 'generated',
          fill_mode: 'internal',
          is_filled: true,
          created_by: profile.id,
        })
        .select('id')
        .single();
      if (dbError) throw dbError;

      // Save signers if any
      if (signers.length > 0 && docData?.id) {
        await createSigners.mutateAsync({
          documentIds: [docData.id],
          signers,
          signing_method: 'internal',
        });
      }

      queryClient.invalidateQueries({ queryKey: ['generated-documents'] });

      if (signers.length > 0 && docData?.id) {
        // Show signer links screen
        setGeneratedDocId(docData.id);
        toast({ title: 'Documento gerado! Envie os links abaixo.' });
        return;
      }

      if (advanceToSignature && docData?.id && onGeneratedForSignature) {
        toast({ title: 'Documento gerado! Configure a assinatura.' });
        onGeneratedForSignature(docData.id);
      } else {
        toast({ title: 'Documento gerado com sucesso!' });
        onBack();
      }
    } catch (error: any) {
      toast({ title: 'Erro ao gerar documento', description: error.message, variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  // ---- Public flow: create empty doc with token → return public link
  const handleGeneratePublicLink = async () => {
    if (!profile) return;
    if (signers.length === 0) {
      toast({ title: 'Adicione ao menos 1 signatário', variant: 'destructive' });
      return;
    }
    const invalidManual = signers.find((s) => (s.data_source ?? 'manual') === 'manual' && !s.signer_name?.trim());
    if (invalidManual) {
      toast({ title: 'Preencha o nome dos signatários com dados fixos', variant: 'destructive' });
      return;
    }
    const invalidForm = signers.find((s) => s.data_source === 'form' && !s.field_mapping?.name);
    if (invalidForm) {
      toast({ title: 'Vincule o campo "Nome" dos signatários do tipo "Cliente preenche"', variant: 'destructive' });
      return;
    }
    setGenerating(true);
    try {
      const fillToken = crypto.randomUUID();
      const { data: docData, error: dbError } = await (supabase as any)
        .from('generated_documents')
        .insert({
          organization_id: profile.organization_id,
          template_id: template.id,
          name: documentName,
          filled_data: {},
          status: 'awaiting_fill',
          fill_mode: 'public',
          is_filled: false,
          public_fill_token: fillToken,
          signature_config: { signing_method: 'internal', signers },
          created_by: profile.id,
        })
        .select('id')
        .single();
      if (dbError) throw dbError;

      // Pre-create signers (will activate when document is filled)
      if (docData?.id) {
        await createSigners.mutateAsync({
          documentIds: [docData.id],
          signers,
          signing_method: 'internal',
        });
      }

      const link = `${getPublicAppOrigin()}/preencher-contrato/${fillToken}`;
      setPublicLink(link);
      if (docData?.id) setGeneratedDocId(docData.id);
      queryClient.invalidateQueries({ queryKey: ['generated-documents'] });
      toast({ title: 'Link público gerado!' });
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const copyLink = async () => {
    if (!publicLink) return;
    await navigator.clipboard.writeText(publicLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const filledContent = useMemo(() => {
    const sourceHtml = template.content_html || `<p>${(template.content || '').replace(/\n/g, '</p><p>')}</p>`;
    return fillTemplate(sourceHtml, formData, fields);
  }, [template, formData, fields]);

  const getInputType = (fieldType: string) => {
    switch (fieldType) {
      case 'email': return 'email';
      case 'phone': return 'tel';
      case 'number': return 'number';
      default: return 'text';
    }
  };

  // Internal: doc generated, show signer links
  if (generatedDocId && !publicLink) {
    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="h-5 w-5" /></Button>
          <div>
            <h2 className="text-lg font-semibold">Documento gerado</h2>
            <p className="text-sm text-muted-foreground">Envie o link de assinatura para cada signatário</p>
          </div>
        </div>
        <Card>
          <CardContent className="pt-6">
            <SignerLinksList documentIds={[generatedDocId]} />
          </CardContent>
        </Card>
        <Button onClick={onBack} variant="outline" className="w-full">Concluir</Button>
      </div>
    );
  }

  // Public link generated screen
  if (publicLink) {
    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="h-5 w-5" /></Button>
          <div>
            <h2 className="text-lg font-semibold">Link de preenchimento</h2>
            <p className="text-sm text-muted-foreground">Envie este link para o cliente preencher os dados</p>
          </div>
        </div>
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Link para o cliente preencher</Label>
              <div className="flex gap-2">
                <Input value={publicLink} readOnly className="font-mono text-xs" />
                <Button onClick={copyLink} className="gap-2 shrink-0">
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Copiado' : 'Copiar'}
                </Button>
              </div>
            </div>
            <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground">
              Após o cliente preencher, cada signatário receberá automaticamente seu link único de assinatura.
            </div>
          </CardContent>
        </Card>

        {generatedDocId && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Links dos signatários (já disponíveis)</CardTitle>
            </CardHeader>
            <CardContent>
              <SignerLinksList
                documentIds={[generatedDocId]}
                title=""
                description="Você pode enviar os links de assinatura agora ou aguardar o cliente preencher os dados."
              />
            </CardContent>
          </Card>
        )}

        <Button onClick={onBack} variant="outline" className="w-full">Concluir</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="h-5 w-5" /></Button>
        <div>
          <h2 className="text-lg font-semibold">Gerar documento</h2>
          <p className="text-sm text-muted-foreground">Template: {template.name}</p>
        </div>
      </div>

      {/* Step 1: Mode */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <span className="h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">1</span>
            Quem preenche os dados?
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FillModeStep value={fillMode} onChange={setFillMode} />
        </CardContent>
      </Card>

      {/* Step 2: Document name */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <span className="h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">2</span>
            Identificação do documento
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Label>Nome do documento</Label>
          <Input value={documentName} onChange={(e) => setDocumentName(e.target.value)} placeholder="Ex: Contrato João Silva" className="mt-1" />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Step 3: Fields (only if internal) */}
        {fillMode === 'internal' && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <span className="h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">3</span>
                Campos do documento ({fields.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {fields.map((field) => (
                <div key={field.name}>
                  <Label className="text-xs">
                    {field.label}
                    {field.required && <span className="text-destructive ml-1">*</span>}
                  </Label>
                  {field.type === 'address' ? (
                    <Textarea value={formData[field.name] || ''} onChange={(e) => handleFieldChange(field.name, e.target.value)} rows={2} className="text-sm" />
                  ) : field.type === 'date' ? (
                    <DatePicker value={formData[field.name] || ''} onChange={(v) => handleFieldChange(field.name, v)} />
                  ) : (
                    <Input type={getInputType(field.type)} value={formData[field.name] || ''} onChange={(e) => handleFieldChange(field.name, e.target.value)} className="text-sm" />
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Preview */}
        {fillMode === 'internal' && (
          <Card className="lg:sticky lg:top-4 h-fit">
            <CardHeader className="pb-3"><CardTitle className="text-sm">Preview</CardTitle></CardHeader>
            <CardContent>
              {template.logo_url && (
                <div className="mb-4 pb-3 border-b bg-white p-2 rounded">
                  <img src={template.logo_url} alt="Logo" className="h-10 w-auto object-contain" />
                </div>
              )}
              <div className="max-h-[50vh] overflow-y-auto bg-white text-black p-6 rounded-lg leading-relaxed prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: filledContent }} />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Step: Signers */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <span className="h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">{fillMode === 'internal' ? 4 : 3}</span>
            <Users className="h-4 w-4" /> Quem irá assinar?
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SignersManager
            signers={signers}
            onChange={setSigners}
            availableFields={fields.map((f) => ({ name: f.name, label: f.label, type: f.type }))}
          />
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-2 sticky bottom-4 bg-background/80 backdrop-blur p-3 rounded-lg border shadow-lg">
        {fillMode === 'internal' ? (
          <>
            <Button onClick={() => handleGenerateInternal(false)} disabled={generating || !documentName.trim()} className="flex-1" size="lg">
              {generating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Gerando...</> : <><FileDown className="h-4 w-4 mr-2" />Gerar PDF</>}
            </Button>
            {onGeneratedForSignature && signers.length === 0 && (
              <Button onClick={() => handleGenerateInternal(true)} disabled={generating || !documentName.trim()} variant="outline" size="lg" className="flex-1">
                Gerar e configurar assinatura
              </Button>
            )}
          </>
        ) : (
          <Button onClick={handleGeneratePublicLink} disabled={generating || !documentName.trim() || signers.length === 0} className="flex-1" size="lg">
            {generating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Gerando...</> : <><Send className="h-4 w-4 mr-2" />Gerar link público</>}
          </Button>
        )}
      </div>
    </div>
  );
}
