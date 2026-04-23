import { useState } from 'react';
import { Plus, Trash2, User, Mail, Phone, IdCard, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SignerInput } from '@/hooks/useDocumentSigners';
import { Badge } from '@/components/ui/badge';

const ROLES = ['Contratante', 'Contratada', 'Testemunha', 'Avalista', 'Procurador', 'Assinar'];

interface SignersManagerProps {
  signers: SignerInput[];
  onChange: (signers: SignerInput[]) => void;
}

export function SignersManager({ signers, onChange }: SignersManagerProps) {
  const updateSigner = (idx: number, patch: Partial<SignerInput>) => {
    const next = [...signers];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };

  const updateAuth = (idx: number, key: string, val: boolean) => {
    const next = [...signers];
    next[idx] = {
      ...next[idx],
      auth_methods: { ...(next[idx].auth_methods || { manuscrita: true }), [key]: val },
    };
    onChange(next);
  };

  const addSigner = () => {
    onChange([
      ...signers,
      {
        signer_name: '',
        signer_email: '',
        signer_phone: '',
        signer_cpf: '',
        signer_role: 'Assinar',
        auth_methods: { manuscrita: true, otp_email: true },
      },
    ]);
  };

  const removeSigner = (idx: number) => {
    onChange(signers.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold">Signatários</h4>
          <p className="text-[11px] text-muted-foreground">Todos assinam em paralelo (ordem livre)</p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={addSigner} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Signatário
        </Button>
      </div>

      {signers.length === 0 && (
        <Card className="p-6 text-center border-dashed">
          <User className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground mb-3">Nenhum signatário adicionado</p>
          <Button type="button" size="sm" onClick={addSigner} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Adicionar primeiro signatário
          </Button>
        </Card>
      )}

      {signers.map((signer, idx) => (
        <Card key={idx} className="p-4 space-y-3 relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">
                {idx + 1}
              </div>
              <Badge variant="outline" className="text-[10px]">{signer.signer_role || 'Assinar'}</Badge>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={() => removeSigner(idx)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-[11px] flex items-center gap-1"><User className="h-3 w-3" /> Nome completo *</Label>
              <Input
                value={signer.signer_name}
                onChange={(e) => updateSigner(idx, { signer_name: e.target.value })}
                placeholder="Nome do signatário"
                className="mt-1 h-9 text-sm"
              />
            </div>
            <div>
              <Label className="text-[11px] flex items-center gap-1"><Shield className="h-3 w-3" /> Função</Label>
              <Select
                value={signer.signer_role || 'Assinar'}
                onValueChange={(v) => updateSigner(idx, { signer_role: v })}
              >
                <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px] flex items-center gap-1"><Mail className="h-3 w-3" /> E-mail</Label>
              <Input
                type="email"
                value={signer.signer_email || ''}
                onChange={(e) => updateSigner(idx, { signer_email: e.target.value })}
                placeholder="email@exemplo.com"
                className="mt-1 h-9 text-sm"
              />
            </div>
            <div>
              <Label className="text-[11px] flex items-center gap-1"><Phone className="h-3 w-3" /> WhatsApp</Label>
              <Input
                value={signer.signer_phone || ''}
                onChange={(e) => updateSigner(idx, { signer_phone: e.target.value })}
                placeholder="(11) 99999-0000"
                className="mt-1 h-9 text-sm"
              />
            </div>
            <div className="md:col-span-2">
              <Label className="text-[11px] flex items-center gap-1"><IdCard className="h-3 w-3" /> CPF</Label>
              <Input
                value={signer.signer_cpf || ''}
                onChange={(e) => updateSigner(idx, { signer_cpf: e.target.value })}
                placeholder="000.000.000-00"
                className="mt-1 h-9 text-sm"
              />
            </div>
          </div>

          <div className="border-t pt-3">
            <div className="flex items-center gap-1.5 mb-2.5">
              <Shield className="h-3 w-3 text-muted-foreground" />
              <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Métodos de autenticação</Label>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
              {[
                { key: 'manuscrita', label: 'Assinatura manuscrita', icon: '✍️', default: true },
                { key: 'otp_email', label: 'Código por e-mail', icon: '📧', default: false },
                { key: 'otp_whatsapp', label: 'Código por WhatsApp', icon: '💬', default: false },
                { key: 'selfie', label: 'Selfie', icon: '📸', default: false },
                { key: 'cpf_simples', label: 'Validação de CPF', icon: '🆔', default: false },
              ].map((method) => {
                const checked = signer.auth_methods?.[method.key as keyof typeof signer.auth_methods] ?? method.default;
                return (
                  <label
                    key={method.key}
                    className={`flex items-center gap-2 text-xs cursor-pointer rounded-md border px-2.5 py-2 transition-colors ${
                      checked
                        ? 'border-primary/40 bg-primary/5 text-foreground'
                        : 'border-border bg-background hover:bg-muted/50 text-muted-foreground'
                    }`}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => updateAuth(idx, method.key, !!v)}
                      className="h-3.5 w-3.5"
                    />
                    <span className="text-sm leading-none">{method.icon}</span>
                    <span className="truncate">{method.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
