import { useState, useMemo } from 'react';
import { ArrowLeft, FileText, Send, Loader2, FileSignature } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DocumentPack } from '@/hooks/useDocumentPacks';
import { useDocumentTemplates, DocumentTemplate } from '@/hooks/useDocumentTemplates';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface PackFillFormProps {
  pack: DocumentPack;
  onBack: () => void;
  onSuccess?: () => void;
  onGeneratedForSignature?: (documentId: string) => void;
}

interface FieldInfo {
  name: string;
  templateIds: string[];
  templateNames: string[];
}

export function PackFillForm({ pack, onBack, onSuccess, onGeneratedForSignature }: PackFillFormProps) {
  const { data: allTemplates } = useDocumentTemplates();
  const { profile } = useAuth();
  const [values, setValues] = useState<Record<string, string>>({});
  const [signingMethod, setSigningMethod] = useState<string>('manual');
  const [isGenerating, setIsGenerating] = useState(false);

  // Get templates in this pack
  const templates = useMemo(() => {
    if (!allTemplates) return [];
    return pack.template_ids
      .map(id => allTemplates.find(t => t.id === id))
      .filter(Boolean) as DocumentTemplate[];
  }, [allTemplates, pack.template_ids]);

  // Analyze fields across templates
  const { sharedFields, uniqueFields } = useMemo(() => {
    const fieldMap = new Map<string, FieldInfo>();

    templates.forEach(template => {
      const fields = (template.fields as any[]) || [];
      fields.forEach((field: any) => {
        const name = field.name || field;
        if (!fieldMap.has(name)) {
          fieldMap.set(name, { name, templateIds: [], templateNames: [] });
        }
        const info = fieldMap.get(name)!;
        if (!info.templateIds.includes(template.id)) {
          info.templateIds.push(template.id);
          info.templateNames.push(template.name);
        }
      });
    });

    const shared: FieldInfo[] = [];
    const unique: FieldInfo[] = [];

    fieldMap.forEach(info => {
      if (info.templateIds.length > 1) {
        shared.push(info);
      } else {
        unique.push(info);
      }
    });

    return { sharedFields: shared, uniqueFields: unique };
  }, [templates]);

  const handleGenerate = async (advanceToSignature = false) => {
    if (!profile?.organization_id) return;

    setIsGenerating(true);
    try {
      let firstDocId: string | null = null;

      // Generate a document for each template in the pack
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
            signing_method: signingMethod,
            created_by: profile.id,
          })
          .select('id')
          .single();

        if (error) throw error;
        if (!firstDocId && docData?.id) firstDocId = docData.id;
      }

      if (advanceToSignature && firstDocId && onGeneratedForSignature) {
        toast.success(`${templates.length} documentos gerados! Configure a assinatura.`);
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

  const allFieldsFilled = useMemo(() => {
    const allFields = [...sharedFields, ...uniqueFields];
    return allFields.every(f => values[f.name]?.trim());
  }, [sharedFields, uniqueFields, values]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
        </Button>
        <div className="flex gap-2">
          {onGeneratedForSignature && (
            <Button variant="outline" onClick={() => handleGenerate(true)} disabled={!allFieldsFilled || isGenerating} className="gap-2">
              <FileSignature className="h-4 w-4" />
              Gerar e Assinar
            </Button>
          )}
          <Button onClick={() => handleGenerate(false)} disabled={!allFieldsFilled || isGenerating}>
            {isGenerating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Gerar {templates.length} documento{templates.length > 1 ? 's' : ''}
          </Button>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold">{pack.name}</h2>
        <p className="text-sm text-muted-foreground">{pack.description || 'Preencha os campos abaixo para gerar os documentos'}</p>
        <div className="flex gap-2 mt-2">
          {templates.map(t => (
            <Badge key={t.id} variant="outline">
              <FileText className="h-3 w-3 mr-1" />
              {t.name}
            </Badge>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Shared Fields */}
        {sharedFields.length > 0 && (
          <Card className="p-4">
            <h3 className="font-medium mb-4 flex items-center gap-2">
              <Badge variant="default">{sharedFields.length}</Badge>
              Campos compartilhados
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              Estes campos serão preenchidos em múltiplos documentos
            </p>
            <div className="space-y-4">
              {sharedFields.map(field => (
                <div key={field.name}>
                  <Label className="text-sm flex items-center gap-2">
                    {field.name}
                    <span className="text-xs text-muted-foreground">({field.templateNames.length} docs)</span>
                  </Label>
                  <Input
                    value={values[field.name] || ''}
                    onChange={e => setValues(prev => ({ ...prev, [field.name]: e.target.value }))}
                    placeholder={`Digite ${field.name}`}
                  />
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Unique Fields */}
        {uniqueFields.length > 0 && (
          <Card className="p-4">
            <h3 className="font-medium mb-4 flex items-center gap-2">
              <Badge variant="secondary">{uniqueFields.length}</Badge>
              Campos específicos
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              Estes campos aparecem em apenas um documento
            </p>
            <div className="space-y-4">
              {uniqueFields.map(field => (
                <div key={field.name}>
                  <Label className="text-sm flex items-center gap-2">
                    {field.name}
                    <span className="text-xs text-muted-foreground">({field.templateNames[0]})</span>
                  </Label>
                  <Input
                    value={values[field.name] || ''}
                    onChange={e => setValues(prev => ({ ...prev, [field.name]: e.target.value }))}
                    placeholder={`Digite ${field.name}`}
                  />
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      <Separator />

      <Card className="p-4">
        <h3 className="font-medium mb-4">Assinatura</h3>
        <div className="max-w-xs">
          <Label>Método de assinatura</Label>
          <Select value={signingMethod} onValueChange={setSigningMethod}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="manual">Manual (cliente devolve assinado)</SelectItem>
              <SelectItem value="desenho">Assinatura digital (desenho)</SelectItem>
              <SelectItem value="govbr" disabled>Gov.br (em breve)</SelectItem>
              <SelectItem value="zapsign" disabled>ZapSign (em breve)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>
    </div>
  );
}
