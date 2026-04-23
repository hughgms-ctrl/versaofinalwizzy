import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';
import { FileText, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface FieldDef { name: string; label: string; type: string; required?: boolean }

export default function PublicDocumentFillPage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doc, setDoc] = useState<any>(null);
  const [packDocs, setPackDocs] = useState<any[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('public-document-fill', {
          body: undefined,
          method: 'GET' as any,
        });
        // invoke doesn't support GET with query — fallback to fetch
        const res = await fetch(
          `https://zaobtetbjpuzibjymhzw.supabase.co/functions/v1/public-document-fill?token=${encodeURIComponent(token)}`,
          { headers: { 'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inphb2J0ZXRianB1emlianltaHp3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMzc5MzksImV4cCI6MjA4NzcxMzkzOX0.HBUI1OK1eYq9FE2SzIvuAkxuCG0frApCQZqcjjDx43k' } }
        );
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || 'Erro ao carregar');
        setDoc(json.document);
        setPackDocs(json.pack_documents || []);
      } catch (e: any) {
        setError(e.message || 'Erro');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const allFields = useMemo<FieldDef[]>(() => {
    if (!doc) return [];
    if (packDocs.length > 0) {
      // unique fields across pack
      const map = new Map<string, FieldDef>();
      packDocs.forEach((d) => {
        const fs = (d.template?.fields || []) as FieldDef[];
        fs.forEach((f: any) => {
          const key = f.name || f;
          if (!map.has(key)) map.set(key, { name: key, label: f.label || key, type: f.type || 'text', required: f.required });
        });
      });
      return Array.from(map.values());
    }
    return (doc.template?.fields || []) as FieldDef[];
  }, [doc, packDocs]);

  const handleSubmit = async () => {
    const missing = allFields.filter((f) => f.required && !values[f.name]?.trim());
    if (missing.length > 0) {
      toast.error(`Preencha: ${missing.map((m) => m.label).join(', ')}`);
      return;
    }
    setSubmitting(true);
    try {
      const body: any = { token, filled_data: values };
      if (packDocs.length > 0) {
        body.pack_filled_data = {};
        packDocs.forEach((d) => {
          const fs = (d.template?.fields || []) as FieldDef[];
          const fd: Record<string, string> = {};
          fs.forEach((f: any) => {
            const key = f.name || f;
            fd[key] = values[key] || '';
          });
          body.pack_filled_data[d.id] = fd;
        });
      }
      const { error } = await supabase.functions.invoke('public-document-fill', { body });
      if (error) throw error;
      setDone(true);
    } catch (e: any) {
      toast.error('Erro ao enviar: ' + (e.message || ''));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">Não foi possível carregar</h2>
            <p className="text-sm text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 text-center">
            <CheckCircle2 className="h-14 w-14 text-emerald-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Dados enviados!</h2>
            <p className="text-sm text-muted-foreground">
              Obrigado. Em breve você receberá o documento para assinatura.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getInputType = (t: string) => (t === 'email' ? 'email' : t === 'phone' ? 'tel' : t === 'number' ? 'number' : 'text');

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="text-center mb-6">
          <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-3">
            <FileText className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold">{doc.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Preencha os dados abaixo. Após enviar, o documento será preparado para assinatura.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Seus dados</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {allFields.map((field) => (
              <div key={field.name}>
                <Label className="text-sm">
                  {field.label}
                  {field.required && <span className="text-destructive ml-1">*</span>}
                </Label>
                {field.type === 'address' ? (
                  <Textarea
                    value={values[field.name] || ''}
                    onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
                    rows={2}
                    className="mt-1"
                  />
                ) : field.type === 'date' ? (
                  <DatePicker
                    value={values[field.name] || ''}
                    onChange={(v) => setValues((vs) => ({ ...vs, [field.name]: v }))}
                  />
                ) : (
                  <Input
                    type={getInputType(field.type)}
                    value={values[field.name] || ''}
                    onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
                    className="mt-1"
                  />
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <Button onClick={handleSubmit} disabled={submitting} size="lg" className="w-full">
          {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Enviando...</> : 'Enviar dados'}
        </Button>
      </div>
    </div>
  );
}
