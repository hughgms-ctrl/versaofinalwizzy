import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, CheckCircle, FileText, Send, Info, Download, MessageCircle, Phone, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { DatePicker } from '@/components/ui/date-picker';

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
  auto_send_whatsapp?: boolean;
}

interface GeneratedDoc {
  id: string;
  name: string;
  pdf_url: string | null;
  template_name: string;
}

export default function PublicPackFormPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [loading, setLoading] = useState(true);
  const [packData, setPackData] = useState<PackData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [generatedDocs, setGeneratedDocs] = useState<GeneratedDoc[] | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);

  // Fixed identification fields
  const [signerName, setSignerName] = useState('');
  const [signerPhone, setSignerPhone] = useState('');

  // WhatsApp send state
  const [showWhatsAppInput, setShowWhatsAppInput] = useState(false);
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);
  const [whatsappSent, setWhatsappSent] = useState(false);

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

    // Validate fixed fields
    if (!signerName.trim()) {
      setError('Informe seu nome completo.');
      return;
    }
    if (!signerPhone.trim() || signerPhone.replace(/\D/g, '').length < 10) {
      setError('Informe um número de telefone válido.');
      return;
    }

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
        body: {
          action: 'submit',
          token,
          filled_data: formData,
          signer_name: signerName.trim(),
          signer_phone: signerPhone.replace(/\D/g, ''),
          auto_send_whatsapp: packData.auto_send_whatsapp || false,
        },
      });
      if (fnError || data?.error) throw new Error(data?.error || 'Erro ao enviar');
      setGeneratedDocs(data.documents || []);
      setOrganizationId(data.organization_id || null);
      // Pre-fill WhatsApp phone with the signer's phone
      setWhatsappPhone(signerPhone);
      // If auto-sent, mark as sent
      if (data.whatsapp_sent > 0) {
        setWhatsappSent(true);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendWhatsApp = async () => {
    if (!whatsappPhone.trim() || !generatedDocs || !organizationId) return;

    setSendingWhatsApp(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('public-pack-form', {
        body: {
          action: 'send_whatsapp',
          token,
          phone: whatsappPhone.replace(/\D/g, ''),
          document_ids: generatedDocs.map(d => d.id),
          organization_id: organizationId,
        },
      });
      if (fnError || data?.error) throw new Error(data?.error || 'Erro ao enviar');
      setWhatsappSent(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSendingWhatsApp(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error && !packData && !generatedDocs) {
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

  // ---- Results page after form submission ----
  if (generatedDocs) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b bg-card py-4 px-6">
          <div className="max-w-2xl mx-auto flex items-center gap-3">
            {packData?.organization?.logo_url && (
              <img src={packData.organization.logo_url} alt="" className="h-8 w-auto object-contain" />
            )}
            <div>
              <h1 className="text-lg font-semibold">{packData?.name}</h1>
              {packData?.organization?.name && (
                <p className="text-xs text-muted-foreground">{packData.organization.name}</p>
              )}
            </div>
          </div>
        </header>

        <main className="max-w-2xl mx-auto p-4 md:p-6">
          <div className="text-center mb-6">
            <CheckCircle className="h-12 w-12 mx-auto text-primary mb-3" />
            <h2 className="text-xl font-semibold">Documentos gerados com sucesso!</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {generatedDocs.length} documento{generatedDocs.length > 1 ? 's foram gerados' : ' foi gerado'} para <strong>{signerName}</strong>
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              {error}
            </div>
          )}

          <div className="space-y-3 mb-6">
            {generatedDocs.map((doc) => (
              <Card key={doc.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-primary shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{doc.template_name}</p>
                      <p className="text-xs text-muted-foreground">{doc.name}</p>
                    </div>
                  </div>
                  {doc.pdf_url ? (
                    <a
                      href={doc.pdf_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                    >
                      <Download className="h-4 w-4" />
                      Baixar PDF
                    </a>
                  ) : (
                    <Badge variant="secondary" className="text-xs">Processando...</Badge>
                  )}
                </div>
              </Card>
            ))}
          </div>

          {/* WhatsApp section */}
          <Card className="p-5">
            <div className="text-center">
              {!showWhatsAppInput && !whatsappSent && (
                <>
                  <MessageCircle className="h-8 w-8 mx-auto text-green-600 mb-2" />
                  <h3 className="text-base font-semibold mb-1">Receber documentos para assinatura</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Clique abaixo para receber os documentos diretamente no seu WhatsApp
                  </p>
                  <Button
                    onClick={() => setShowWhatsAppInput(true)}
                    className="bg-green-600 hover:bg-green-700 text-white gap-2"
                  >
                    <MessageCircle className="h-4 w-4" />
                    Receber pelo WhatsApp
                  </Button>
                </>
              )}

              {showWhatsAppInput && !whatsappSent && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 justify-center mb-2">
                    <MessageCircle className="h-5 w-5 text-green-600" />
                    <h3 className="text-base font-semibold">Confirme seu WhatsApp</h3>
                  </div>
                  <div className="flex gap-2 max-w-sm mx-auto">
                    <div className="relative flex-1">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="tel"
                        value={whatsappPhone}
                        onChange={e => setWhatsappPhone(e.target.value)}
                        placeholder="(11) 99999-9999"
                        className="pl-9"
                      />
                    </div>
                    <Button
                      onClick={handleSendWhatsApp}
                      disabled={sendingWhatsApp || !whatsappPhone.trim()}
                      className="bg-green-600 hover:bg-green-700 text-white gap-1.5"
                    >
                      {sendingWhatsApp ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      Enviar
                    </Button>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowWhatsAppInput(false)}
                    className="text-xs text-muted-foreground"
                  >
                    Cancelar
                  </Button>
                </div>
              )}

              {whatsappSent && (
                <div className="space-y-2">
                  <CheckCircle className="h-8 w-8 mx-auto text-green-600" />
                  <h3 className="text-base font-semibold">Documentos enviados!</h3>
                  <p className="text-sm text-muted-foreground">
                    Verifique seu WhatsApp para receber os documentos.
                  </p>
                </div>
              )}
            </div>
          </Card>
        </main>
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

        {/* Fixed identification fields */}
        <Card className="mb-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4" />
              Identificação
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-sm">
                Nome completo <span className="text-destructive">*</span>
              </Label>
              <Input
                value={signerName}
                onChange={e => setSignerName(e.target.value)}
                placeholder="Seu nome completo"
              />
            </div>
            <div>
              <Label className="text-sm">
                Telefone (WhatsApp) <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="tel"
                  value={signerPhone}
                  onChange={e => setSignerPhone(e.target.value)}
                  placeholder="(11) 99999-9999"
                  className="pl-9"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Dynamic fields from pack */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Preencha os dados dos documentos</CardTitle>
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
              Gerando documentos...
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