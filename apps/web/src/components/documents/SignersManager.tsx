import type { ReactNode } from 'react';
import { Plus, Trash2, User, Mail, Phone, IdCard, Shield, UserCog, FormInput, Wand2, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SignerInput, SignerFieldMapping } from '@/hooks/useDocumentSigners';
import { Badge } from '@/components/ui/badge';

const ROLES = ['Contratante', 'Contratada', 'Testemunha', 'Avalista', 'Procurador', 'Assinar'];

export interface AvailableField {
  name: string;
  label: string;
  type?: string;
}

interface SignersManagerProps {
  signers: SignerInput[];
  onChange: (signers: SignerInput[]) => void;
  /** Campos disponíveis no template/pack (usado quando data_source = 'form'). */
  availableFields?: AvailableField[];
}

const AUTH_METHODS = [
  { key: 'manuscrita',   label: 'Assinatura manuscrita', icon: '✍️', default: true  },
  { key: 'otp_email',    label: 'Código por e-mail',      icon: '📧', default: false },
  { key: 'otp_whatsapp', label: 'Código por WhatsApp',    icon: '💬', default: false },
  { key: 'selfie',       label: 'Selfie',                 icon: '📸', default: false },
  { key: 'cpf_simples',  label: 'Validação de CPF',       icon: '🆔', default: false },
] as const;

function autoDetectMapping(fields: AvailableField[]): SignerFieldMapping {
  const m: SignerFieldMapping = {};
  const find = (...keywords: string[]) => {
    for (const f of fields) {
      const hay = `${f.name} ${f.label}`.toLowerCase();
      if (keywords.some((k) => hay.includes(k))) return f.name;
    }
    return undefined;
  };
  m.name  = find('nome_cliente', 'cliente_nome', 'nome_completo', 'nome');
  m.email = find('email', 'e-mail');
  m.cpf   = find('cpf');
  m.phone = find('whatsapp', 'celular', 'telefone', 'phone');
  return m;
}

export function SignersManager({ signers, onChange, availableFields = [] }: SignersManagerProps) {
  const [openAuth, setOpenAuth] = useState<number | null>(null);

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

  const updateMapping = (idx: number, key: keyof SignerFieldMapping, value: string) => {
    const next = [...signers];
    next[idx] = {
      ...next[idx],
      field_mapping: { ...(next[idx].field_mapping || {}), [key]: value || undefined },
    };
    onChange(next);
  };

  const setDataSource = (idx: number, source: 'manual' | 'form') => {
    const next = [...signers];
    const current = next[idx];
    if (source === 'form') {
      const auto = autoDetectMapping(availableFields);
      next[idx] = { ...current, data_source: 'form', field_mapping: { ...auto, ...(current.field_mapping || {}) } };
    } else {
      next[idx] = { ...current, data_source: 'manual' };
    }
    onChange(next);
  };

  const addSigner = (source: 'manual' | 'form' = 'manual') => {
    const base: SignerInput = {
      signer_name: '',
      signer_email: '',
      signer_phone: '',
      signer_cpf: '',
      signer_role: 'Assinar',
      auth_methods: { manuscrita: true, otp_email: true },
      data_source: source,
      field_mapping: source === 'form' ? autoDetectMapping(availableFields) : {},
    };
    onChange([...signers, base]);
  };

  const removeSigner = (idx: number) => {
    onChange(signers.filter((_, i) => i !== idx));
    if (openAuth === idx) setOpenAuth(null);
  };

  const hasFormFields = availableFields.length > 0;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-foreground">Signatários</p>
          <p className="text-[10px] text-muted-foreground">Todos assinam em paralelo</p>
        </div>
        <div className="flex gap-1.5">
          <Button type="button" size="sm" variant="outline" onClick={() => addSigner('manual')} className="h-8 gap-1.5 text-xs">
            <UserCog className="h-3.5 w-3.5" />
            <span>Eu preencho</span>
          </Button>
          {hasFormFields && (
            <Button type="button" size="sm" variant="outline" onClick={() => addSigner('form')} className="h-8 gap-1.5 text-xs">
              <FormInput className="h-3.5 w-3.5" />
              <span>Cliente preenche</span>
            </Button>
          )}
        </div>
      </div>

      {/* Empty state */}
      {signers.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 py-6 rounded-lg border border-dashed text-center">
          <User className="h-7 w-7 text-muted-foreground/50" />
          <p className="text-xs text-muted-foreground">Nenhum signatário adicionado.</p>
        </div>
      )}

      {/* Signer cards */}
      {signers.map((signer, idx) => {
        const isFromForm = signer.data_source === 'form';
        const authOpen = openAuth === idx;

        return (
          <Card key={idx} className="overflow-hidden">
            {/* Card header strip */}
            <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-muted/40 border-b">
              <div className="flex items-center gap-2">
                <span className="h-5 w-5 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">
                  {idx + 1}
                </span>
                <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-normal">
                  {signer.signer_role || 'Assinar'}
                </Badge>
                {isFromForm ? (
                  <Badge className="text-[10px] h-5 px-1.5 font-normal bg-blue-500/10 text-blue-600 border-blue-300/40 hover:bg-blue-500/10">
                    <FormInput className="h-2.5 w-2.5 mr-1" /> Cliente preenche
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px] h-5 px-1.5 font-normal">
                    <UserCog className="h-2.5 w-2.5 mr-1" /> Dados fixos
                  </Badge>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                onClick={() => removeSigner(idx)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="p-4 space-y-4">
              {/* Row 1: Origem + Função */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Origem</Label>
                  <Select
                    value={signer.data_source || 'manual'}
                    onValueChange={(v) => setDataSource(idx, v as 'manual' | 'form')}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">
                        <span className="flex items-center gap-1.5"><UserCog className="h-3 w-3" /> Dados fixos</span>
                      </SelectItem>
                      <SelectItem value="form" disabled={!hasFormFields}>
                        <span className="flex items-center gap-1.5"><FormInput className="h-3 w-3" /> Do formulário</span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Função</Label>
                  <Select
                    value={signer.signer_role || 'Assinar'}
                    onValueChange={(v) => updateSigner(idx, { signer_role: v })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Row 2: Dados — manual */}
              {!isFromForm && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                      <User className="h-2.5 w-2.5" /> Nome *
                    </Label>
                    <Input
                      value={signer.signer_name}
                      onChange={(e) => updateSigner(idx, { signer_name: e.target.value })}
                      placeholder="Nome completo"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                      <Mail className="h-2.5 w-2.5" /> E-mail
                    </Label>
                    <Input
                      type="email"
                      value={signer.signer_email || ''}
                      onChange={(e) => updateSigner(idx, { signer_email: e.target.value })}
                      placeholder="email@exemplo.com"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                      <Phone className="h-2.5 w-2.5" /> WhatsApp
                    </Label>
                    <Input
                      value={signer.signer_phone || ''}
                      onChange={(e) => updateSigner(idx, { signer_phone: e.target.value })}
                      placeholder="+1 415 555 2671"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                      <IdCard className="h-2.5 w-2.5" /> CPF
                    </Label>
                    <Input
                      value={signer.signer_cpf || ''}
                      onChange={(e) => updateSigner(idx, { signer_cpf: e.target.value })}
                      placeholder="000.000.000-00"
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              )}

              {/* Row 2: Dados — mapeamento de formulário */}
              {isFromForm && (
                <div className="rounded-md bg-muted/40 p-3 space-y-3">
                  <div className="flex items-start gap-1.5">
                    <Wand2 className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      Vincule cada dado do signatário a um campo do formulário.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <FieldMapper icon={<User className="h-2.5 w-2.5" />} label="Nome *"
                      value={signer.field_mapping?.name}
                      onChange={(v) => updateMapping(idx, 'name', v)}
                      fields={availableFields} />
                    <FieldMapper icon={<Mail className="h-2.5 w-2.5" />} label="E-mail"
                      value={signer.field_mapping?.email}
                      onChange={(v) => updateMapping(idx, 'email', v)}
                      fields={availableFields} />
                    <FieldMapper icon={<Phone className="h-2.5 w-2.5" />} label="WhatsApp"
                      value={signer.field_mapping?.phone}
                      onChange={(v) => updateMapping(idx, 'phone', v)}
                      fields={availableFields} />
                    <FieldMapper icon={<IdCard className="h-2.5 w-2.5" />} label="CPF"
                      value={signer.field_mapping?.cpf}
                      onChange={(v) => updateMapping(idx, 'cpf', v)}
                      fields={availableFields} />
                  </div>
                </div>
              )}

              {/* Row 3: Autenticação — collapsible */}
              <div className="border-t pt-3">
                <button
                  type="button"
                  className="flex items-center justify-between w-full group"
                  onClick={() => setOpenAuth(authOpen ? null : idx)}
                >
                  <div className="flex items-center gap-1.5">
                    <Shield className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                      Autenticação
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      ({Object.entries(signer.auth_methods || {}).filter(([, v]) => v).length} ativa{Object.entries(signer.auth_methods || {}).filter(([, v]) => v).length !== 1 ? 's' : ''})
                    </span>
                  </div>
                  {authOpen
                    ? <ChevronUp className="h-3 w-3 text-muted-foreground" />
                    : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
                </button>

                {authOpen && (
                  <div className="mt-2.5 space-y-1.5">
                    {AUTH_METHODS.map((method) => {
                      const checked = signer.auth_methods?.[method.key as keyof typeof signer.auth_methods] ?? method.default;
                      return (
                        <div
                          key={method.key}
                          className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors"
                        >
                          <label htmlFor={`auth-${idx}-${method.key}`} className="flex items-center gap-2 text-xs cursor-pointer select-none">
                            <span>{method.icon}</span>
                            <span className={checked ? 'text-foreground' : 'text-muted-foreground'}>{method.label}</span>
                          </label>
                          <Switch
                            id={`auth-${idx}-${method.key}`}
                            checked={!!checked}
                            onCheckedChange={(v) => updateAuth(idx, method.key, v)}
                            className="scale-75 origin-right"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function FieldMapper({
  icon,
  label,
  value,
  onChange,
  fields,
}: {
  icon: ReactNode;
  label: string;
  value: string | undefined;
  onChange: (v: string) => void;
  fields: AvailableField[];
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
        {icon} {label}
      </Label>
      <Select value={value || '__none__'} onValueChange={(v) => onChange(v === '__none__' ? '' : v)}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder="— Não mapear —" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">
            <span className="text-muted-foreground">— Não mapear —</span>
          </SelectItem>
          {fields.map((f) => (
            <SelectItem key={f.name} value={f.name}>
              {f.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
