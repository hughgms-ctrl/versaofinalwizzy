import { useState, useMemo } from 'react';
import { ArrowLeft, FileText, Send, Loader2, Users, Copy, Check } from 'lucide-react';
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
  templateIds: string[];
  templateNames: string[];
}

export function PackFillForm({ pack, onBack, onSuccess, onGeneratedForSignature }: PackFillFormProps) {
  const { data: allTemplates } = useDocumentTemplates();
  const { profile } = useAuth();
  const createSigners = useCreateSigners();

  const [fillMode, setFillMode] = useState<FillMode>('internal');
  const [values, setValues] = useState<Record<string, string>>({});
  const [signers, setSigners] = useState<SignerInput[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [publicLink, setPublicLink] = useState<string | null>(null);
  const [generatedDocIds, setGeneratedDocIds] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const templates = useMemo(() => {
    if (!allTemplates) return [];
    return pack.template_ids.map((id) => allTemplates.find((t) => t.id === id)).filter(Boolean) as DocumentTemplate[];
  }, [allTemplates, pack.template_ids]);

  const { sharedFields, uniqueFields, allFields } = useMemo(() => {
    const fieldMap = new Map<string, FieldInfo>();
    templates.forEach((template) => {
      const fs = (template.fields as any[]) || [];
      fs.forEach((field: any) => {
        const name = field.name || field;
        if (!fieldMap.has(name)) fieldMap.set(name, { name, label: field.label || name, type: field.type || 'text', templateIds: [], templateNames: [] });
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
  }, [templates]);

  const handleGenerateInternal = async (advanceToSignature = false) => {
    if (!profile?.organization_id) return;
    setIsGenerating(true);
    try {
      let firstDocId: string | null = null;
      const docIds: string[] = [];

      for (const template of templates) {
        const templateFields = (template.fields as any[]) || [];
        const filledData: Record<string, string> = {};
        templateFields.forEach((field: any) => {
          const name = field.name || field;
          filledData[name] = values[name] || '';
        });

        const { data: docData, error } = await (supabase as any)
          .from('generated_documents')
          .insert({
            organization_id: profile.organization_id,
            template_id: template.id,
            pack_id: pack.id,
            name: `${pack.name} - ${template.name}`,
            filled_data: filledData,
            status: 'generated',
            signing_method: 'internal',
            fill_mode: 'internal',
            is_filled: true,
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
      if (signers.length > 0 && docIds.length > 0) {
        await createSigners.mutateAsync({ documentIds: docIds, packId: pack.id, signers, signing_method: 'internal' });
      }

      if (signers.length > 0 && docIds.length > 0) {
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
    if (signers.length === 0) {
      toast.error('Adicione ao menos 1 signatário');
      return;
    }
    if (signers.some((s) => !s.signer_name?.trim())) {
      toast.error('Preencha o nome de todos os signatários');
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
            signature_config: { signing_method: 'internal', signers },
            created_by: profile.id,
          })
          .select('id')
          .single();
        if (error) throw error;
        if (docData?.id) docIds.push(docData.id);
      }

      if (docIds.length > 0) {
        await createSigners.mutateAsync({ documentIds: docIds, packId: pack.id, signers, signing_method: 'internal' });
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

  const allFieldsFilled = useMemo(() => allFields.every((f) => values[f.name]?.trim()), [allFields, values]);

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
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <span className="h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">{fillMode === 'internal' ? 3 : 2}</span>
            <Users className="h-4 w-4" /> Signatários (válidos para todos os documentos do pack)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SignersManager signers={signers} onChange={setSigners} />
        </CardContent>
      </Card>

      <div className="flex flex-col sm:flex-row gap-2 sticky bottom-4 bg-background/80 backdrop-blur p-3 rounded-lg border shadow-lg">
        {fillMode === 'internal' ? (
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
