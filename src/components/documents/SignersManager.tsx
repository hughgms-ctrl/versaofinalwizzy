import type { ReactNode } from 'react';
import { Plus, Trash2, User, Mail, Phone, IdCard, Shield, UserCog, FormInput, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
  { key: 'manuscrita', label: 'Assinatura manuscrita', icon: '✍️', default: true },
  { key: 'otp_email', label: 'Código por e-mail', icon: '📧', default: false },
  { key: 'otp_whatsapp', label: 'Código por WhatsApp', icon: '💬', default: false },
  { key: 'selfie', label: 'Selfie', icon: '📸', default: false },
  { key: 'cpf_simples', label: 'Validação de CPF', icon: '🆔', default: false },
] as const;

// Heurística para sugerir mapeamento automático de variáveis comuns.
function autoDetectMapping(fields: AvailableField[]): SignerFieldMapping {
  const m: SignerFieldMapping = {};
  const find = (...keywords: string[]) => {
    for (const f of fields) {
      const hay = `${f.name} ${f.label}`.toLowerCase();
      if (keywords.some((k) => hay.includes(k))) return f.name;
    }
    return undefined;
  };
  m.name = find('nome_cliente', 'cliente_nome', 'nome_completo', 'nome');
  m.email = find('email', 'e-mail');
  m.cpf = find('cpf');
  m.phone = find('whatsapp', 'celular', 'telefone', 'phone');
  return m;
}

export function SignersManager({ signers, onChange, availableFields = [] }: SignersManagerProps) {
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
      // Sugerir mapeamento automático ao trocar para "do formulário"
      const auto = autoDetectMapping(availableFields);
      next[idx] = {
        ...current,
        data_source: 'form',
        field_mapping: { ...auto, ...(current.field_mapping || {}) },
      };
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
  };

  const hasFormFields = availableFields.length > 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h4 className="text-sm font-semibold">Signatários</h4>
          <p className="text-[11px] text-muted-foreground">Todos assinam em paralelo (ordem livre)</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => addSigner('manual')} className="gap-1.5">
            <UserCog className="h-3.5 w-3.5" /> Eu preencho
          </Button>
          {hasFormFields && (
            <Button type="button" size="sm" variant="outline" onClick={() => addSigner('form')} className="gap-1.5">
              <FormInput className="h-3.5 w-3.5" /> Cliente preenche
            </Button>
          )}
        </div>
      </div>

      {signers.length === 0 && (
        <Card className="p-6 text-center border-dashed">
          <User className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            Nenhum signatário adicionado. Use os botões acima para incluir.
          </p>
        </Card>
      )}

      {signers.map((signer, idx) => {
        const isFromForm = signer.data_source === 'form';
        return (
          <Card key={idx} className="p-4 space-y-3 relative">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">
                  {idx + 1}
                </div>
                <Badge variant="outline" className="text-[10px]">{signer.signer_role || 'Assinar'}</Badge>
                {isFromForm ? (
                  <Badge className="text-[10px] bg-accent text-accent-foreground hover:bg-accent border-accent">
                    <FormInput className="h-2.5 w-2.5 mr-1" /> Cliente preenche
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px]">
                    <UserCog className="h-2.5 w-2.5 mr-1" /> Dados fixos
                  </Badge>
                )}
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

            {/* Origem dos dados + Função */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label className="text-[11px] flex items-center gap-1">
                  <Wand2 className="h-3 w-3" /> Origem dos dados
                </Label>
                <Select
                  value={signer.data_source || 'manual'}
                  onValueChange={(v) => setDataSource(idx, v as 'manual' | 'form')}
                >
                  <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">
                      <div className="flex items-center gap-2">
                        <UserCog className="h-3.5 w-3.5" />
                        <span>Dados fixos (eu preencho agora)</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="form" disabled={!hasFormFields}>
                      <div className="flex items-center gap-2">
                        <FormInput className="h-3.5 w-3.5" />
                        <span>Do formulário (cliente preenche)</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
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
            </div>

            {/* Dados — manual OU mapeamento */}
            {!isFromForm ? (
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
                <div>
                  <Label className="text-[11px] flex items-center gap-1"><IdCard className="h-3 w-3" /> CPF</Label>
                  <Input
                    value={signer.signer_cpf || ''}
                    onChange={(e) => updateSigner(idx, { signer_cpf: e.target.value })}
                    placeholder="000.000.000-00"
                    className="mt-1 h-9 text-sm"
                  />
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-3">
                <div className="flex items-start gap-2">
                  <Wand2 className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                  <p className="text-[11px] text-muted-foreground">
                    Vincule cada dado do signatário a um campo do formulário. Sugerimos automaticamente — revise se precisar.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <FieldMapper
                    icon={<User className="h-3 w-3" />}
                    label="Nome completo *"
                    value={signer.field_mapping?.name}
                    onChange={(v) => updateMapping(idx, 'name', v)}
                    fields={availableFields}
                  />
                  <FieldMapper
                    icon={<Mail className="h-3 w-3" />}
                    label="E-mail"
                    value={signer.field_mapping?.email}
                    onChange={(v) => updateMapping(idx, 'email', v)}
                    fields={availableFields}
                  />
                  <FieldMapper
                    icon={<Phone className="h-3 w-3" />}
                    label="WhatsApp"
                    value={signer.field_mapping?.phone}
                    onChange={(v) => updateMapping(idx, 'phone', v)}
                    fields={availableFields}
                  />
                  <FieldMapper
                    icon={<IdCard className="h-3 w-3" />}
                    label="CPF"
                    value={signer.field_mapping?.cpf}
                    onChange={(v) => updateMapping(idx, 'cpf', v)}
                    fields={availableFields}
                  />
                </div>
              </div>
            )}

            {/* Métodos de autenticação */}
            <div className="border-t pt-3">
              <div className="flex items-center gap-1.5 mb-2.5">
                <Shield className="h-3 w-3 text-muted-foreground" />
                <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Métodos de autenticação</Label>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
                {AUTH_METHODS.map((method) => {
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
    <div>
      <Label className="text-[11px] flex items-center gap-1">{icon} {label}</Label>
      <Select value={value || '__none__'} onValueChange={(v) => onChange(v === '__none__' ? '' : v)}>
        <SelectTrigger className="mt-1 h-9 text-sm">
          <SelectValue placeholder="Selecionar campo do formulário" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">
            <span className="text-muted-foreground">— Não mapear —</span>
          </SelectItem>
          {fields.map((f) => (
            <SelectItem key={f.name} value={f.name}>
              {f.label} <span className="text-muted-foreground text-xs">({f.name})</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
