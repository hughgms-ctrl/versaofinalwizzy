import { useState, useMemo, useEffect, useRef } from 'react';
import { ArrowLeft, Save, Plus, X, Tag, MessageCircle, Image as ImageIcon, ChevronDown, ChevronUp, MessageSquare, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useCreateDocumentTemplate, useUpdateDocumentTemplate, DocumentTemplate } from '@/hooks/useDocumentTemplates';
import { RichTextEditor } from '@/components/documents/RichTextEditor';
import { SignersManager } from '@/components/documents/SignersManager';
import { SignerInput } from '@/hooks/useDocumentSigners';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { useSignedContactFileUrl } from './templateAssets';

interface TemplateEditorProps {
  template: DocumentTemplate | null;
  onBack: () => void;
}

const CATEGORIES = ['contrato', 'procuração', 'declaração', 'petição', 'requerimento', 'outro'];
const FIELD_TYPES: Array<{ value: string; label: string }> = [
  { value: 'text', label: 'Texto' },
  { value: 'date', label: 'Data' },
  { value: 'cpf', label: 'CPF' },
  { value: 'cnpj', label: 'CNPJ' },
  { value: 'phone', label: 'Telefone' },
  { value: 'email', label: 'E-mail' },
  { value: 'currency', label: 'Valor (R$)' },
  { value: 'number', label: 'Número' },
  { value: 'address', label: 'Endereço (multi-linha)' },
];

function htmlToPlainText(html: string): string {
  if (!html) return '';
  const div = document.createElement('div');
  div.innerHTML = html;
  // Inserir quebras para blocos
  div.querySelectorAll('p, br, h1, h2, h3, li').forEach((el) => {
    el.append('\n');
  });
  return (div.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
}

function plainTextToHtml(text: string): string {
  if (!text) return '<p></p>';
  return text
    .split(/\n/)
    .map((line) => `<p>${line || '<br>'}</p>`)
    .join('');
}

export function TemplateEditor({ template, onBack }: TemplateEditorProps) {
  const { profile } = useAuth();
  const createTemplate = useCreateDocumentTemplate();
  const updateTemplate = useUpdateDocumentTemplate();
  const isEditing = !!template;

  const initialHtml = useMemo(() => {
    if (template?.content_html) return template.content_html;
    if (template?.content) return plainTextToHtml(template.content);
    return '<p></p>';
  }, [template]);

  const [name, setName] = useState(template?.name || '');
  const [description, setDescription] = useState(template?.description || '');
  const [category, setCategory] = useState(template?.category || '');
  const [contentHtml, setContentHtml] = useState<string>(initialHtml);
  const [logoUrl, setLogoUrl] = useState<string | null>(template?.logo_url || null);
  const [orgLogoUrl, setOrgLogoUrl] = useState<string | null>(null);
  // Exibição do logo: contact-files é privado (Fase B) → assinar on-read. logoUrl
  // continua CRU (usado no save e passado ao RichTextEditor).
  const displayLogoUrl = useSignedContactFileUrl(logoUrl);
  const [fields, setFields] = useState<Array<{ name: string; label: string; type: string; required: boolean; hint?: string }>>(
    template?.fields || [],
  );
  const [autoSendWhatsApp, setAutoSendWhatsApp] = useState(template?.auto_send_whatsapp || false);
  const [defaultSigners, setDefaultSigners] = useState<SignerInput[]>(
    ((template as any)?.default_signers as SignerInput[]) || []
  );
  const [newFieldName, setNewFieldName] = useState('');
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Load org logo
  useEffect(() => {
    if (!profile?.organization_id) return;
    (async () => {
      const { data } = await (supabase as any)
        .from('organizations')
        .select('logo_url')
        .eq('id', profile.organization_id)
        .maybeSingle();
      if (data?.logo_url) setOrgLogoUrl(data.logo_url);
    })();
  }, [profile?.organization_id]);

  const handleAddField = () => {
    if (!newFieldName.trim()) return;
    const fieldName = newFieldName.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    if (!fieldName || fields.some((f) => f.name === fieldName)) return;
    setFields([...fields, { name: fieldName, label: newFieldName.trim(), type: 'text', required: true }]);
    setNewFieldName('');
  };

  const handleRemoveField = (fieldName: string) => {
    setFields(fields.filter((f) => f.name !== fieldName));
  };

  const handleChangeFieldType = (fieldName: string, type: string) => {
    setFields((prev) => prev.map((f) => (f.name === fieldName ? { ...f, type } : f)));
  };

  const handleChangeFieldLabel = (fieldName: string, label: string) => {
    setFields((prev) => prev.map((f) => (f.name === fieldName ? { ...f, label } : f)));
  };

  const handleChangeFieldHint = (fieldName: string, hint: string) => {
    setFields((prev) => prev.map((f) => (f.name === fieldName ? { ...f, hint: hint || undefined } : f)));
  };

  const handleLogoUpload = async (file: File) => {
    if (!profile?.organization_id) return;
    try {
      const safe = file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${profile.organization_id}/template-logos/${Date.now()}-${safe}`;
      const { error } = await supabase.storage.from('contact-files').upload(path, file);
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('contact-files').getPublicUrl(path);
      setLogoUrl(urlData.publicUrl);
      toast.success('Logo enviada');
    } catch (e: any) {
      toast.error('Erro ao enviar logo: ' + e.message);
    }
  };

  const handleSave = () => {
    if (!name.trim()) return;
    const plainContent = htmlToPlainText(contentHtml);
    const payload = {
      name,
      description: description || null,
      category: category || null,
      content: plainContent,
      content_html: contentHtml,
      logo_url: logoUrl,
      fields,
      auto_send_whatsapp: autoSendWhatsApp,
      default_signers: defaultSigners,
    } as any;

    if (isEditing) {
      updateTemplate.mutate({ id: template.id, ...payload }, { onSuccess: onBack });
    } else {
      createTemplate.mutate(payload, { onSuccess: onBack });
    }
  };

  // Detect placeholders used in content
  const extractedFields = useMemo(() => {
    const matches = contentHtml.match(/\{\{\s*([^}\s]+)\s*\}\}/g) || [];
    return matches.map((m) => m.replace(/[{}\s]/g, ''));
  }, [contentHtml]);
  const missingFields = extractedFields.filter((f) => !fields.some((field) => field.name === f));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
        <Button onClick={handleSave} disabled={!name.trim() || createTemplate.isPending || updateTemplate.isPending}>
          <Save className="h-4 w-4 mr-2" />
          {isEditing ? 'Salvar alterações' : 'Criar template'}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main editor */}
        <div className="lg:col-span-2 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Nome do template</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Contrato de Honorários" />
            </div>
            <div>
              <Label>Categoria</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar categoria" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Descrição (opcional)</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Breve descrição do template"
            />
          </div>

          <Card className="p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <MessageCircle className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-medium">Enviar automaticamente pelo WhatsApp</p>
                  <p className="text-xs text-muted-foreground">
                    No formulário público deste documento, envia automaticamente ao finalizar.
                  </p>
                </div>
              </div>
              <Switch checked={autoSendWhatsApp} onCheckedChange={setAutoSendWhatsApp} />
            </div>
          </Card>

          <div>
            <Label>Conteúdo do template</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Use a barra de ferramentas para formatar. Clique em "{'{{ Variável }}'}" para inserir um campo, ou nos campos
              ao lado.
            </p>
            <RichTextEditor
              value={contentHtml}
              onChange={setContentHtml}
              fields={fields}
              organizationLogoUrl={logoUrl || orgLogoUrl}
            />
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Logo */}
          <Card className="p-4">
            <h3 className="font-medium text-sm mb-3">Logo do template</h3>
            {logoUrl ? (
              <div className="flex items-center gap-3 p-3 border rounded-lg bg-white">
                <img src={displayLogoUrl || logoUrl} alt="Logo" className="h-12 w-auto max-w-[160px] object-contain" />
                <Button variant="ghost" size="icon" onClick={() => setLogoUrl(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => logoInputRef.current?.click()}
                className="w-full border-2 border-dashed border-border rounded-lg p-4 text-center hover:border-primary/50 transition-colors"
              >
                <ImageIcon className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
                <p className="text-xs text-muted-foreground">Clique para selecionar</p>
                {orgLogoUrl && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Sem logo específica, usaremos a da organização.
                  </p>
                )}
              </button>
            )}
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleLogoUpload(f);
                e.target.value = '';
              }}
            />
          </Card>

          {/* Signatários padrão */}
          <Card className="p-4">
            <h3 className="font-medium text-sm mb-3">Signatários padrão</h3>
            <p className="text-[11px] text-muted-foreground mb-3">
              Configuração padrão de quem assina. Será carregada automaticamente ao gerar um documento.
            </p>
            <SignersManager
              signers={defaultSigners}
              onChange={setDefaultSigners}
              availableFields={fields.map((f) => ({ name: f.name, label: f.label, type: f.type }))}
            />
          </Card>

          {/* Fields */}
          <Card className="p-4">
            <h3 className="font-medium text-sm mb-3">Campos variáveis</h3>
            <div className="flex gap-2 mb-3">
              <Input
                value={newFieldName}
                onChange={(e) => setNewFieldName(e.target.value)}
                placeholder="Nome do campo"
                onKeyDown={(e) => e.key === 'Enter' && handleAddField()}
                className="text-sm"
              />
              <Button size="sm" variant="outline" onClick={handleAddField}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-2">
              {fields.map((field) => (
                <FieldEditorRow
                  key={field.name}
                  field={field}
                  fieldTypes={FIELD_TYPES}
                  onChangeLabel={(v) => handleChangeFieldLabel(field.name, v)}
                  onChangeType={(v) => handleChangeFieldType(field.name, v)}
                  onChangeHint={(v) => handleChangeFieldHint(field.name, v)}
                  onRemove={() => handleRemoveField(field.name)}
                />
              ))}
            </div>
            {fields.length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhum campo adicionado ainda.</p>
            )}
          </Card>

          {missingFields.length > 0 && (
            <Card className="p-4 border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
              <h3 className="font-medium text-sm mb-2 text-amber-800 dark:text-amber-200">
                Campos no texto sem registro
              </h3>
              <p className="text-xs text-muted-foreground mb-2">
                Estes campos estão no texto mas não foram adicionados:
              </p>
              <div className="flex flex-wrap gap-1">
                {missingFields.map((f) => (
                  <Badge
                    key={f}
                    variant="outline"
                    className="cursor-pointer text-xs border-amber-300"
                    onClick={() => setFields([...fields, { name: f, label: f, type: 'text', required: true }])}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    {f}
                  </Badge>
                ))}
              </div>
            </Card>
          )}

          <Card className="p-4">
            <h3 className="font-medium text-sm mb-2">Resumo</h3>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>Campos registrados: {fields.length}</p>
              <p>Campos no texto: {extractedFields.length}</p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─── Field editor row ─────────────────────────────────────────────────────────
interface FieldEditorRowProps {
  field: { name: string; label: string; type: string; required: boolean; hint?: string };
  fieldTypes: Array<{ value: string; label: string }>;
  onChangeLabel: (v: string) => void;
  onChangeType: (v: string) => void;
  onChangeHint: (v: string) => void;
  onRemove: () => void;
}

function FieldEditorRow({ field, fieldTypes, onChangeLabel, onChangeType, onChangeHint, onRemove }: FieldEditorRowProps) {
  const [hintOpen, setHintOpen] = useState(false);
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState(field.label);

  const commitLabel = () => {
    const trimmed = labelDraft.trim();
    if (trimmed) onChangeLabel(trimmed);
    else setLabelDraft(field.label);
    setEditingLabel(false);
  };

  return (
    <div className="rounded-md border bg-muted/40 overflow-hidden">
      {/* Main row */}
      <div className="flex items-center gap-2 px-2 py-1.5">
        <Tag className="h-3 w-3 text-muted-foreground shrink-0" />

        {/* Label editable */}
        <div className="flex-1 min-w-0">
          {editingLabel ? (
            <input
              autoFocus
              className="w-full bg-transparent text-xs font-medium outline-none border-b border-primary pb-0.5"
              value={labelDraft}
              onChange={(e) => setLabelDraft(e.target.value)}
              onBlur={commitLabel}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitLabel();
                if (e.key === 'Escape') { setLabelDraft(field.label); setEditingLabel(false); }
              }}
            />
          ) : (
            <button
              type="button"
              className="flex items-center gap-1 group text-left w-full"
              onClick={() => { setLabelDraft(field.label); setEditingLabel(true); }}
            >
              <span className="text-xs font-medium truncate">{field.label}</span>
              <Pencil className="h-2.5 w-2.5 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0 transition-opacity" />
            </button>
          )}
          <div className="text-[10px] text-muted-foreground font-mono">{`{{${field.name}}}`}</div>
        </div>

        {/* Type selector */}
        <Select value={field.type} onValueChange={onChangeType}>
          <SelectTrigger className="h-7 text-xs w-[100px] shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {fieldTypes.map((t) => (
              <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Hint toggle */}
        <button
          type="button"
          title="Observação / ajuda de preenchimento"
          onClick={() => setHintOpen((o) => !o)}
          className={`shrink-0 rounded p-1 transition-colors ${
            field.hint ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <MessageSquare className="h-3.5 w-3.5" />
        </button>

        {/* Remove */}
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onRemove}>
          <X className="h-3 w-3" />
        </Button>
      </div>

      {/* Hint row — collapsible */}
      {hintOpen && (
        <div className="px-3 pb-2.5 pt-1 border-t bg-background/60">
          <label className="flex items-center gap-1 text-[10px] text-muted-foreground mb-1">
            <MessageSquare className="h-2.5 w-2.5" /> Observação (exibida como dica ao preencher)
          </label>
          <input
            className="w-full rounded-md border bg-muted/50 px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary/50"
            placeholder="Ex: Informe o CPF somente números"
            value={field.hint || ''}
            onChange={(e) => onChangeHint(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}
