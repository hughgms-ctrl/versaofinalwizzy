import { useState, useMemo } from 'react';
import { ArrowLeft, Save, Link2, GripVertical, Pencil, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useCreateDocumentPack, useUpdateDocumentPack, DocumentPack } from '@/hooks/useDocumentPacks';
import { useDocumentTemplates } from '@/hooks/useDocumentTemplates';

interface PackEditorProps {
  pack: DocumentPack | null;
  onBack: () => void;
}

export interface PackFieldConfig {
  originalName: string;
  label: string;
  description: string;
  type: string;
  required: boolean;
  sourceTemplateIds: string[];
}

export function PackEditor({ pack, onBack }: PackEditorProps) {
  const { data: templates } = useDocumentTemplates();
  const createPack = useCreateDocumentPack();
  const updatePack = useUpdateDocumentPack();
  const isEditing = !!pack;

  const [name, setName] = useState(pack?.name || '');
  const [description, setDescription] = useState(pack?.description || '');
  const [selectedIds, setSelectedIds] = useState<string[]>(pack?.template_ids || []);
  const [fieldConfigs, setFieldConfigs] = useState<PackFieldConfig[]>(
    (pack as any)?.field_config || []
  );
  const [expandedField, setExpandedField] = useState<string | null>(null);

  const toggleTemplate = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  // Collect all fields from selected templates
  const allFields = useMemo(() => {
    if (!templates) return [];

    const fieldMap = new Map<string, { name: string; count: number; templateNames: string[]; templateIds: string[] }>();

    selectedIds.forEach(templateId => {
      const template = templates.find(t => t.id === templateId);
      if (!template) return;

      const fields = (template.fields as any[]) || [];
      fields.forEach((field: any) => {
        const fieldName = field.name || field;
        if (!fieldMap.has(fieldName)) {
          fieldMap.set(fieldName, { name: fieldName, count: 0, templateNames: [], templateIds: [] });
        }
        const entry = fieldMap.get(fieldName)!;
        entry.count++;
        entry.templateNames.push(template.name);
        entry.templateIds.push(template.id);
      });
    });

    return Array.from(fieldMap.values());
  }, [templates, selectedIds]);

  // Merge field configs with detected fields
  const mergedFields = useMemo(() => {
    return allFields.map(f => {
      const existing = fieldConfigs.find(c => c.originalName === f.name);
      return {
        originalName: f.name,
        label: existing?.label || f.name,
        description: existing?.description || '',
        type: existing?.type || 'text',
        required: existing?.required ?? true,
        sourceTemplateIds: f.templateIds,
        count: f.count,
        templateNames: f.templateNames,
      };
    });
  }, [allFields, fieldConfigs]);

  const updateFieldConfig = (originalName: string, updates: Partial<PackFieldConfig>) => {
    setFieldConfigs(prev => {
      const idx = prev.findIndex(c => c.originalName === originalName);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], ...updates };
        return updated;
      }
      const field = mergedFields.find(f => f.originalName === originalName);
      return [...prev, {
        originalName,
        label: field?.label || originalName,
        description: field?.description || '',
        type: field?.type || 'text',
        required: field?.required ?? true,
        sourceTemplateIds: field?.sourceTemplateIds || [],
        ...updates,
      }];
    });
  };

  const handleSave = () => {
    if (!name.trim() || selectedIds.length === 0) return;

    // Build final field configs from merged state
    const finalConfigs: PackFieldConfig[] = mergedFields.map(f => ({
      originalName: f.originalName,
      label: f.label,
      description: f.description,
      type: f.type,
      required: f.required,
      sourceTemplateIds: f.sourceTemplateIds,
    }));

    const payload: any = {
      name,
      description: description || null,
      template_ids: selectedIds,
      field_config: finalConfigs,
    };

    if (isEditing) {
      updatePack.mutate({ id: pack.id, ...payload }, { onSuccess: onBack });
    } else {
      createPack.mutate(payload, { onSuccess: onBack });
    }
  };

  const sharedFields = mergedFields.filter(f => f.count > 1);
  const uniqueFields = mergedFields.filter(f => f.count === 1);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
        </Button>
        <Button onClick={handleSave} disabled={!name.trim() || selectedIds.length === 0}>
          <Save className="h-4 w-4 mr-2" /> {isEditing ? 'Salvar' : 'Criar pack'}
        </Button>
      </div>

      <div className="grid gap-4 max-w-lg">
        <div>
          <Label>Nome do pack</Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Pack Auxílio Reclusão" />
        </div>
        <div>
          <Label>Descrição (opcional)</Label>
          <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Breve descrição" />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <Label>Selecione os templates</Label>
          <div className="grid gap-2 mt-2">
            {templates?.map(t => (
              <Card
                key={t.id}
                className={`p-3 cursor-pointer transition-colors ${selectedIds.includes(t.id) ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
                onClick={() => toggleTemplate(t.id)}
              >
                <div className="flex items-center gap-3">
                  <Checkbox checked={selectedIds.includes(t.id)} />
                  <div>
                    <p className="text-sm font-medium">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{(t.fields as any[])?.length || 0} campos</p>
                  </div>
                </div>
              </Card>
            )) || (
              <p className="text-sm text-muted-foreground">Nenhum template disponível.</p>
            )}
          </div>
        </div>

        {/* Field Configuration Panel */}
        {selectedIds.length >= 1 && mergedFields.length > 0 && (
          <div>
            <Label>Configuração dos campos ({mergedFields.length})</Label>
            <p className="text-xs text-muted-foreground mt-1 mb-3">
              Configure label, descrição e tipo de cada campo. Campos com o mesmo nome são automaticamente compartilhados entre documentos.
            </p>

            <div className="space-y-2">
              {sharedFields.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-primary font-medium">
                    <Link2 className="h-3.5 w-3.5" />
                    Campos compartilhados ({sharedFields.length})
                  </div>
                  {sharedFields.map(field => (
                    <FieldConfigCard
                      key={field.originalName}
                      field={field}
                      isExpanded={expandedField === field.originalName}
                      onToggle={() => setExpandedField(
                        expandedField === field.originalName ? null : field.originalName
                      )}
                      onUpdate={(updates) => updateFieldConfig(field.originalName, updates)}
                    />
                  ))}
                </div>
              )}

              {uniqueFields.length > 0 && (
                <div className="space-y-2 mt-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                    Campos únicos ({uniqueFields.length})
                  </div>
                  {uniqueFields.map(field => (
                    <FieldConfigCard
                      key={field.originalName}
                      field={field}
                      isExpanded={expandedField === field.originalName}
                      onToggle={() => setExpandedField(
                        expandedField === field.originalName ? null : field.originalName
                      )}
                      onUpdate={(updates) => updateFieldConfig(field.originalName, updates)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FieldConfigCard({
  field,
  isExpanded,
  onToggle,
  onUpdate,
}: {
  field: {
    originalName: string;
    label: string;
    description: string;
    type: string;
    required: boolean;
    count: number;
    templateNames: string[];
  };
  isExpanded: boolean;
  onToggle: () => void;
  onUpdate: (updates: Partial<PackFieldConfig>) => void;
}) {
  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <Card className="p-0 overflow-hidden">
        <CollapsibleTrigger className="w-full p-3 flex items-center gap-2 hover:bg-muted/50 transition-colors text-left">
          <GripVertical className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium truncate">{field.label}</span>
              {field.count > 1 && (
                <Badge variant="default" className="text-[10px] px-1.5 py-0">
                  {field.count} docs
                </Badge>
              )}
              {field.required && (
                <span className="text-destructive text-xs">*</span>
              )}
            </div>
            {field.description && (
              <p className="text-xs text-muted-foreground truncate">{field.description}</p>
            )}
          </div>
          <Pencil className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-3 pb-3 pt-1 border-t space-y-3">
            <div>
              <Label className="text-xs">Label (como aparece no formulário)</Label>
              <Input
                value={field.label}
                onChange={e => onUpdate({ label: e.target.value })}
                placeholder={field.originalName}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Descrição / instrução para o cliente</Label>
              <Textarea
                value={field.description}
                onChange={e => onUpdate({ description: e.target.value })}
                placeholder="Ex: Informe o nome completo conforme RG"
                className="text-sm min-h-[60px]"
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Tipo</Label>
                <select
                  value={field.type}
                  onChange={e => onUpdate({ type: e.target.value })}
                  className="w-full h-8 text-sm rounded-md border border-input bg-background px-2"
                >
                  <option value="text">Texto</option>
                  <option value="date">Data</option>
                  <option value="email">E-mail</option>
                  <option value="phone">Telefone</option>
                  <option value="number">Número</option>
                  <option value="address">Endereço</option>
                  <option value="cpf">CPF</option>
                </select>
              </div>
              <div className="flex items-end gap-2 pb-1">
                <Checkbox
                  id={`req-${field.originalName}`}
                  checked={field.required}
                  onCheckedChange={(checked) => onUpdate({ required: !!checked })}
                />
                <Label htmlFor={`req-${field.originalName}`} className="text-xs">Obrigatório</Label>
              </div>
            </div>
            {field.count > 1 && (
              <div className="flex items-start gap-1.5 p-2 rounded bg-primary/5 text-xs text-primary">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>Presente em: {field.templateNames.join(', ')}</span>
              </div>
            )}
            <div className="text-[10px] text-muted-foreground">
              Nome original: <code className="bg-muted px-1 rounded">{field.originalName}</code>
            </div>
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
