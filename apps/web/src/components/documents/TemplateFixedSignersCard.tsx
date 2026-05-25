import { useState } from 'react';
import { Plus, Trash2, Pencil, Users, Check, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  useTemplateFixedSigners,
  useUpsertTemplateFixedSigner,
  useDeleteTemplateFixedSigner,
  type TemplateFixedSigner,
  type TemplateFixedSignerInput,
} from '@/hooks/useTemplateFixedSigners';

interface Props {
  templateId: string | null;
}

const EMPTY: TemplateFixedSignerInput = {
  signer_name: '',
  signer_email: '',
  signer_phone: '',
  signer_cpf: '',
  signer_role: 'Assinar',
  auth_methods: { manuscrita: true, otp_email: true, selfie: true, otp_whatsapp: false },
  order: 0,
};

export function TemplateFixedSignersCard({ templateId }: Props) {
  const { data: signers = [] } = useTemplateFixedSigners(templateId);
  const upsert = useUpsertTemplateFixedSigner();
  const remove = useDeleteTemplateFixedSigner();

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TemplateFixedSignerInput>(EMPTY);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY, order: signers.length });
    setOpen(true);
  };

  const openEdit = (s: TemplateFixedSigner) => {
    setEditingId(s.id);
    setForm({
      signer_name: s.signer_name,
      signer_email: s.signer_email || '',
      signer_phone: s.signer_phone || '',
      signer_cpf: s.signer_cpf || '',
      signer_role: s.signer_role || 'Assinar',
      auth_methods: s.auth_methods || { manuscrita: true },
      order: s.order,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!templateId || !form.signer_name.trim()) return;
    await upsert.mutateAsync({
      id: editingId || undefined,
      template_id: templateId,
      data: {
        ...form,
        signer_email: form.signer_email || null,
        signer_phone: form.signer_phone || null,
        signer_cpf: form.signer_cpf || null,
      },
    });
    setOpen(false);
  };

  const setAuth = (key: keyof TemplateFixedSignerInput['auth_methods'], v: boolean) =>
    setForm((f) => ({ ...f, auth_methods: { ...f.auth_methods, [key]: v } }));

  if (!templateId) {
    return (
      <Card className="p-4">
        <h3 className="font-medium text-sm mb-1 flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" /> Signatários fixos
        </h3>
        <p className="text-xs text-muted-foreground">
          Salve o modelo primeiro para configurar quem sempre assina junto.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-medium text-sm flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" /> Signatários fixos
          </h3>
          <p className="text-[11px] text-muted-foreground">
            Pessoas que sempre assinam quando este modelo for preenchido.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={openCreate}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Novo
        </Button>
      </div>

      {signers.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">Nenhum signatário fixo cadastrado.</p>
      ) : (
        <div className="space-y-2">
          {signers.map((s, idx) => (
            <div
              key={s.id}
              className="flex items-center gap-2 p-2 rounded-md border bg-muted/30 group"
            >
              <div className="h-6 w-6 rounded-full bg-primary/10 text-primary text-[10px] font-semibold flex items-center justify-center shrink-0">
                {idx + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{s.signer_name}</p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {s.signer_role || 'Assinar'} · {s.signer_email || s.signer_phone || 'sem contato'}
                </p>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(s)}>
                <Pencil className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive"
                onClick={() => remove.mutate(s.id)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar signatário' : 'Novo signatário fixo'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nome completo *</Label>
              <Input
                value={form.signer_name}
                onChange={(e) => setForm((f) => ({ ...f, signer_name: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">CPF</Label>
                <Input
                  value={form.signer_cpf || ''}
                  onChange={(e) => setForm((f) => ({ ...f, signer_cpf: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-xs">Papel</Label>
                <Input
                  value={form.signer_role || ''}
                  onChange={(e) => setForm((f) => ({ ...f, signer_role: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">E-mail</Label>
              <Input
                type="email"
                value={form.signer_email || ''}
                onChange={(e) => setForm((f) => ({ ...f, signer_email: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs">WhatsApp / Telefone</Label>
              <Input
                value={form.signer_phone || ''}
                onChange={(e) => setForm((f) => ({ ...f, signer_phone: e.target.value }))}
                placeholder="+1 415 555 2671"
              />
            </div>

            <div className="rounded-md border p-3 space-y-2">
              <p className="text-xs font-medium">Autenticação exigida</p>
              <div className="flex items-center justify-between">
                <Label className="text-xs">Assinatura manuscrita</Label>
                <Switch checked={!!form.auth_methods.manuscrita} onCheckedChange={(v) => setAuth('manuscrita', v)} />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs">Código por e-mail</Label>
                <Switch checked={!!form.auth_methods.otp_email} onCheckedChange={(v) => setAuth('otp_email', v)} />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs">Código por WhatsApp</Label>
                <Switch checked={!!form.auth_methods.otp_whatsapp} onCheckedChange={(v) => setAuth('otp_whatsapp', v)} />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs">Selfie</Label>
                <Switch checked={!!form.auth_methods.selfie} onCheckedChange={(v) => setAuth('selfie', v)} />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              <X className="h-4 w-4 mr-1" /> Cancelar
            </Button>
            <Button onClick={save} disabled={!form.signer_name.trim() || upsert.isPending}>
              <Check className="h-4 w-4 mr-1" /> Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
