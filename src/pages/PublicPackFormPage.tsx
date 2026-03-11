import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, CheckCircle, FileText, Send, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';

interface FieldConfig {
  originalName: string;
  label: string;
  description: string;
  type: string;
  required: boolean;
}

interface PackData {
  id: string;
  name: string;
  description: string | null;
  template_ids: string[];
  field_config: FieldConfig[];
  organization: { name: string; logo_url: string | null } | null;
  template_count: number;
}

export default function PublicPackFormPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [loading, setLoading] = useState(true);
  const [packData, setPackData] = useState<PackData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Token não informado.');
      setLoading(false);
      return;
    }

    const fetchPack = async () => {
      try {
        const { data, error: fnError } = await supabase.functions.invoke('public-pack-form', {
          body: { action: 'get', token },
        });
        if (fnError || data?.error) throw new Error(data?.error || 'Pack não encontrado');
        setPackData(data);
      } catch (e: any) {
        setError(e.message || 'Erro ao carregar formulário');
      } finally {
        setLoading(false);
      }
    };

    fetchPack();
  }, [token]);

  const getInputType = (fieldType: string) => {
    switch (fieldType) {
      case 'date': return 'date';
      case 'email': return 'email';
      case 'phone': return 'tel';
      case 'number': return 'number';
      default: return 'text';
    }
  };

  const handleSubmit = async () => {
    if (!packData || !token) return;

    const fields = packData.field_config || [];
    const missing = fields.filter(f => f.required && !formData[f.originalName]?.trim());
    if (missing.length > 0) {
      setError(`Preencha os campos obrigatórios: ${missing.map(f => f.label).join(', ')}`);
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('public-pack-form', {
        body: { action: 'submit', token, filled_data: formData },
      });
      if (fnError || data?.error) throw new Error(data?.error || 'Erro ao enviar');
      setSubmitted(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error && !packData) {
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

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full text-center p-8">
          <CheckCircle className="h-12 w-12 mx-auto text-primary mb-4" />
          <h2 className="text-lg font-semibold mb-2">Formulário enviado!</h2>
          <p className="text-sm text-muted-foreground">
            Seus dados foram recebidos e os documentos serão gerados em breve.
          </p>
        </Card>
      </div>
    );
  }

  if (!packData) return null;

  const fields = packData.field_config || [];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card py-4 px-6">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          {packData.organization?.logo_url && (
            <img src={packData.organization.logo_url} alt="" className="h-8 w-auto object-contain" />
          )}
          <div>
            <h1 className="text-lg font-semibold">{packData.name}</h1>
            {packData.organization?.name && (
              <p className="text-xs text-muted-foreground">{packData.organization.name}</p>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 md:p-6">
        {packData.description && (
          <p className="text-sm text-muted-foreground mb-4">{packData.description}</p>
        )}

        <div className="flex items-center gap-2 mb-6">
          <Badge variant="secondary" className="text-xs">
            <FileText className="h-3 w-3 mr-1" />
            {packData.template_count} documento{packData.template_count > 1 ? 's' : ''}
          </Badge>
          <span className="text-xs text-muted-foreground">
            Preencha uma vez, todos os documentos serão gerados automaticamente
          </span>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Preencha seus dados</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {fields.map((field) => (
              <div key={field.originalName}>
                <Label className="text-sm">
                  {field.label}
                  {field.required && <span className="text-destructive ml-1">*</span>}
                </Label>
                {field.description && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5 mb-1">
                    <Info className="h-3 w-3" />
                    {field.description}
                  </p>
                )}
                {field.type === 'address' ? (
                  <Textarea
                    value={formData[field.originalName] || ''}
                    onChange={e => setFormData(prev => ({ ...prev, [field.originalName]: e.target.value }))}
                    placeholder={field.label}
                    rows={2}
                  />
                ) : (
                  <Input
                    type={getInputType(field.type)}
                    value={formData[field.originalName] || ''}
                    onChange={e => setFormData(prev => ({ ...prev, [field.originalName]: e.target.value }))}
                    placeholder={field.label}
                  />
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <Button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full mt-4"
          size="lg"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Enviando...
            </>
          ) : (
            <>
              <Send className="h-4 w-4 mr-2" />
              Enviar formulário
            </>
          )}
        </Button>
      </main>
    </div>
  );
}
