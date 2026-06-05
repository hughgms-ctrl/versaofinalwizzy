import { useState, useMemo } from 'react';
import { ArrowLeft, FileText, Send, Loader2, Users, Copy, Check, Printer, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DocumentPack } from '@/hooks/useDocumentPacks';
import { useDocumentTemplates, DocumentTemplate } from '@/hooks/useDocumentTemplates';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { DatePicker } from '@/components/ui/date-picker';
import { FillModeStep, FillMode } from './FillModeStep';
import { SignersManager } from './SignersManager';
import { SignerLinksList } from './SignerLinksList';
import { SignerInput, useCreateSigners } from '@/hooks/useDocumentSigners';
import { getPublicAppOrigin } from '@/lib/publicOrigin';
import { cn } from '@/lib/utils';
import { useGeneratedDocuments } from '@/hooks/useGeneratedDocuments';
import { enforceEntryCreationLimit } from '@/lib/entryFlow';

interface PackFillFormProps {
  pack: DocumentPack;
  onBack: () => void;
  onSuccess?: () => void;
  onGeneratedForSignature?: (documentId: string) => void;
}

interface FieldInfo {
  name: string;
  label: string;
  type: string;
  required?: boolean;
  hint?: string;
  templateIds: string[];
  templateNames: string[];
  mappedFields?: Array<{ fieldName: string; templateId: string }>;
}

export function PackFillForm({ pack, onBack, onSuccess, onGeneratedForSignature }: PackFillFormProps) {
  const { data: allTemplates } = useDocumentTemplates();
  const { profile } = useAuth();
  const createSigners = useCreateSigners();
  const { data: generatedDocuments = [] } = useGeneratedDocuments();

  const [outputMode, setOutputMode] = useState<'print' | 'sign'>('print');
  const [fillMode, setFillMode] = useState<FillMode>('internal');
  const [values, setValues] = useState<Record<string, string>>({});
  const [signers, setSigners] = useState<SignerInput[]>(
    ((pack as any).default_signers as SignerInput[]) || []
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [publicLink, setPublicLink] = useState<string | null>(null);
  const [generatedDocIds, setGeneratedDocIds] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const templates = useMemo(() => {
    if (!allTemplates) return [];
    return pack.template_ids.map((id) => allTemplates.find((t) => t.id === id)).filter(Boolean) as DocumentTemplate[];
  }, [allTemplates, pack.template_ids]);

  const { sharedFields, uniqueFields, allFields } = useMemo(() => {
    const configured = ((pack as any).field_config || []) as any[];
    if (configured.length > 0) {
      const fields = configured.map((field) => {
        const mappedFields = (field.mappedFields || []) as Array<{ fieldName: string; templateId: string }>;
        const templateIds = mappedFields.length > 0
          ? [...new Set(mappedFields.map((m) => m.templateId))]
          : field.sourceTemplateIds || [];
        const templateNames = templateIds.map((id) => templates.find((t) => t.id === id)?.name || 'Documento');
        return {
          name: field.originalName,
          label: field.label || field.originalName,
          type: field.type || 'text',
          required: field.required ?? true,
          hint: field.description,
          templateIds,
          templateNames,
          mappedFields,
        } as FieldInfo;
      });
      return {
        sharedFields: fields.filter((f) => f.templateIds.length > 1),
        uniqueFields: fields.filter((f) => f.templateIds.length <= 1),
        allFields: fields,
      };
    }

    const fieldMap = new Map<string, FieldInfo>();
    templates.forEach((template) => {
      const fs = (template.fields as any[]) || [];
      fs.forEach((field: any) => {
        const name = field.name || field;
        if (!fieldMap.has(name)) fieldMap.set(name, { name, label: field.label || name, type: field.type || 'text', required: field.required ?? true, hint: field.hint, templateIds: [], templateNames: [] });
        const info = fieldMap.get(name)!;
        if (!info.templateIds.includes(template.id)) {
          info.templateIds.push(template.id);
          info.templateNames.push(template.name);
        }
      });
    });
    const shared: FieldInfo[] = [];
    const unique: FieldInfo[] = [];
    fieldMap.forEach((info) => (info.templateIds.length > 1 ? shared.push(info) : unique.push(info)));
    return { sharedFields: shared, uniqueFields: unique, allFields: Array.from(fieldMap.values()) };
  }, [templates, pack]);

  const getValueForTemplateField = (templateId: string, fieldName: string) => {
    const configured = allFields.find((field) => {
      if (field.mappedFields?.some((m) => m.templateId === templateId && m.fieldName === fieldName)) return true;
      return field.name === fieldName;
    });
    return values[configured?.name || fieldName] || '';
  };

  const handleGenerateInternal = async (advanceToSignature = false) => {
    if (!profile?.organization_id) return;
    const documentsToCreate = Math.max(templates.length, 1);
    if (!enforceEntryCreationLimit('max_documents', generatedDocuments.length + documentsToCreate - 1, 'documentos Wizzy Sign')) return;
    setIsGenerating(true);
    try {
      let firstDocId: string | null = null;
      const docIds: string[] = [];
      const submissionGroup = crypto.randomUUID();

      for (const template of templates) {
        const templateFields = (template.fields as any[]) || [];
        const filledData: Record<string, string> = {};
        templateFields.forEach((field: any) => {
          const name = field.name || field;
          filledData[name] = getValueForTemplateField(template.id, name);
        });

        const { data: pdfData, error: pdfError } = await supabase.functions.invoke('generate-document-pdf', {
          body: {
            template_content: template.content,
            template_content_html: template.content_html,
            fields: templateFields,
            filled_data: filledData,
            document_name: `${pack.name} - ${template.name}`,
            logo_url: template.logo_url || null,
            template_id: template.id,
          },
        });
        if (pdfError) throw pdfError;

        const { data: docData, error } = await (supabase as any)
          .from('generated_documents')
          .insert({
            organization_id: profile.organization_id,
            template_id: template.id,
            pack_id: pack.id,
            name: `${pack.name} - ${template.name}`,
            filled_data: filledData,
            pdf_url: pdfData?.pdf_url || null,
            status: 'generated',
            signing_method: 'internal',
            fill_mode: 'internal',
            is_filled: true,
            submission_group: submissionGroup,
            created_by: profile.id,
          })
          .select('id')
          .single();
        if (error) throw error;
        if (docData?.id) {
          docIds.push(docData.id);
          if (!firstDocId) firstDocId = docData.id;
        }
      }

      // Apply signers to all docs in pack
      if (outputMode === 'sign' && signers.length > 0 && docIds.length > 0) {
        await createSigners.mutateAsync({ documentIds: docIds, packId: pack.id, signers, signing_method: 'internal' });
      }

      if (outputMode === 'sign' && signers.length > 0 && docIds.length > 0) {
        setGeneratedDocIds(docIds);
        toast.success(`${templates.length} documentos gerados! Envie os links abaixo.`);
        return;
      }

      if (advanceToSignature && firstDocId && onGeneratedForSignature) {
        toast.success(`${templates.length} documentos gerados!`);
        onGeneratedForSignature(firstDocId);
      } else {
        toast.success(`${templates.length} documentos gerados com sucesso!`);
        onSuccess?.();
        onBack();
      }
    } catch (error: any) {
      console.error('Error generating documents:', error);
      toast.error('Erro ao gerar documentos');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGeneratePublicLink = async () => {
    if (!profile?.organization_id) return;
    const documentsToCreate = Math.max(templates.length, 1);
    if (!enforceEntryCreationLimit('max_documents', generatedDocuments.length + documentsToCreate - 1, 'documentos Wizzy Sign')) return;
    if (outputMode === 'sign' && signers.length === 0) {
      toast.error('Adicione ao menos 1 signatário');
      return;
    }
    if (signers.some((s) => (s.data_source ?? 'manual') === 'manual' && !s.signer_name?.trim())) {
      toast.error('Preencha o nome dos signatários com dados fixos');
      return;
    }
    if (signers.some((s) => s.data_source === 'form' && !s.field_mapping?.name)) {
      toast.error('Vincule o campo "Nome" dos signatários do tipo "Cliente preenche"');
      return;
    }
    setIsGenerating(true);
    try {
      const fillToken = crypto.randomUUID();
      const docIds: string[] = [];

      for (const template of templates) {
        const { data: docData, error } = await (supabase as any)
          .from('generated_documents')
          .insert({
            organization_id: profile.organization_id,
            template_id: template.id,
            pack_id: pack.id,
            name: `${pack.name} - ${template.name}`,
            filled_data: {},
            status: 'awaiting_fill',
            fill_mode: 'public',
            is_filled: false,
            public_fill_token: fillToken,
            submission_group: fillToken,
            signature_config: { signing_method: 'internal', signers },
            created_by: profile.id,
          })
          .select('id')
          .single();
        if (error) throw error;
        if (docData?.id) docIds.push(docData.id);
      }

      if (docIds.length > 0) {
        const normalizedSigners = signers.map((s) => ({
          ...s,
          signer_name: s.data_source === 'form' && !s.signer_name?.trim()
            ? '(será preenchido pelo cliente)'
            : s.signer_name,
        }));
        await createSigners.mutateAsync({ documentIds: docIds, packId: pack.id, signers: normalizedSigners, signing_method: 'internal' });
      }

      const link = `${getPublicAppOrigin()}/preencher-contrato/${fillToken}`;
      setPublicLink(link);
      setGeneratedDocIds(docIds);
      toast.success('Link público gerado!');
    } catch (e: any) {
      toast.error('Erro: ' + (e.message || ''));
    } finally {
      setIsGenerating(false);
    }
  };

  const copyLink = async () => {
    if (!publicLink) return;
    await navigator.clipboard.writeText(publicLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const allFieldsFilled = useMemo(() => allFields.every((f) => !f.required || values[f.name]?.trim()), [allFields, values]);

  const renderFieldInput = (field: FieldInfo) => {
    if (field.type === 'date') {
      return <DatePicker value={values[field.name] || ''} onChange={(v) => setValues((prev) => ({ ...prev, [field.name]: v }))} />;
    }
    return <Input value={values[field.name] || ''} onChange={(e) => setValues((prev) => ({ ...prev, [field.name]: e.target.value }))} placeholder={`Digite ${field.label}`} />;
  };

  // Internal pack: docs generated, show signer links
  if (generatedDocIds.length > 0 && !publicLink) {
    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="h-5 w-5" /></Button>
          <div>
            <h2 className="text-lg font-semibold">{generatedDocIds.length} documentos gerados</h2>
            <p className="text-sm text-muted-foreground">Envie o link de assinatura para cada signatário</p>
          </div>
        </div>
        <Card>
          <CardContent className="pt-6">
            <SignerLinksList documentIds={generatedDocIds} />
          </CardContent>
        </Card>
        <Button onClick={onBack} variant="outline" className="w-full">Concluir</Button>
      </div>
    );
  }

  if (publicLink) {
    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="h-5 w-5" /></Button>
          <div>
            <h2 className="text-lg font-semibold">Link de preenchimento</h2>
            <p className="text-sm text-muted-foreground">Envie este link para o cliente preencher os dados do pack</p>
          </div>
        </div>
        <Card>
          <CardContent className="pt-6 space-y-4">
            <Label className="text-xs text-muted-foreground">Link para o cliente preencher</Label>
            <div className="flex gap-2">
              <Input value={publicLink} readOnly className="font-mono text-xs" />
              <Button onClick={copyLink} className="gap-2 shrink-0">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copiado' : 'Copiar'}
              </Button>
            </div>
            <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground">
              Após o cliente preencher, cada signatário receberá automaticamente seu link único de assinatura.
            </div>
          </CardContent>
        </Card>

        {generatedDocIds.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Links dos signatários (já disponíveis)</CardTitle>
            </CardHeader>
            <CardContent>
              <SignerLinksList
                documentIds={generatedDocIds}
                title=""
                description="Você pode enviar agora ou aguardar o cliente preencher os dados."
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
        <Button variant="ghost" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-2" /> Voltar</Button>
        <div>
          <h2 className="text-lg font-semibold">{pack.name}</h2>
          <p className="text-sm text-muted-foreground">{pack.description || `Pack com ${templates.length} documentos`}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {templates.map((t) => (
          <Badge key={t.id} variant="outline"><FileText className="h-3 w-3 mr-1" />{t.name}</Badge>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <span className="h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">1</span>
            O que você quer gerar?
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Card
              className={cn('p-4 cursor-pointer transition-all border-2', outputMode === 'print' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50')}
              onClick={() => {
                setOutputMode('print');
                setFillMode('internal');
              }}
            >
              <div className="flex items-start gap-3">
                <div className={cn('h-9 w-9 rounded-lg flex items-center justify-center shrink-0', outputMode === 'print' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
                  <Printer className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-semibold text-sm mb-1">Arquivos para imprimir</h4>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    Preencha uma vez e gere os PDFs individuais do pack sem assinatura digital.
                  </p>
                </div>
              </div>
            </Card>

            <Card
              className={cn('p-4 cursor-pointer transition-all border-2', outputMode === 'sign' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50')}
              onClick={() => setOutputMode('sign')}
            >
              <div className="flex items-start gap-3">
                <div className={cn('h-9 w-9 rounded-lg flex items-center justify-center shrink-0', outputMode === 'sign' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
                  <MessageCircle className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-semibold text-sm mb-1">Assinar no Wizzy Chat</h4>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    Use os mesmos signatários em todos os documentos, mantendo relatórios individuais.
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </CardContent>
      </Card>

      {/* Step 2: Mode */}
      {outputMode === 'sign' && (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <span className="h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">2</span>
            Quem preenche os dados?
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FillModeStep value={fillMode} onChange={setFillMode} />
        </CardContent>
      </Card>
      )}

      {fillMode === 'internal' && (
        <div className="grid gap-6 lg:grid-cols-2">
          {sharedFields.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Badge variant="default">{sharedFields.length}</Badge>
                  Campos compartilhados
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {sharedFields.map((field) => (
                  <div key={field.name}>
                    <Label className="text-sm flex items-center gap-2">
                      {field.label}
                      <span className="text-xs text-muted-foreground">({field.templateNames.length} docs)</span>
                    </Label>
                    {renderFieldInput(field)}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {uniqueFields.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Badge variant="secondary">{uniqueFields.length}</Badge>
                  Campos específicos
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {uniqueFields.map((field) => (
                  <div key={field.name}>
                    <Label className="text-sm flex items-center gap-2">
                      {field.label}
                      <span className="text-xs text-muted-foreground">({field.templateNames[0]})</span>
                    </Label>
                    {renderFieldInput(field)}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Signers */}
      {outputMode === 'sign' && (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <span className="h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">{fillMode === 'internal' ? 4 : 3}</span>
            <Users className="h-4 w-4" /> Signatários (válidos para todos os documentos do pack)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SignersManager
            signers={signers}
            onChange={setSigners}
            availableFields={allFields.map((f) => ({ name: f.name, label: f.label, type: f.type }))}
          />
        </CardContent>
      </Card>
      )}

      <div className="flex flex-col sm:flex-row gap-2 sticky bottom-4 bg-background/80 backdrop-blur p-3 rounded-lg border shadow-lg">
        {outputMode === 'print' ? (
          <Button onClick={() => handleGenerateInternal(false)} disabled={!allFieldsFilled || isGenerating} className="flex-1" size="lg">
            {isGenerating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Printer className="h-4 w-4 mr-2" />}
            Gerar PDFs para imprimir
          </Button>
        ) : fillMode === 'internal' ? (
          <>
            <Button onClick={() => handleGenerateInternal(false)} disabled={!allFieldsFilled || isGenerating} className="flex-1" size="lg">
              {isGenerating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Gerar {templates.length} documento{templates.length > 1 ? 's' : ''}
            </Button>
            {onGeneratedForSignature && signers.length === 0 && (
              <Button onClick={() => handleGenerateInternal(true)} disabled={!allFieldsFilled || isGenerating} variant="outline" size="lg" className="flex-1">
                Gerar e configurar assinatura
              </Button>
            )}
          </>
        ) : (
          <Button onClick={handleGeneratePublicLink} disabled={isGenerating || signers.length === 0} className="flex-1" size="lg">
            {isGenerating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Gerando...</> : <><Send className="h-4 w-4 mr-2" />Gerar link público</>}
          </Button>
        )}
      </div>
    </div>
  );
}
