import { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
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
}

export function EditFilledDataDialog({ open, onOpenChange, documentId, onSaved }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [doc, setDoc] = useState<DocData | null>(null);
  const [filled, setFilled] = useState<Record<string, string>>({});
  const [signers, setSigners] = useState<SignerRow[]>([]);
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
          .select('id, signer_name, signer_email, signer_phone, signer_cpf, signed_at, signature_id')
          .eq('generated_document_id', documentId)
          .order('order', { ascending: true });
        setSigners(s || []);
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

  const save = async () => {
    if (!doc || hasSigned) return;
    setSaving(true);
    try {
      // 1) Regenerate PDF
      const { data: supabaseUrl } = { data: import.meta.env.VITE_SUPABASE_URL as string };
      const pdfResp = await supabase.functions.invoke('generate-document-pdf', {
        body: {
          template_content: doc.template_content,
          template_content_html: doc.template_content_html,
          fields: doc.template_fields,
          filled_data: filled,
          document_name: doc.name,
          logo_url: doc.template_logo,
        },
      });
      const newPdfUrl = (pdfResp as any)?.data?.pdf_url;
      if (!newPdfUrl) throw new Error('Falha ao regerar PDF');

      // 2) Update document
      await (supabase as any)
        .from('generated_documents')
        .update({ filled_data: filled, pdf_url: newPdfUrl })
        .eq('id', doc.id);

      // 3) Update signers
      for (const s of signers) {
        await (supabase as any)
          .from('document_signers')
          .update({
            signer_name: s.signer_name,
            signer_email: s.signer_email || null,
            signer_phone: s.signer_phone ? s.signer_phone.replace(/\D/g, '') : null,
            signer_cpf: s.signer_cpf || null,
          })
          .eq('id', s.id);

        if (s.signature_id) {
          await (supabase as any)
            .from('document_signatures')
            .update({
              signer_name: s.signer_name,
              signer_email: s.signer_email || null,
              signer_phone: s.signer_phone ? s.signer_phone.replace(/\D/g, '') : null,
              signer_cpf: s.signer_cpf || null,
            })
            .eq('id', s.signature_id);
        }
      }

      toast({ title: 'Dados atualizados', description: 'PDF regerado com as novas informações.' });
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
