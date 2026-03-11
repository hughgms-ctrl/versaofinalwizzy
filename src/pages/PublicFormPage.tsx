import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, FileDown, Image as ImageIcon, X, CheckCircle, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';

interface TemplateField {
  name: string;
  label: string;
  type: string;
  required: boolean;
}

interface PublicTemplate {
  id: string;
  name: string;
  description: string | null;
  content: string;
  fields: TemplateField[];
  auto_send_whatsapp?: boolean;
}

interface OrgInfo {
  name: string;
  logo_url: string | null;
}

export default function PublicFormPage() {
  const [searchParams] = useSearchParams();
  const templateId = searchParams.get('id');

  const [loading, setLoading] = useState(true);
  const [template, setTemplate] = useState<PublicTemplate | null>(null);
  const [org, setOrg] = useState<OrgInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState<Record<string, string>>({});
  const [documentName, setDocumentName] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!templateId) {
      setError('ID do template não informado.');
      setLoading(false);
      return;
    }

    const fetchTemplate = async () => {
      try {
        const { data, error: fnError } = await supabase.functions.invoke('public-template', {
          body: { id: templateId },
        });

        if (fnError) {
          throw new Error('Template não encontrado');
        }

        setTemplate(data.template);
        setOrg(data.organization);
        setDocumentName(data.template.name);
      } catch (e: any) {
        setError(e.message || 'Erro ao carregar template');
      } finally {
        setLoading(false);
      }
    };

    fetchTemplate();
  }, [templateId]);

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

  const getInputType = (fieldType: string) => {
    switch (fieldType) {
      case 'date': return 'date';
      case 'email': return 'email';
      case 'phone': return 'tel';
      case 'number': return 'number';
      default: return 'text';
    }
  };

  const handleGenerate = async () => {
    if (!template) return;

    const fields = template.fields || [];
    const missing = fields.filter(f => f.required && !formData[f.name]?.trim());
    if (missing.length > 0) {
      setError(`Preencha os campos obrigatórios: ${missing.map(f => f.label).join(', ')}`);
      return;
    }

    setError(null);
    setGenerating(true);

    try {
      // Upload logo if present
      let logoUrl: string | null = null;
      if (logoFile) {
        const safeName = logoFile.name
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-zA-Z0-9._-]/g, '_');
        const logoPath = `public-logos/${Date.now()}-${safeName}`;
        const { error: uploadError } = await supabase.storage
          .from('contact-files')
          .upload(logoPath, logoFile);
        if (!uploadError) {
          const { data: urlData } = supabase.storage
            .from('contact-files')
            .getPublicUrl(logoPath);
          logoUrl = urlData.publicUrl;
        }
      }

      const { data: result, error: submitError } = await supabase.functions.invoke('public-form-submit', {
        body: {
          template_id: template.id,
          filled_data: formData,
          document_name: documentName,
          logo_url: logoUrl,
          auto_send_whatsapp: template.auto_send_whatsapp || false,
        },
      });

      if (submitError || !result?.pdf_url) {
        throw new Error(result?.error || 'Erro ao gerar documento');
      }

      setPdfUrl(result.pdf_url);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  };

  // Preview
  const filledContent = template
    ? (template.fields || []).reduce(
        (text, field) => text.replace(
          new RegExp(`\\{\\{${field.name}\\}\\}`, 'g'),
          formData[field.name] || `[${field.label}]`
        ),
        template.content
      )
    : '';

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error && !template) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full text-center p-8">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold mb-2">Formulário indisponível</h2>
          <p className="text-sm text-muted-foreground">{error}</p>
        </Card>
      </div>
    );
  }

  if (pdfUrl) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full text-center p-8">
          <CheckCircle className="h-12 w-12 mx-auto text-primary mb-4" />
          <h2 className="text-lg font-semibold mb-2">Documento gerado com sucesso!</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Seu documento PDF está pronto para download.
          </p>
          <Button asChild size="lg" className="w-full">
            <a href={pdfUrl} target="_blank" rel="noopener noreferrer">
              <FileDown className="h-4 w-4 mr-2" />
              Baixar PDF
            </a>
          </Button>
        </Card>
      </div>
    );
  }

  if (!template) return null;

  const fields = template.fields || [];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card py-4 px-6">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          {org?.logo_url && (
            <img src={org.logo_url} alt={org.name} className="h-8 w-auto object-contain" />
          )}
          <div>
            <h1 className="text-lg font-semibold">{template.name}</h1>
            {org?.name && <p className="text-xs text-muted-foreground">{org.name}</p>}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 md:p-6">
        {template.description && (
          <p className="text-sm text-muted-foreground mb-6">{template.description}</p>
        )}

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Form */}
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
                  <Label>Logo (cabeçalho)</Label>
                  {logoPreview ? (
                    <div className="mt-1 flex items-center gap-3 p-3 border rounded-lg">
                      <img src={logoPreview} alt="Logo" className="h-12 w-auto max-w-[200px] object-contain" />
                      <Button variant="ghost" size="icon" onClick={removeLogo}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <label className="mt-1 border-2 border-dashed border-border rounded-lg p-4 text-center block cursor-pointer hover:border-primary/50 transition-colors relative">
                      <ImageIcon className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
                      <p className="text-xs text-muted-foreground">Clique para selecionar</p>
                      <input type="file" accept="image/*" onChange={handleLogoChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                    </label>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Campos ({fields.length})</CardTitle>
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

          {/* Preview */}
          <Card className="lg:sticky lg:top-4 h-fit hidden lg:block">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Preview</CardTitle>
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
      </main>
    </div>
  );
}
