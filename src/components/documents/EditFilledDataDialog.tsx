import { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  documentId: string;
  onSaved?: () => void;
}

interface DocData {
  id: string;
  organization_id: string;
  template_id: string | null;
  name: string;
  filled_data: Record<string, any>;
  template_fields: Array<{ name: string; label: string; type: string }>;
  template_content: string;
  template_content_html: string | null;
  template_logo: string | null;
}

interface SignerRow {
  id: string;
  signer_name: string;
  signer_email: string | null;
  signer_phone: string | null;
  signer_cpf: string | null;
  signed_at: string | null;
  signature_id: string | null;
  signature_token: string | null;
  signing_method: string;
  auth_methods: Record<string, boolean>;
  field_mapping: Record<string, string>;
}

export function EditFilledDataDialog({ open, onOpenChange, documentId, onSaved }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [doc, setDoc] = useState<DocData | null>(null);
  const [filled, setFilled] = useState<Record<string, string>>({});
  const [signers, setSigners] = useState<SignerRow[]>([]);
  const [originalSigners, setOriginalSigners] = useState<SignerRow[]>([]);
  const [hasSigned, setHasSigned] = useState(false);

  useEffect(() => {
    if (!open || !documentId) return;
    setLoading(true);
    (async () => {
      try {
        const { data: d } = await (supabase as any)
          .from('generated_documents')
          .select('id, organization_id, template_id, name, filled_data, document_templates(fields, content, content_html, logo_url)')
          .eq('id', documentId)
          .maybeSingle();
        if (!d) throw new Error('Documento não encontrado');

        const tpl = (d as any).document_templates || {};
        setDoc({
          id: d.id,
          organization_id: d.organization_id,
          template_id: d.template_id,
          name: d.name,
          filled_data: d.filled_data || {},
          template_fields: tpl.fields || [],
          template_content: tpl.content || '',
          template_content_html: tpl.content_html || null,
          template_logo: tpl.logo_url || null,
        });
        setFilled({ ...(d.filled_data || {}) });

        const { data: s } = await (supabase as any)
          .from('document_signers')
          .select('id, signer_name, signer_email, signer_phone, signer_cpf, signed_at, signature_id, signature_token, signing_method, auth_methods, field_mapping')
          .eq('generated_document_id', documentId)
          .order('order', { ascending: true });
        setSigners(s || []);
        setOriginalSigners(s || []);
        setHasSigned((s || []).some((x: SignerRow) => !!x.signed_at));
      } catch (e: any) {
        toast({ title: 'Não foi possível carregar', description: e.message, variant: 'destructive' });
        onOpenChange(false);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, documentId]);

  const updateSigner = (id: string, patch: Partial<SignerRow>) =>
    setSigners((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const updateAuthMethod = (id: string, key: string, value: boolean) =>
    setSigners((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, auth_methods: { ...(s.auth_methods || {}), [key]: value } } : s
      )
    );

  const applyValueReplacements = (
    currentFilled: Record<string, string>,
    oldValue?: string | null,
    newValue?: string | null,
    options: { phone?: boolean } = {},
  ) => {
    const oldRaw = String(oldValue || '').trim();
    const newRaw = String(newValue || '').trim();
    if (!oldRaw || !newRaw || oldRaw === newRaw) return currentFilled;

    const replacements: Array<[string, string]> = [[oldRaw, newRaw]];
    if (options.phone) {
      const oldDigits = oldRaw.replace(/\D/g, '');
      const newDigits = newRaw.replace(/\D/g, '');
      if (oldDigits && newDigits && oldDigits !== newDigits) {
        replacements.unshift([`+${oldDigits}`, `+${newDigits}`]);
        replacements.push([oldDigits, newDigits]);
      }
    }

    const next = { ...currentFilled };
    for (const [fieldName, value] of Object.entries(next)) {
      if (typeof value !== 'string') continue;
      let updated = value;
      for (const [from, to] of replacements) {
        updated = updated.split(from).join(to);
      }

      if (options.phone) {
        const oldDigits = oldRaw.replace(/\D/g, '');
        const newDigits = newRaw.replace(/\D/g, '');
        if (oldDigits && newDigits && value.replace(/\D/g, '') === oldDigits) {
          updated = value.trim().startsWith('+') ? `+${newDigits}` : newDigits;
        }
      }

      next[fieldName] = updated;
    }
    return next;
  };

  const applySignerMappings = (baseFilled: Record<string, string>) => {
    const next = { ...baseFilled };
    for (const s of signers) {
      const original = originalSigners.find((item) => item.id === s.id);
      const mapping = s.field_mapping || {};
      const values: Record<string, string | null> = {
        name: s.signer_name || null,
        email: s.signer_email || null,
        phone: s.signer_phone ? s.signer_phone.replace(/\D/g, '') : null,
        cpf: s.signer_cpf || null,
      };

      for (const [key, value] of Object.entries(values)) {
        const fieldName = mapping[key];
        if (fieldName && value !== null) next[fieldName] = value;
      }

      Object.assign(next, applyValueReplacements(next, original?.signer_name, s.signer_name));
      Object.assign(next, applyValueReplacements(next, original?.signer_email, s.signer_email));
      Object.assign(next, applyValueReplacements(next, original?.signer_cpf, s.signer_cpf));
      Object.assign(next, applyValueReplacements(next, original?.signer_phone, s.signer_phone, { phone: true }));
    }
    return next;
  };

  const buildSignatureMetadata = (s: SignerRow) => {
    const auth = s.auth_methods || {};
    const otpChannels = [
      auth.otp_email ? 'email' : null,
      auth.otp_whatsapp ? 'whatsapp' : null,
    ].filter(Boolean);

    return {
      require_selfie: auth.selfie === true,
      auth_methods: auth,
      otp_channel: otpChannels[0] || (s.signer_email ? 'email' : 'whatsapp'),
      otp_channels: otpChannels.length > 0 ? otpChannels : [s.signer_email ? 'email' : 'whatsapp'],
      from_signer_id: s.id,
    };
  };

  const save = async () => {
    if (!doc || hasSigned) return;
    setSaving(true);
    try {
      const nextFilled = applySignerMappings(filled);

      // 1) Regenerate PDF
      const pdfResp = await supabase.functions.invoke('generate-document-pdf', {
        body: {
          template_content: doc.template_content,
          template_content_html: doc.template_content_html,
          fields: doc.template_fields,
          filled_data: nextFilled,
          document_name: doc.name,
          logo_url: doc.template_logo,
        },
      });
      const newPdfUrl = (pdfResp as any)?.data?.pdf_url;
      if (!newPdfUrl) throw new Error('Falha ao regerar PDF');

      // 2) Update document
      await (supabase as any)
        .from('generated_documents')
        .update({ filled_data: nextFilled, pdf_url: newPdfUrl })
        .eq('id', doc.id);

      // 3) Update signers
      for (const s of signers) {
        const cleanPhone = s.signer_phone ? s.signer_phone.replace(/\D/g, '') : null;
        const metadata = buildSignatureMetadata(s);

        await (supabase as any)
          .from('document_signers')
          .update({
            signer_name: s.signer_name,
            signer_email: s.signer_email || null,
            signer_phone: cleanPhone,
            signer_cpf: s.signer_cpf || null,
            signing_method: s.signing_method || 'internal',
            auth_methods: s.auth_methods || { manuscrita: true },
          })
          .eq('id', s.id);

        const signaturePatch = {
          signer_name: s.signer_name,
          signer_email: s.signer_email || null,
          signer_phone: cleanPhone,
          signer_cpf: s.signer_cpf || null,
          signing_method: s.signing_method || 'internal',
          metadata,
        };

        if (s.signature_id) {
          await (supabase as any)
            .from('document_signatures')
            .update(signaturePatch)
            .eq('id', s.signature_id);
        } else if (s.signature_token) {
          await (supabase as any)
            .from('document_signatures')
            .update(signaturePatch)
            .eq('signature_token', s.signature_token);
        }
      }

      toast({ title: 'Dados atualizados', description: 'PDF regerado com as novas informações.' });
      setFilled(nextFilled);
      setOriginalSigners(signers);
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: 'Erro ao salvar', description: e.message || 'Tente novamente.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar dados do documento</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !doc ? null : hasSigned ? (
          <div className="p-4 rounded-md bg-amber-500/10 text-amber-700 text-sm">
            Este documento já tem assinaturas concluídas e não pode mais ser editado.
          </div>
        ) : (
          <div className="space-y-5">
            <Card className="p-4 space-y-3">
              <h3 className="text-sm font-semibold">Campos do documento</h3>
              {doc.template_fields.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sem campos configurados.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {doc.template_fields.map((f) => (
                    <div key={f.name}>
                      <Label className="text-xs">{f.label}</Label>
                      <Input
                        value={filled[f.name] || ''}
                        onChange={(e) => setFilled((p) => ({ ...p, [f.name]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="p-4 space-y-3">
              <h3 className="text-sm font-semibold">Signatários</h3>
              {signers.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum signatário.</p>
              ) : (
                signers.map((s) => (
                  <div key={s.id} className="space-y-2 p-3 rounded-md border bg-muted/30">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <Label className="text-xs">Nome</Label>
                        <Input value={s.signer_name} onChange={(e) => updateSigner(s.id, { signer_name: e.target.value })} />
                      </div>
                      <div>
                        <Label className="text-xs">CPF</Label>
                        <Input value={s.signer_cpf || ''} onChange={(e) => updateSigner(s.id, { signer_cpf: e.target.value })} />
                      </div>
                      <div>
                        <Label className="text-xs">E-mail</Label>
                        <Input type="email" value={s.signer_email || ''} onChange={(e) => updateSigner(s.id, { signer_email: e.target.value })} />
                      </div>
                      <div>
                        <Label className="text-xs">WhatsApp</Label>
                        <Input value={s.signer_phone || ''} onChange={(e) => updateSigner(s.id, { signer_phone: e.target.value })} placeholder="+1 415 555 2671" />
                      </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {[
                        ['manuscrita', 'Assinatura manuscrita'],
                        ['otp_email', 'Codigo por e-mail'],
                        ['otp_whatsapp', 'Codigo por WhatsApp'],
                        ['selfie', 'Selfie'],
                      ].map(([key, label]) => (
                        <label key={key} className="flex items-center justify-between rounded-md border bg-background px-3 py-2 text-xs">
                          <span>{label}</span>
                          <Switch
                            checked={!!s.auth_methods?.[key]}
                            onCheckedChange={(value) => updateAuthMethod(s.id, key, value)}
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </Card>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving || hasSigned || loading}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Salvar e regerar PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
