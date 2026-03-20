import { useState } from 'react';
import { ArrowLeft, Loader2, FileDown, Image as ImageIcon, X, FileSignature } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { DocumentTemplate } from '@/hooks/useDocumentTemplates';
import { useQueryClient } from '@tanstack/react-query';

interface TemplateFillFormProps {
  template: DocumentTemplate;
  onBack: () => void;
  onGeneratedForSignature?: (documentId: string) => void;
}

export function TemplateFillForm({ template, onBack, onGeneratedForSignature }: TemplateFillFormProps) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [documentName, setDocumentName] = useState(template.name);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const fields = (template.fields || []) as Array<{ name: string; label: string; type: string; required: boolean }>;

  const handleFieldChange = (fieldName: string, value: string) => {
    setFormData(prev => ({ ...prev, [fieldName]: value }));
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);
      const reader = new FileReader();
      reader.onload = (ev) => setLogoPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const removeLogo = () => {
    setLogoFile(null);
    setLogoPreview(null);
  };

  const handleGenerate = async (advanceToSignature = false) => {
    if (!profile) return;

    // Validate required fields
    const missing = fields.filter(f => f.required && !formData[f.name]?.trim());
    if (missing.length > 0) {
      toast({
        title: 'Campos obrigatórios',
        description: `Preencha: ${missing.map(f => f.label).join(', ')}`,
        variant: 'destructive',
      });
      return;
    }

    setGenerating(true);
    try {
      // Upload logo if present
      let logoUrl: string | null = null;
      if (logoFile) {
        const safeName = logoFile.name
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-zA-Z0-9._-]/g, '_');
        const logoPath = `${profile.organization_id}/logos/${Date.now()}-${safeName}`;
        const { error: uploadError } = await supabase.storage
          .from('contact-files')
          .upload(logoPath, logoFile);
        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('contact-files')
          .getPublicUrl(logoPath);
        logoUrl = urlData.publicUrl;
      }

      // Call PDF generation edge function
      const { data, error } = await supabase.functions.invoke('generate-document-pdf', {
        body: {
          template_content: template.content,
          filled_data: formData,
          document_name: documentName,
          logo_url: logoUrl,
        },
      });

      if (error) {
        console.error('PDF generation error:', error);
        throw new Error(typeof error === 'object' && error.message ? error.message : 'Erro ao gerar PDF');
      }

      if (!data?.pdf_url) {
        throw new Error('PDF não foi gerado corretamente');
      }

      // Save generated document to database
      const { data: docData, error: dbError } = await (supabase as any)
        .from('generated_documents')
        .insert({
          organization_id: profile.organization_id,
          template_id: template.id,
          name: documentName,
          filled_data: formData,
          pdf_url: data.pdf_url,
          status: 'generated',
          created_by: profile.id,
        })
        .select('id')
        .single();

      if (dbError) throw dbError;

      queryClient.invalidateQueries({ queryKey: ['generated-documents'] });

      if (advanceToSignature && docData?.id && onGeneratedForSignature) {
        toast({ title: 'Documento gerado! Configure a assinatura.' });
        onGeneratedForSignature(docData.id);
      } else {
        toast({ title: 'Documento gerado com sucesso!' });
        onBack();
      }
    } catch (error: any) {
      toast({
        title: 'Erro ao gerar documento',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setGenerating(false);
    }
  };

  // Preview filled content
  const filledContent = fields.reduce(
    (text, field) => text.replace(
      new RegExp(`\\{\\{${field.name}\\}\\}`, 'g'),
      formData[field.name] || `[${field.label}]`
    ),
    template.content
  );

  const getInputType = (fieldType: string) => {
    switch (fieldType) {
      case 'date': return 'date';
      case 'email': return 'email';
      case 'phone': return 'tel';
      case 'number': return 'number';
      default: return 'text';
    }
  };

  const getInputMask = (fieldType: string) => {
    switch (fieldType) {
      case 'cpf': return '000.000.000-00';
      default: return undefined;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h2 className="text-lg font-semibold">Preencher documento</h2>
          <p className="text-sm text-muted-foreground">Template: {template.name}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Form Section */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Informações do documento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Nome do documento</Label>
                <Input
                  value={documentName}
                  onChange={e => setDocumentName(e.target.value)}
                  placeholder="Ex: Contrato João Silva"
                />
              </div>

              <div>
                <Label>Logo (cabeçalho do documento)</Label>
                {logoPreview ? (
                  <div className="mt-1 flex items-center gap-3 p-3 border rounded-lg">
                    <img
                      src={logoPreview}
                      alt="Logo preview"
                      className="h-12 w-auto max-w-[200px] object-contain"
                    />
                    <Button variant="ghost" size="icon" onClick={removeLogo}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <label className="mt-1 border-2 border-dashed border-border rounded-lg p-4 text-center block cursor-pointer hover:border-primary/50 transition-colors relative">
                    <ImageIcon className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
                    <p className="text-xs text-muted-foreground">Clique para selecionar</p>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoChange}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                  </label>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Campos do documento ({fields.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {fields.map((field) => (
                <div key={field.name}>
                  <Label className="text-xs">
                    {field.label}
                    {field.required && <span className="text-destructive ml-1">*</span>}
                  </Label>
                  {field.type === 'address' ? (
                    <Textarea
                      value={formData[field.name] || ''}
                      onChange={e => handleFieldChange(field.name, e.target.value)}
                      placeholder={field.label}
                      rows={2}
                      className="text-sm"
                    />
                  ) : (
                    <Input
                      type={getInputType(field.type)}
                      value={formData[field.name] || ''}
                      onChange={e => handleFieldChange(field.name, e.target.value)}
                      placeholder={field.label}
                      className="text-sm"
                    />
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          <Button
            onClick={handleGenerate}
            disabled={generating || !documentName.trim()}
            className="w-full"
            size="lg"
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Gerando PDF...
              </>
            ) : (
              <>
                <FileDown className="h-4 w-4 mr-2" />
                Gerar documento PDF
              </>
            )}
          </Button>
        </div>

        {/* Preview Section */}
        <Card className="lg:sticky lg:top-4 h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Preview do documento</CardTitle>
          </CardHeader>
          <CardContent>
            {logoPreview && (
              <div className="mb-4 pb-3 border-b">
                <img src={logoPreview} alt="Logo" className="h-10 w-auto object-contain" />
              </div>
            )}
            <div className="max-h-[60vh] overflow-y-auto text-xs font-mono whitespace-pre-wrap bg-muted p-4 rounded-lg leading-relaxed">
              {filledContent}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
